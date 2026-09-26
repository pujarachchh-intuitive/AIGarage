"""
python_scan.py — Walk .py files and extract SQLAlchemy ORM models, Pydantic
schemas, FastAPI endpoints, and PySpark jobs as GraphNode/GraphEdge dicts.
"""
import ast
import os
import uuid
from pathlib import Path


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _rel(repo_path: str, abs_path: str) -> str:
    """Return a POSIX-style path relative to repo_path."""
    return Path(abs_path).relative_to(repo_path).as_posix()


def _make_node(
    node_id: str,
    type_: str,
    layer: str,
    name: str,
    file: str,
    line: int,
    *,
    parent: str | None = None,
    owner: str | None = None,
    pii: bool = False,
    criticality: str = "medium",
    tested: bool = True,
    tokens: list[str] | None = None,
) -> dict:
    """Return a GraphNode dict with all required fields."""
    n: dict = {
        "id": node_id,
        "type": type_,
        "layer": layer,
        "name": name,
        "file": file,
        "line": line,
        "pii": pii,
        "criticality": criticality,
        "tested": tested,
    }
    if parent is not None:
        n["parent"] = parent
    if owner is not None:
        n["owner"] = owner
    if tokens:
        n["tokens"] = tokens
    return n


def _make_edge(
    from_id: str,
    to_id: str,
    edge_type: str,
    rule: str,
    evidence: str,
    *,
    confidence: str = "high",
) -> dict:
    """Return a GraphEdge dict with all required fields."""
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
# AST walkers
# ---------------------------------------------------------------------------

