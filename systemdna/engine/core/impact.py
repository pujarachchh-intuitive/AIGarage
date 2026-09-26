"""
impact.py — ImpactEngine.
Computes ImpactReport from a GraphStore and a ChangeRequest.
Must run in under 1 second.
Returns a dict matching types.ts ImpactReport exactly.
"""
import time
from collections import defaultdict, deque
from typing import Optional

from core.graph import GraphStore

# ------------------------------------------------------------------
# Edge rule → severity + walk-continuation mapping
# keep_alias STOPS the walk — that is the alias trap protection.
# ------------------------------------------------------------------
_RULE_SEVERITY: dict[str, str] = {
    "rename_ref":  "breaking",
    "keep_alias":  "needs_update",  # STOP — downstream is safe
    "update_type": "needs_update",
    "update_doc":  "update",
    "passthrough": "safe",
}

_RULE_CONTINUE: dict[str, bool] = {
    "rename_ref":  True,
    "keep_alias":  False,   # CRITICAL: stop walk here (alias trap)
    "update_type": True,
    "update_doc":  False,
    "passthrough": True,
}


class ImpactEngine:
    """
    Computes ImpactReport from a GraphStore and a ChangeRequest.
    Must run in under 1 second on the ShopFlow fixture.
    Returns ImpactReport dict matching types.ts ImpactReport exactly.
    """

    def analyse(self, graph_store: GraphStore, request: dict) -> dict:
        """
        Run impact analysis. Return ImpactReport dict matching types.ts
        ImpactReport interface exactly.

        Fields:
        {
          request: ChangeRequest,
          oldName: str,
          items: ImpactItem[],
          fixUnits: FixUnit[],
          waveCount: int,
          business: [{nodeId, name, owner, severity}],
          grep: {found, missed, falsePositives},
          levels: [[nodeId, ...], ...],
          danglingRefs: int,
          computedMs: int,
        }
        """
        t0 = time.monotonic()

        node_id: str = request["node"]
        change: str = request.get("change", "rename")
        to: str = request.get("to", "")

        # Derive old name from the node id (last segment after last '.')
        node_id_parts = node_id.split(".")
        old_name = node_id_parts[-1] if len(node_id_parts) > 1 else node_id.split(":")[-1]

        # Walk downstream
        items = self._walk_downstream(graph_store, node_id, request)

        # Add the changed node itself as item[0] (depth=0, severity=breaking)
        root_node = graph_store.get_node(node_id)
        root_item = {
            "nodeId": node_id,
            "severity": "breaking",
            "depth": 0,
            "risk": 1.0,
            "viaEdge": None,
            "confidence": "high",
            "needsApproval": (
                root_node.get("layer") == "database"
                or bool(root_node.get("pii", False))
            ),
        }
        items.insert(0, root_item)

        # Build levels (group by depth for ripple animation)
        max_depth = max((i["depth"] for i in items), default=0)
        levels: list[list[str]] = [[] for _ in range(max_depth + 1)]
        for item in items:
            levels[item["depth"]].append(item["nodeId"])

        # Business impact
        business_nodes = [
            i for i in items
            if i["nodeId"].startswith("biz:")
        ]
        business: list[dict] = []
        for bi in business_nodes:
            bnode = graph_store.get_node(bi["nodeId"])
            business.append({
                "nodeId": bi["nodeId"],
                "name": bnode.get("name", bi["nodeId"]),
                "owner": bnode.get("owner"),
                "severity": bi["severity"],
            })

        # Build FixUnits
        fix_units = self._build_fix_units(items, graph_store)

        # Wave count = max wave assigned
        wave_count = max((fu["wave"] for fu in fix_units), default=1)

        # Grep comparison
        affected_files = list({
            graph_store.get_node(i["nodeId"]).get("file", "")
            for i in items if i["nodeId"] != node_id
        } - {""})
        grep = self._grep_comparison(old_name, graph_store, affected_files)

        elapsed_ms = int((time.monotonic() - t0) * 1000)

        return {
            "request": request,
            "oldName": old_name,
            "items": items,
            "fixUnits": fix_units,
            "waveCount": wave_count,
            "business": business,
            "grep": grep,
            "levels": levels,
            "danglingRefs": 0,
            "computedMs": elapsed_ms,
        }

    def _walk_downstream(
        self,
        graph_store: GraphStore,
        node_id: str,
        change: dict,
    ) -> list[dict]:
        """
        BFS using graph_store.get_downstream().
        Apply edge rule to each hop:
          rename_ref  → severity=breaking,      continue walk
          keep_alias  → severity=needs_update,  STOP (downstream is safe)
          update_type → severity=needs_update,  continue
          update_doc  → severity=update,        stop
          passthrough → severity=safe,          continue

        CRITICAL: The alias trap depends on keep_alias STOPPING the walk.
        stg_orders.sql aliases cust_id → customer_key.
        Downstream of stg_orders (fct_revenue, revenue dashboard) must be safe.
        """
        visited: dict[str, int] = {node_id: 0}  # node_id → depth
        # stopped_at: set of node ids where we stopped traversal
        stopped_at: set[str] = set()
        items: list[dict] = []

        # BFS queue: (node_id, depth, via_edge_id, confidence)
        queue: deque[tuple[str, int, Optional[str], str]] = deque()
        queue.append((node_id, 0, None, "high"))

        while queue:
            current_id, depth, via_edge, parent_conf = queue.popleft()

            # get_downstream returns immediate neighbours (depth=1 from current)
            # We call it once per hop to control the walk manually
            try:
                downstream = graph_store.get_downstream(current_id, depth=1)
            except Exception:
                downstream = []

            for (next_id, rule, edge_conf) in downstream:
                if next_id in visited:
                    continue
                if current_id in stopped_at:
                    # We stopped at current, mark downstream as safe
                    severity = "safe"
                    conf = edge_conf
                    items.append({
                        "nodeId": next_id,
                        "severity": severity,
                        "depth": depth + 1,
                        "risk": _risk(severity, conf),
                        "viaEdge": None,
                        "confidence": conf,
                        "needsApproval": False,
                    })
                    visited[next_id] = depth + 1
                    continue

                severity = _RULE_SEVERITY.get(rule, "safe")
                conf = edge_conf if edge_conf else parent_conf
                should_continue = _RULE_CONTINUE.get(rule, True)

                node_data = graph_store.get_node(next_id)
                needs_approval = (
                    node_data.get("layer") == "database"
                    or bool(node_data.get("pii", False))
                )

                items.append({
                    "nodeId": next_id,
                    "severity": severity,
                    "depth": depth + 1,
                    "risk": _risk(severity, conf),
                    "viaEdge": None,
                    "confidence": conf,
                    "needsApproval": needs_approval,
                })
                visited[next_id] = depth + 1

                if should_continue:
                    queue.append((next_id, depth + 1, None, conf))
                else:
                    stopped_at.add(next_id)

        return items

    def _build_fix_units(
        self,
        items: list[dict],
        graph_store: GraphStore,
    ) -> list[dict]:
        """
        Group items by file (not by node).
        One FixUnit per unique file path.
        FixUnit.id = file path
        FixUnit.assets = list of node ids that live in this file
        FixUnit.wave = assigned wave number (based on depth)
        FixUnit.needsApproval = True if layer=database or any node pii=True
        """
        file_to_items: dict[str, list[dict]] = defaultdict(list)
        file_to_nodes: dict[str, list[str]] = defaultdict(list)
        file_to_meta: dict[str, dict] = {}

        for item in items:
            if item["severity"] == "safe":
                continue
            node = graph_store.get_node(item["nodeId"])
            fp = node.get("file", "")
            if not fp:
                continue
            file_to_items[fp].append(item)
            file_to_nodes[fp].append(item["nodeId"])
            if fp not in file_to_meta:
                file_to_meta[fp] = {
                    "layer": node.get("layer", "unknown"),
                    "pii": bool(node.get("pii", False)),
                    "name": node.get("name", fp),
                }
            else:
                # Update: pii is sticky
                if node.get("pii", False):
                    file_to_meta[fp]["pii"] = True

        fix_units: list[dict] = []
        wave = 1
        for fp, node_ids in file_to_nodes.items():
            meta = file_to_meta[fp]
            layer = meta["layer"]
            needs_approval = (
                layer == "database"
                or meta["pii"]
                or any(
                    graph_store.get_node(nid).get("pii", False)
                    for nid in node_ids
                )
            )
            # Assign wave: database layer first (wave 1), then others
            if layer == "database":
                fu_wave = 1
            elif layer in ("pipelines", "backend"):
                fu_wave = 2
            elif layer in ("api", "frontend"):
                fu_wave = 3
            else:
                fu_wave = 4
            wave = max(wave, fu_wave)

            fix_units.append({
                "id": fp,
                "assetName": meta["name"],
                "file": fp,
                "layer": layer,
                "assets": node_ids,
                "nodes": node_ids,
                "wave": fu_wave,
                "needsApproval": needs_approval,
                "approvalReason": (
                    "Database layer change" if layer == "database"
                    else "Contains PII field" if meta["pii"]
                    else None
                ),
            })

        return fix_units

    def _grep_comparison(
        self,
        old_name: str,
        graph_store: GraphStore,
        affected_files: list[str],
    ) -> dict:
        """
        graph_store.to_json()['textIndex'][old_name] = files containing old_name
        found = files that contain old_name AND are in affected_files
        missed = affected_files NOT containing old_name (grep would miss these)
        falsePositives = files containing old_name but NOT in affected_files
        """
        graph_data = graph_store.to_json()
        text_index = graph_data.get("textIndex", {})
        files_with_token: set[str] = set(text_index.get(old_name, []))
        affected_set = set(affected_files)

        found = sorted(files_with_token & affected_set)
        missed = sorted(affected_set - files_with_token)
        false_positives = sorted(files_with_token - affected_set)

        return {
            "found": found,
            "missed": missed,
            "falsePositives": false_positives,
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _risk(severity: str, confidence: str) -> float:
    """Compute a 0-1 risk score from severity and confidence."""
    sev_score = {
        "breaking": 1.0,
        "needs_update": 0.7,
        "update": 0.4,
        "safe": 0.1,
    }.get(severity, 0.5)
    conf_multiplier = {"high": 1.0, "medium": 0.7, "low": 0.4}.get(confidence, 0.7)
    return round(sev_score * conf_multiplier, 2)
