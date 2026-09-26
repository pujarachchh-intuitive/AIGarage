"""
sql_scan.py — Walk .sql files with sqlglot to extract Table/Column/SQLModel nodes
and produce DERIVES_FROM edges including the alias trap (keep_alias rule).
"""
import os
import uuid
from pathlib import Path

import sqlglot
import sqlglot.expressions as exp


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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
    if "parent" in kwargs:
        n["parent"] = kwargs["parent"]
    if "owner" in kwargs:
        n["owner"] = kwargs["owner"]
    if "tokens" in kwargs:
        n["tokens"] = kwargs["tokens"]
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


# ---------------------------------------------------------------------------
# Schema file scanner
# ---------------------------------------------------------------------------

def _scan_schema(sql_text: str, rel_file: str) -> tuple[list[dict], list[dict]]:
    """
    Parse a DDL schema file.
    Produce Table nodes and Column nodes.
    """
    nodes: list[dict] = []
    edges: list[dict] = []

    try:
        statements = sqlglot.parse(sql_text, error_level=sqlglot.ErrorLevel.IGNORE)
    except Exception:
        return nodes, edges

    line = 1  # approximate — sqlglot does not track line numbers reliably
    for stmt in statements:
        if stmt is None:
            continue
        if not isinstance(stmt, exp.Create):
            continue
        table_expr = stmt.find(exp.Table)
        if table_expr is None:
            continue
        table_name = table_expr.name
        table_id = f"db:table:{table_name}"
        tokens = [table_name]

        col_exprs = list(stmt.find_all(exp.ColumnDef))
        col_names = [c.name for c in col_exprs]
        tokens.extend(col_names)

        nodes.append(_make_node(table_id, "Table", "database", table_name,
                                rel_file, line, tokens=tokens))

        for i, col_def in enumerate(col_exprs, start=1):
            col_name = col_def.name
            col_id = f"db:column:{table_name}.{col_name}"
            nodes.append(_make_node(col_id, "Column", "database",
                                    f"{table_name}.{col_name}",
                                    rel_file, line + i,
                                    parent=table_id))

        line += 5  # rough line advance between CREATE TABLE statements

    return nodes, edges


# ---------------------------------------------------------------------------
# Transform file scanner (SELECT … AS … → DERIVES_FROM / keep_alias)
# ---------------------------------------------------------------------------

def _scan_transform(
    sql_text: str, rel_file: str, model_name: str,
) -> tuple[list[dict], list[dict]]:
    """
    Parse a SELECT-based transform file.
    Produce SQLModel + Column nodes and DERIVES_FROM edges.

    ALIAS TRAP: if a column is aliased (SELECT src AS alias), emit
      rule="keep_alias"  → impact walk stops here (downstream is safe).
    Non-aliased columns: rule="rename_ref".
    """
    nodes: list[dict] = []
    edges: list[dict] = []

    try:
        statements = sqlglot.parse(sql_text, error_level=sqlglot.ErrorLevel.IGNORE)
    except Exception:
        return nodes, edges

    model_id = f"pipe:sqlmodel:{model_name}"
    tokens: list[str] = []
    nodes.append(_make_node(model_id, "SQLModel", "pipelines", model_name,
                            rel_file, 1))

    for stmt in statements:
        if stmt is None:
            continue
        select = stmt.find(exp.Select)
        if select is None:
            continue

        # Identify source table(s)
        from_tables: list[str] = []
        for tbl in stmt.find_all(exp.Table):
            if tbl.name:
                from_tables.append(tbl.name)

        for sel_expr in select.expressions:
            # Aliased column: SELECT src_col AS alias_col
            if isinstance(sel_expr, exp.Alias):
                alias_name = sel_expr.alias
                src = sel_expr.this
                src_col: str | None = None
                src_table: str | None = None
                if isinstance(src, exp.Column):
                    src_col = src.name
                    src_table = src.table or (from_tables[0] if from_tables else None)

                # Emit aliased column node
                alias_col_id = f"pipe:column:{model_name}.{alias_name}"
                nodes.append(_make_node(alias_col_id, "Column", "pipelines",
                                        f"{model_name}.{alias_name}",
                                        rel_file, 3, parent=model_id))
                tokens.append(alias_name)

                if src_col and src_table:
                    tokens.append(src_col)
                    src_col_id = f"db:column:{src_table}.{src_col}"
                    edges.append(_make_edge(
                        src_col_id, alias_col_id,
                        "DERIVES_FROM", "keep_alias",
                        f"{rel_file}:3",
                    ))

            # Bare column reference: SELECT col (no alias)
            elif isinstance(sel_expr, exp.Column):
                col_name = sel_expr.name
                src_table = sel_expr.table or (from_tables[0] if from_tables else None)
                if src_table and col_name:
                    tokens.append(col_name)
                    src_col_id = f"db:column:{src_table}.{col_name}"
                    out_col_id = f"pipe:column:{model_name}.{col_name}"
                    nodes.append(_make_node(out_col_id, "Column", "pipelines",
                                            f"{model_name}.{col_name}",
                                            rel_file, 3, parent=model_id))
                    edges.append(_make_edge(
                        src_col_id, out_col_id,
                        "DERIVES_FROM", "rename_ref",
                        f"{rel_file}:3",
                    ))

    # Update model tokens
    nodes[0]["tokens"] = tokens
    return nodes, edges


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def scan_sql_files(repo_path: str) -> tuple[list[dict], list[dict]]:
    """
    Walk all .sql files in repo_path using sqlglot.
    Key: detect aliased columns.

    stg_orders.sql:  SELECT cust_id AS customer_key FROM orders
    Must produce:
      DERIVES_FROM edge:
        from: "db:column:orders.cust_id"
        to:   "pipe:column:stg_orders.customer_key"
        rule: "keep_alias"     ← CRITICAL: stops impact walk here
        evidence: "transforms/stg_orders.sql:3"
        confidence: "high"
    """
    all_nodes: list[dict] = []
    all_edges: list[dict] = []

    for root, _dirs, files in os.walk(repo_path):
        for fname in files:
            if not fname.endswith(".sql"):
                continue
            abs_path = os.path.join(root, fname)
            rel_file = _rel(repo_path, abs_path)
            try:
                sql_text = Path(abs_path).read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue

            # Heuristic: DDL files contain CREATE TABLE
            if "CREATE TABLE" in sql_text.upper():
                n, e = _scan_schema(sql_text, rel_file)
            else:
                # Transform file: derive model name from filename stem
                model_name = Path(fname).stem
                n, e = _scan_transform(sql_text, rel_file, model_name)

            all_nodes.extend(n)
            all_edges.extend(e)

    return all_nodes, all_edges
