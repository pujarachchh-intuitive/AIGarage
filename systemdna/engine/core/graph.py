"""
graph.py — Neo4j GraphStore.
Builds the knowledge graph, serves the Graph JSON matching types.ts Graph interface,
and provides BFS traversal for impact analysis.
"""
import json
import os
from datetime import datetime, timezone
from typing import Optional

from neo4j import GraphDatabase

# Hardcoded 8 layers — used in to_json(). Must match types.ts LayerDef.
LAYER_DEFS = [
    {"id": "database",   "label": "Database",      "column": 0,
     "requiresApproval": True,  "check": "sqlglot parse"},
    {"id": "pipelines",  "label": "Pipelines",      "column": 1,
     "check": "sqlglot parse + ruff"},
    {"id": "backend",    "label": "Backend",        "column": 2,
     "check": "ruff check"},
    {"id": "api",        "label": "API",            "column": 3,
     "check": "ruff check"},
    {"id": "frontend",   "label": "Frontend",       "column": 4,
     "check": "tsc --noEmit"},
    {"id": "dashboards", "label": "Dashboards",     "column": 5},
    {"id": "business",   "label": "Business",       "column": 6},
    {"id": "quality",    "label": "Tests & Docs",   "column": -1},
]


class GraphStore:
    """
    Neo4j-backed knowledge graph store.
    Node label: GraphNode (id as unique key).
    Relationships: type matches EdgeType from types.ts.
    """

    def __init__(self, uri: str, user: str, password: str) -> None:
        """Connect to Neo4j and ensure uniqueness constraint."""
        self._driver = GraphDatabase.driver(uri, auth=(user, password))
        self._repo: str = ""
        self._scanned_at: str = ""
        self._ensure_constraint()

    def _ensure_constraint(self) -> None:
        """Create uniqueness constraint on GraphNode.id if not already present."""
        with self._driver.session() as session:
            session.run(
                "CREATE CONSTRAINT IF NOT EXISTS FOR (n:GraphNode) "
                "REQUIRE n.id IS UNIQUE"
            )

    # ------------------------------------------------------------------
    # Build
    # ------------------------------------------------------------------

    def build(
        self,
        nodes: list[dict],
        edges: list[dict],
        repo: str,
        scanned_at: str,
    ) -> None:
        """
        Create Neo4j nodes and relationships.
        Node label: GraphNode (use id as unique key)
        Relationship type: matches EdgeType from types.ts
        """
        self._repo = repo
        self._scanned_at = scanned_at

        with self._driver.session() as session:
            # Clear existing graph
            session.run("MATCH (n:GraphNode) DETACH DELETE n")

            # Batch upsert nodes
            for node in nodes:
                session.run(
                    """
                    MERGE (n:GraphNode {id: $id})
                    SET n += $props
                    """,
                    id=node["id"],
                    props={k: v for k, v in node.items() if k != "id"},
                )

            # Batch upsert edges
            for edge in edges:
                session.run(
                    """
                    MATCH (a:GraphNode {id: $from_id})
                    MATCH (b:GraphNode {id: $to_id})
                    MERGE (a)-[r:%s {id: $edge_id}]->(b)
                    SET r += $props
                    """ % edge.get("type", "UNKNOWN"),  # noqa: S608
                    from_id=edge["from"],
                    to_id=edge["to"],
                    edge_id=edge["id"],
                    props={
                        k: v for k, v in edge.items()
                        if k not in ("from", "to", "type", "id")
                    },
                )

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def to_json(self) -> dict:
        """
        Return complete Graph dict matching types.ts Graph interface:
        {
          repo: str,
          scannedAt: str,
          layers: LayerDef[],    ← hardcoded 8 layers
          nodes: GraphNode[],    ← all nodes from Neo4j
          edges: GraphEdge[],    ← all edges from Neo4j
          textIndex: {word: [file_paths]},  ← built from node.tokens[]
          files: RepoFile[]      ← one entry per unique file
        }
        CRITICAL: every field name must match types.ts exactly.
        """
        with self._driver.session() as session:
            raw_nodes = session.run("MATCH (n:GraphNode) RETURN properties(n) AS p").data()
            raw_edges = session.run(
                "MATCH (a:GraphNode)-[r]->(b:GraphNode) "
                "RETURN properties(r) AS p, type(r) AS t, a.id AS f, b.id AS to"
            ).data()

        nodes: list[dict] = []
        for row in raw_nodes:
            p = row["p"]
            nodes.append({
                "id": p.pop("id", ""),
                **p,
            })

        edges: list[dict] = []
        for row in raw_edges:
            p = dict(row["p"])
            p.setdefault("from", row["f"])
            p.setdefault("to", row["to"])
            p.setdefault("type", row["t"])
            edges.append(p)

        # Build textIndex from tokens
        text_index: dict[str, list[str]] = {}
        for n in nodes:
            file_path = n.get("file", "")
            for token in n.get("tokens", []):
                if token:
                    text_index.setdefault(str(token), [])
                    if file_path and file_path not in text_index[str(token)]:
                        text_index[str(token)].append(file_path)

        # Build files list
        seen_files: dict[str, dict] = {}
        for n in nodes:
            fp = n.get("file", "")
            if fp and fp not in seen_files:
                parts = fp.split("/")
                seen_files[fp] = {
                    "path": fp,
                    "dir": parts[0] if len(parts) > 1 else "root",
                    "lines": 0,  # populated by scanner if available
                    "language": _infer_language(fp),
                    "imports": [],
                }

        return {
            "repo": self._repo,
            "scannedAt": self._scanned_at or datetime.now(timezone.utc).isoformat(),
            "layers": LAYER_DEFS,
            "nodes": nodes,
            "edges": edges,
            "textIndex": text_index,
            "files": list(seen_files.values()),
        }

    def add_edges(self, edges: list[dict]) -> None:
        """Merge new edges into Neo4j. Used by Cartographer."""
        with self._driver.session() as session:
            for edge in edges:
                edge_type = edge.get("type", "UNKNOWN")
                session.run(
                    """
                    MATCH (a:GraphNode {id: $from_id})
                    MATCH (b:GraphNode {id: $to_id})
                    MERGE (a)-[r:%s {id: $edge_id}]->(b)
                    SET r += $props
                    """ % edge_type,  # noqa: S608
                    from_id=edge["from"],
                    to_id=edge["to"],
                    edge_id=edge.get("id", f"e-merged"),
                    props={
                        k: v for k, v in edge.items()
                        if k not in ("from", "to", "type", "id")
                    },
                )

    def get_node(self, node_id: str) -> dict:
        """Return single GraphNode dict."""
        with self._driver.session() as session:
            result = session.run(
                "MATCH (n:GraphNode {id: $id}) RETURN properties(n) AS p",
                id=node_id,
            ).single()
        if result is None:
            return {}
        return dict(result["p"])

    def get_downstream(
        self, node_id: str, depth: int = 3
    ) -> list[tuple]:
        """
        BFS traversal via Cypher.
        Return list of (node_id, edge_rule, edge_confidence) tuples.
        """
        cypher = (
            f"MATCH (n {{id: $id}})-[r*1..{depth}]->(m) "
            "RETURN m.id AS mid, "
            "[rel IN r | rel.rule] AS rules, "
            "[rel IN r | rel.confidence] AS confs"
        )
        with self._driver.session() as session:
            results = session.run(cypher, id=node_id).data()

        output: list[tuple] = []
        for row in results:
            rules: list = row.get("rules") or []
            confs: list = row.get("confs") or []
            # Return the immediate edge rule (last hop in path)
            rule = rules[-1] if rules else "rename_ref"
            conf = confs[-1] if confs else "high"
            output.append((row["mid"], rule, conf))
        return output

    def diff(self, old_node_ids: set, new_node_ids: set) -> dict:
        """
        Compare before/after node sets.
        Return {before: count_edges_pointing_to_old, after: count_edges_pointing_to_new}
        """
        before_count = 0
        after_count = 0
        with self._driver.session() as session:
            for nid in old_node_ids:
                r = session.run(
                    "MATCH ()-[r]->(n:GraphNode {id: $id}) RETURN count(r) AS c",
                    id=nid,
                ).single()
                before_count += r["c"] if r else 0
            for nid in new_node_ids:
                r = session.run(
                    "MATCH ()-[r]->(n:GraphNode {id: $id}) RETURN count(r) AS c",
                    id=nid,
                ).single()
                after_count += r["c"] if r else 0
        return {"before": before_count, "after": after_count}

    def patch_nodes(self, patches: list[dict]) -> None:
        """
        Apply node attribute patches returned by DocUnderstandingAgent.
        Each patch: {node_id: str, owner_team?: str, pii?: bool, criticality?: str,
                     business_meaning?: str}
        """
        with self._driver.session() as session:
            for patch in patches:
                node_id = patch.pop("node_id", None)
                if not node_id:
                    continue
                session.run(
                    "MATCH (n:GraphNode {id: $id}) SET n += $props",
                    id=node_id, props=patch,
                )

    def save_json(self, path: str) -> None:
        """Write graph.json to disk (for compatibility)."""
        data = self.json()
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2)

    def close(self) -> None:
        """Close the Neo4j driver."""
        self._driver.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _infer_language(path: str) -> str:
    """Infer programming language from file extension."""
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    return {
        "py": "python",
        "sql": "sql",
        "ts": "typescript",
        "tsx": "typescript",
        "js": "javascript",
        "jsx": "javascript",
        "yaml": "yaml",
        "yml": "yaml",
        "json": "json",
        "md": "markdown",
        "sh": "bash",
        "pdf": "pdf",
    }.get(ext, "unknown")
