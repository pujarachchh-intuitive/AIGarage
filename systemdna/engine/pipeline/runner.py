"""
pipeline/runner.py — PipelineRunner.
Starts and resumes the LangGraph pipeline for a given change_id.
Uses Redis checkpointing for fault-tolerant resume.
"""
import logging

from pipeline.graph_pipeline import build_graph
from pipeline.state import PipelineState

logger = logging.getLogger(__name__)

# Build the compiled graph once at module load time
_graph = None


def _get_graph():
    """Lazily build and cache the compiled graph."""
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


class PipelineRunner:
    """
    Starts and resumes the LangGraph pipeline for a given change_id.
    Uses Redis checkpointing for fault-tolerant resume.
    """

    def start(self, change_id: str, repo_path: str, request: dict) -> None:
        """
        Initialize PipelineState and invoke graph.
        config={"configurable": {"thread_id": change_id}}
        """
        initial_state: PipelineState = {
            "change_id": change_id,
            "repo_path": repo_path,
            "request": request,
            "nodes": [],
            "edges": [],
            "report": None,
            "scan_done": False,
            "enrich_done": False,
            "orchestrate_done": False,
            "error": None,
            "error_node": None,
        }
        config = {"configurable": {"thread_id": change_id}}
        try:
            _get_graph().invoke(initial_state, config)
        except Exception as exc:  # noqa: BLE001
            logger.error("[PipelineRunner.start] change_id=%s error: %s", change_id, exc)

    def resume(self, change_id: str) -> None:
        """
        Re-invoke graph with same thread_id.
        LangGraph reads the Redis checkpoint and skips completed nodes.
        """
        config = {"configurable": {"thread_id": change_id}}
        try:
            _get_graph().invoke(None, config)
        except Exception as exc:  # noqa: BLE001
            logger.error("[PipelineRunner.resume] change_id=%s error: %s", change_id, exc)
