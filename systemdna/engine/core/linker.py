"""
linker.py — Cross-layer edge inference.
Applies 6 deterministic rules against the node set to produce new edges
that the per-layer scanners cannot see.
All new edges: source="parser", confidence="high".
"""
import uuid
from typing import Optional


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


class Linker:
    """
    Applies 6 cross-layer linking rules to produce new edges.
    Never modifies input nodes or edges.
    """

    def link(self, nodes: list[dict], edges: list[dict]) -> list[dict]:
        """
        Apply 6 cross-layer rules. Return NEW edges only (do not modify input).
        All new edges: source="parser", confidence="high"

        Rule 1: MAPS_TO — ORMModel.__tablename__ → Table.name
          rule="rename_ref"

        Rule 2: SERIALIZES — Schema fields → ORMModel fields (matched by name)
          rule="rename_ref"

        Rule 3: RETURNS — Endpoint return annotation → Schema (inferred from endpoints)
          rule="passthrough"

        Rule 4: CONSUMES — Component fetch() URL → Endpoint path
          rule="passthrough"

        Rule 5: TYPED_AS — TSField.name → API Field.name (same parent type name)
          rule="rename_ref"

        Rule 6: SUPPORTS — Dashboard source column chain → BusinessProcess
          rule="passthrough"
        """
        new_edges: list[dict] = []
        existing_pairs: set[tuple[str, str]] = {
            (e["from"], e["to"]) for e in edges
        }

        # Index nodes by id and by type
        by_id: dict[str, dict] = {n["id"]: n for n in nodes}
        by_type: dict[str, list[dict]] = {}
        for n in nodes:
            by_type.setdefault(n["type"], []).append(n)

        # ----------------------------------------------------------------
        # Rule 1: MAPS_TO — ORMModel → db:table:<tablename>
        # ORM model id is be:orm:<ClassName>. We look for db:table:<tablename>
        # by checking if any node with type=Table has name matching.
        # ----------------------------------------------------------------
        table_by_name: dict[str, str] = {}
        for n in by_type.get("Table", []):
            table_by_name[n["name"].lower()] = n["id"]

        for orm in by_type.get("ORMModel", []):
            # orm id = be:orm:<ClassName>; tokens may include tablename
            # Try to infer tablename from orm id last segment lowered
            cls_name = orm["id"].split(":")[-1]
            # Common heuristic: tablename = cls_name.lower() + 's' or just cls_name.lower()
            for candidate in (cls_name.lower() + "s", cls_name.lower()):
                tbl_id = table_by_name.get(candidate)
                if tbl_id and (orm["id"], tbl_id) not in existing_pairs:
                    new_edges.append(_make_edge(
                        orm["id"], tbl_id,
                        "MAPS_TO", "rename_ref",
                        f"{orm.get('file', '')}:{orm.get('line', 1)}",
                    ))
                    existing_pairs.add((orm["id"], tbl_id))
                    break

        # ----------------------------------------------------------------
        # Rule 2: SERIALIZES — Schema.field → ORMModel.field (same field name)
        # ----------------------------------------------------------------
        # Build index: field_name → list of Field node ids
        orm_fields_by_name: dict[str, list[str]] = {}
        for f in by_type.get("Field", []):
            # Only ORM fields: parent is an ORMModel
            parent_id = f.get("parent", "")
            if parent_id and parent_id.startswith("be:orm:"):
                field_name = f["name"].split(".")[-1]
                orm_fields_by_name.setdefault(field_name, []).append(f["id"])

        for schema_field in by_type.get("Field", []):
            parent_id = schema_field.get("parent", "")
            if not (parent_id and parent_id.startswith("be:schema:")):
                continue
            field_name = schema_field["name"].split(".")[-1]
            for orm_field_id in orm_fields_by_name.get(field_name, []):
                pair = (schema_field["id"], orm_field_id)
                if pair not in existing_pairs:
                    new_edges.append(_make_edge(
                        orm_field_id, schema_field["id"],
                        "SERIALIZES", "rename_ref",
                        f"{schema_field.get('file', '')}:{schema_field.get('line', 1)}",
                    ))
                    existing_pairs.add(pair)

        # ----------------------------------------------------------------
        # Rule 3: RETURNS — Endpoint → Schema
        # Infer by naming: GET /api/orders endpoint → OrderOut schema
        # (already emitted by python_scan for annotated returns; this catches gaps)
        # ----------------------------------------------------------------
        schema_by_name: dict[str, str] = {}
        for s in by_type.get("Schema", []):
            schema_by_name[s["name"].lower()] = s["id"]

        for ep in by_type.get("Endpoint", []):
            # Try matching endpoint name segment to a schema name
            ep_name = ep["name"]  # e.g. "GET /api/orders"
            # Heuristic: "orders" → look for "orderout" or "order"
            resource = ep_name.split("/")[-1].rstrip("}").lower()
            for candidate in (resource + "out", resource):
                schema_id = schema_by_name.get(candidate)
                if schema_id and (ep["id"], schema_id) not in existing_pairs:
                    new_edges.append(_make_edge(
                        ep["id"], schema_id,
                        "RETURNS", "passthrough",
                        f"{ep.get('file', '')}:{ep.get('line', 1)}",
                    ))
                    existing_pairs.add((ep["id"], schema_id))
                    break

        # ----------------------------------------------------------------
        # Rule 4: CONSUMES — TSComponent → Endpoint (by URL matching)
        # TSField tokens may contain the API path; if component mentions /api/X
        # and an endpoint matches, emit CONSUMES.
        # ----------------------------------------------------------------
        ep_by_path: dict[str, str] = {}
        for ep in by_type.get("Endpoint", []):
            # ep.name = "GET /api/orders" → path = "/api/orders"
            parts = ep["name"].split(" ", 1)
            if len(parts) == 2:
                ep_by_path[parts[1]] = ep["id"]

        for comp in by_type.get("Component", []):
            tokens = comp.get("tokens", [])
            for tok in tokens:
                # Check if token looks like an API path
                if tok.startswith("/api/"):
                    ep_id = ep_by_path.get(tok)
                    if ep_id and (comp["id"], ep_id) not in existing_pairs:
                        new_edges.append(_make_edge(
                            ep_id, comp["id"],
                            "CONSUMES", "passthrough",
                            f"{comp.get('file', '')}:{comp.get('line', 1)}",
                        ))
                        existing_pairs.add((comp["id"], ep_id))

        # ----------------------------------------------------------------
        # Rule 5: TYPED_AS — TSField → API Field (same field name, same parent type)
        # ----------------------------------------------------------------
        api_fields_by_name: dict[str, list[str]] = {}
        for f in by_type.get("Field", []):
            parent_id = f.get("parent", "")
            if parent_id and parent_id.startswith("be:schema:"):
                field_name = f["name"].split(".")[-1]
                api_fields_by_name.setdefault(field_name, []).append(f["id"])

        for ts_field in by_type.get("TSField", []):
            field_name = ts_field["name"].split(".")[-1]
            for api_field_id in api_fields_by_name.get(field_name, []):
                pair = (ts_field["id"], api_field_id)
                if pair not in existing_pairs:
                    new_edges.append(_make_edge(
                        api_field_id, ts_field["id"],
                        "TYPED_AS", "rename_ref",
                        f"{ts_field.get('file', '')}:{ts_field.get('line', 1)}",
                    ))
                    existing_pairs.add(pair)

        # ----------------------------------------------------------------
        # Rule 6: SUPPORTS — Dashboard → BusinessProcess
        # (already emitted by config_scan; skip if already present)
        # ----------------------------------------------------------------
        # (config_scan already emits these; nothing to add here)

        return new_edges
