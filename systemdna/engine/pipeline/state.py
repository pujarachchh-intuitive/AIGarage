from typing import Optional, TypedDict


class PipelineState(TypedDict):
    """LangGraph pipeline state — threaded through scan → enrich → orchestrate nodes."""

    change_id: str
    repo_path: str
    request: dict           # ChangeRequest fields
    nodes: list[dict]       # GraphNode dicts
    edges: list[dict]       # GraphEdge dicts
    report: Optional[dict]  # ImpactReport dict
    scan_done: bool
    enrich_done: bool
    orchestrate_done: bool
    error: Optional[str]
    error_node: Optional[str]
