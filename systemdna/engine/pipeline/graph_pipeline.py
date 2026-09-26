"""
pipeline/graph_pipeline.py — LangGraph StateGraph with Redis checkpointing.
Three-node pipeline: scan_node → enrich_node → orchestrate_node.
Fault-tolerant: Redis checkpointer allows resume after failure.
"""
import os

from langgraph.graph import END, StateGraph
from langgraph.checkpoint.redis import RedisSaver

from pipeline.nodes import enrich_node, orchestrate_node, scan_node
from pipeline.state import PipelineState


def build_graph():
    """
    Build and compile the three-node StateGraph with Redis checkpointer.

    Nodes: scan_node, enrich_node, orchestrate_node
    Edges:
      START → scan_node
      scan_node → enrich_node (if no error)
      scan_node → END (if error)
      enrich_node → orchestrate_node (if no error)
      enrich_node → END (if error)
      orchestrate_node → END

    Checkpointer: RedisSaver(redis_url=REDIS_URL)
    thread_id = change_id (set in config when invoking)
    """
    builder = StateGraph(PipelineState)

    builder.add_node("scan_node", scan_node)
    builder.add_node("enrich_node", enrich_node)
    builder.add_node("orchestrate_node", orchestrate_node)

    builder.set_entry_point("scan_node")

    builder.add_conditional_edges(
        "scan_node",
        lambda s: END if s.get("error") else "enrich_node",
    )
    builder.add_conditional_edges(
        "enrich_node",
        lambda s: END if s.get("error") else "orchestrate_node",
    )
    builder.add_edge("orchestrate_node", END)

    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    checkpointer = RedisSaver.from_conn_string(redis_url)

    return builder.compile(checkpointer=checkpointer)