def _extract_from_file(
    tree: ast.Module,
    rel_file: str,
) -> tuple[list[dict], list[dict]]:
    """Walk a single parsed AST and return (nodes, edges)."""
    nodes: list[dict] = []
    edges: list[dict] = []

    for stmt in ast.walk(tree):
        if not isinstance(stmt, ast.ClassDef):
            continue

        cls_name = stmt.name
        cls_line = stmt.lineno
        base_names = [
            b.id if isinstance(b, ast.Name) else
            (b.attr if isinstance(b, ast.Attribute) else "")
            for b in stmt.bases
        ]

        # ----------------------------------------------------------------
        # SQLAlchemy ORM model: inherits DeclarativeBase or Base
        # ----------------------------------------------------------------
        is_orm = any(b in ("Base", "DeclarativeBase", "db.Model") for b in base_names)
        if is_orm:
            # Detect __tablename__
            tablename: str | None = None
            for item in stmt.body:
                if (
                    isinstance(item, ast.Assign)
                    and len(item.targets) == 1
                    and isinstance(item.targets[0], ast.Name)
                    and item.targets[0].id == "__tablename__"
                    and isinstance(item.value, ast.Constant)
                ):
                    tablename = str(item.value.value)

            orm_id = f"be:orm:{cls_name}"
            tokens = [cls_name]
            nodes.append(_make_node(
                orm_id, "ORMModel", "backend", cls_name,
                rel_file, cls_line, tokens=tokens,
            ))

            # Columns
            for item in stmt.body:
                if not isinstance(item, ast.Assign):
                    continue
                if not (
                    len(item.targets) == 1
                    and isinstance(item.targets[0], ast.Name)
                ):
                    continue
                field_name = item.targets[0].id
                if field_name.startswith("_"):
                    continue
                # Check if RHS is a Column() call
                is_col = False
                if isinstance(item.value, ast.Call):
                    func = item.value.func
                    fname = func.id if isinstance(func, ast.Name) else (
                        func.attr if isinstance(func, ast.Attribute) else ""
                    )
                    is_col = fname == "Column"
                if not is_col:
                    continue
                field_id = f"be:field:{cls_name}.{field_name}"
                nodes.append(_make_node(
                    field_id, "Field", "backend",
                    f"{cls_name}.{field_name}",
                    rel_file, item.lineno,
                    parent=orm_id,
                ))

            # MAPS_TO edge: ORM → DB table
            if tablename:
                db_table_id = f"db:table:{tablename}"
                edges.append(_make_edge(
                    orm_id, db_table_id,
                    "MAPS_TO", "rename_ref",
                    f"{rel_file}:{cls_line}",
                ))

        # ----------------------------------------------------------------
        # Pydantic schema: inherits BaseModel
        # ----------------------------------------------------------------
        is_pydantic = "BaseModel" in base_names
        if is_pydantic:
            schema_id = f"be:schema:{cls_name}"
            tokens = [cls_name]
            nodes.append(_make_node(
                schema_id, "Schema", "backend", cls_name,
                rel_file, cls_line, tokens=tokens,
            ))

            for item in stmt.body:
                if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                    field_name = item.target.id
                    field_id = f"be:field:{cls_name}.{field_name}"
                    nodes.append(_make_node(
                        field_id, "Field", "backend",
                        f"{cls_name}.{field_name}",
                        rel_file, item.lineno,
                        parent=schema_id,
                    ))

    # ----------------------------------------------------------------
    # FastAPI endpoints: look for @router.get/post/put/delete/patch
    # ----------------------------------------------------------------
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for dec in node.decorator_list:
            if not isinstance(dec, ast.Call):
                continue
            func = dec.func
            if not isinstance(func, ast.Attribute):
                continue
            method = func.attr.upper()
            if method not in ("GET", "POST", "PUT", "DELETE", "PATCH"):
                continue
            # First arg is the path string
            if not dec.args or not isinstance(dec.args[0], ast.Constant):
                continue
            path_str = str(dec.args[0].value)
            ep_name = f"{method} {path_str}"
            ep_id = f"api:endpoint:{node.name}"
            nodes.append(_make_node(
                ep_id, "Endpoint", "api", ep_name,
                rel_file, node.lineno,
            ))
            # Associate the backing function
            fn_id = f"be:function:{node.name}"
            nodes.append(_make_node(
                fn_id, "Function", "backend", node.name,
                rel_file, node.lineno,
            ))
            edges.append(_make_edge(
                fn_id, ep_id,
                "RETURNS", "rename_ref",
                f"{rel_file}:{node.lineno}",
            ))

    # ----------------------------------------------------------------
    # PySpark jobs: look for SparkSession.builder.appName(...)
    # ----------------------------------------------------------------
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if not isinstance(func, ast.Attribute) or func.attr != "appName":
            continue
        if not node.args or not isinstance(node.args[0], ast.Constant):
            continue
        job_name = str(node.args[0].value)
        job_id = f"pipe:sparkjob:{job_name}"
        nodes.append(_make_node(
            job_id, "SparkJob", "pipelines", job_name,
            rel_file, node.lineno,
            tokens=[job_name],
        ))

    return nodes, edges


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def scan_python_files(repo_path: str) -> tuple[list[dict], list[dict]]:
    """
    Walk all .py files in repo_path.
    Return (nodes, edges) where:
    - nodes: list of GraphNode dicts (id, type, layer, name, file, line,
             parent, owner, pii, criticality, tested, tokens)
    - edges: list of GraphEdge dicts (id, from, to, type, source, confidence,
             evidence, rule)

    Node id format: layer:type:qualified_name
    Examples:
      be:orm:Order          (SQLAlchemy model)
      be:field:Order.cust_id (SQLAlchemy column)
      be:schema:OrderOut    (Pydantic model)
      be:field:OrderOut.cust_id (Pydantic field)
      api:endpoint:get_orders (FastAPI route)
      pipe:sparkjob:churn_job (PySpark job)

    Evidence format: "relative/path/to/file.py:42"
    All edges: source="parser", confidence="high"
    """
    all_nodes: list[dict] = []
    all_edges: list[dict] = []

    for root, _dirs, files in os.walk(repo_path):
        for fname in files:
            if not fname.endswith(".py"):
                continue
            abs_path = os.path.join(root, fname)
            rel_file = _rel(repo_path, abs_path)
            try:
                source = Path(abs_path).read_text(encoding="utf-8")
                tree = ast.parse(source, filename=abs_path)
            except (SyntaxError, UnicodeDecodeError):
                continue
            n, e = _extract_from_file(tree, rel_file)
            all_nodes.extend(n)
            all_edges.extend(e)

    return all_nodes, all_edges
