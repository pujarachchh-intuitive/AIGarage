"""
config_scan.py — Parses YAML config files:
  - processes.yaml → BusinessProcess nodes (layer="business")
  - dashboards/*.yaml → Dashboard nodes (layer="dashboards")
  - 'source:' keys → READS edges to SQLModel nodes
"""
import os
import uuid
from pathlib import Path

try:
    import yaml  # PyYAML (available via chromadb transitive dep)
except ImportError:
    yaml = None  # type: ignore[assignment]


def _rel(repo_path: str, abs_path: str) -> str:
    """Return a POSIX-style path relative to repo_path."""
    return Path(abs_path).relative_to(repo_path).as_posix()


def _make_node(node_id: str, type_: str, layer: str, name: str,
               file: str, line: int, **kwargs) -> dict:
    """Return a GraphNode dict with all required fields."""
    n: dict = {
        "id": node_id,
        "type": type_,
        "layer": layer,
        "name": name,
        "file": file,
        "line": line,
        "pii": kwargs.get("pii", False),
        "criticality": kwargs.get("criticality", "medium"),
        "tested": kwargs.get("tested", True),
    }
    for opt in ("parent", "owner", "tokens"):
        if opt in kwargs:
            n[opt] = kwargs[opt]
    return n


def _make_edge(from_id: str, to_id: str, edge_type: str, rule: str,
               evidence: str, *, confidence: str = "high") -> dict:
    """Return a GraphEdge dict."""
    return {
        "id": f"e-{uuid.uuid4().hex[:8]}",
        "from": from_id,
        "to": to_id,
        "type": edge_type,
        "source": "parser",
        "confidence": confidence,
        "evidence": evidence,
        "rule": rule,
    }


def _load_yaml(path: str) -> dict | list | None:
    """Load a YAML file safely. Returns None on error."""
    if yaml is None:
        return None
    try:
        with open(path, encoding="utf-8") as fh:
            return yaml.safe_load(fh)
    except Exception:  # noqa: BLE001
        return None


def _scan_processes(abs_path: str, rel_file: str) -> tuple[list[dict], list[dict]]:
    """
    Parse processes.yaml and produce BusinessProcess nodes.
    Structure: processes: [{id, name, owner, criticality, source, ...}]
    """
    nodes: list[dict] = []
    edges: list[dict] = []
    data = _load_yaml(abs_path)
    if not isinstance(data, dict):
        return nodes, edges

    process_list = data.get("processes", [])
    for i, proc in enumerate(process_list, start=2):
        if not isinstance(proc, dict):
            continue
        proc_id_raw = proc.get("id", f"proc_{i}")
        biz_id = f"biz:{proc_id_raw}"
        name = proc.get("name", proc_id_raw)
        owner = proc.get("owner")
        criticality = proc.get("criticality", "medium")

        nodes.append(_make_node(
            biz_id, "BusinessProcess", "business", name,
            rel_file, i,
            owner=owner, criticality=criticality,
        ))

        # SUPPORTS edge: dashboard → BusinessProcess
        source = proc.get("source")
        if source:
            dash_id = f"dash:{source}"
            edges.append(_make_edge(
                dash_id, biz_id,
                "SUPPORTS", "rename_ref",
                f"{rel_file}:{i + 1}",
            ))

    return nodes, edges


def _scan_dashboard(abs_path: str, rel_file: str) -> tuple[list[dict], list[dict]]:
    """
    Parse a dashboard YAML file and produce a Dashboard node.
    Emit a READS edge if a 'source:' key is present.
    """
    nodes: list[dict] = []
    edges: list[dict] = []
    data = _load_yaml(abs_path)
    if not isinstance(data, dict):
        return nodes, edges

    # Derive dashboard id from filename stem
    stem = Path(abs_path).stem
    dash_id = f"dash:{stem}"
    name = data.get("dashboard", data.get("name", stem))
    owner = data.get("owner")
    criticality = data.get("criticality", "medium")
    tokens: list[str] = []

    # Collect metric column references as tokens
    for metric in data.get("metrics", []):
        if isinstance(metric, dict) and "column" in metric:
            tokens.append(str(metric["column"]))

    # groupBy column
    group_by = data.get("groupBy")
    if group_by:
        tokens.append(str(group_by))

    nodes.append(_make_node(
        dash_id, "Dashboard", "dashboards", name,
        rel_file, 1,
        owner=owner, criticality=criticality,
        tokens=tokens if tokens else None,
    ))

    # READS edge: Dashboard → SQLModel (source)
    source = data.get("source")
    if source:
        sqlmodel_id = f"pipe:sqlmodel:{source}"
        edges.append(_make_edge(
            sqlmodel_id, dash_id,
            "READS", "rename_ref",
            f"{rel_file}:4",
        ))

    return nodes, edges


def scan_config_files(repo_path: str) -> tuple[list[dict], list[dict]]:
    """
    Parse processes.yaml → BusinessProcess nodes (layer="business")
    Parse dashboards/*.yaml → Dashboard nodes (layer="dashboards")
    Detect 'source:' keys → emit READS edges to SQLModel nodes.
    """
    all_nodes: list[dict] = []
    all_edges: list[dict] = []

    for root, _dirs, files in os.walk(repo_path):
        for fname in files:
            if not fname.endswith((".yaml", ".yml")):
                continue
            abs_path = os.path.join(root, fname)
            rel_file = _rel(repo_path, abs_path)

            if fname in ("processes.yaml", "processes.yml"):
                n, e = _scan_processes(abs_path, rel_file)
            else:
                # Dashboard files in any directory
                n, e = _scan_dashboard(abs_path, rel_file)

            all_nodes.extend(n)
            all_edges.extend(e)

    return all_nodes, all_edges
