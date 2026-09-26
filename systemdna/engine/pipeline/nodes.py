"""
pipeline/nodes.py — LangGraph node functions.
Each function transforms PipelineState and returns the updated state.
Errors are captured into state.error and state.error_node.
"""
import logging
import os
from datetime import datetime, timezone

from core.graph import GraphStore
from core.impact import ImpactEngine
from core.linker import Linker
from core.scanner import scan_repo
from pipeline.state import PipelineState

logger = logging.getLogger(__name__)


def _get_graph_store() -> GraphStore:
    """Build a GraphStore from env config."""
    return GraphStore(
        uri=os.getenv("NEO4J_URI", "bolt://localhost:7687"),
        user=os.getenv("NEO4J_USER", "neo4j"),
        password=os.getenv("NEO4J_PASSWORD", "neo4j"),
    )


def scan_node(state: PipelineState) -> PipelineState:
    """
    Run all scanners and linker; populate nodes/edges in state.
    On error: set state.error and state.error_node = "scan_node".
    """
    try:
        repo_path = state["repo_path"]
        nodes, edges = scan_repo(repo_path)
        linker = Linker()
        extra_edges = linker.link(nodes, edges)
        edges = edges + extra_edges
        return {**state, "nodes": nodes, "edges": edges, "scan_done": True}
    except Exception as exc:  # noqa: BLE001
        logger.error("[scan_node] error: %s", exc)
        return {**state, "error": str(exc), "error_node": "scan_node"}


def enrich_node(state: PipelineState) -> PipelineState:
    """
    Build the Neo4j graph from scan results.
    Run Cartographers and DocUnderstanding agents.
    On error: set state.error and state.error_node = "enrich_node".
    """
    import asyncio

    try:
        gs = _get_graph_store()
        repo = os.path.basename(state["repo_path"])
        scanned_at = datetime.now(timezone.utc).isoformat()
        gs.build(state["nodes"], state["edges"], repo, scanned_at)

        # Run cartographers (async)
        from agents.cartographers import CartographerOrchestrator
        from orchestrator.events import EventEmitter

        api_url = os.getenv("API_URL", "http://localhost:8080")
        emitter = EventEmitter(api_url=api_url, change_id=state["change_id"])
        orchestrator = CartographerOrchestrator(repo_path=state["repo_path"])

        asyncio.run(orchestrator.enrich(gs, emitter))
        gs.close()

        return {**state, "enrich_done": True}
    except Exception as exc:  # noqa: BLE001
        logger.error("[enrich_node] error: %s", exc)
        return {**state, "error": str(exc), "error_node": "enrich_node"}


def orchestrate_node(state: PipelineState) -> PipelineState:
    """
    Run ImpactEngine and Orchestrator; populate report in state.
    On error: set state.error and state.error_node = "orchestrate_node".
    """
    try:
        gs = _get_graph_store()
        engine = ImpactEngine()
        report = engine.analyse(gs, state["request"])
        gs.close()
        return {**state, "report": report, "orchestrate_done": True}
    except Exception as exc:  # noqa: BLE001
        logger.error("[orchestrate_node] error: %s", exc)
        return {**state, "error": str(exc), "error_node": "orchestrate_node"}
