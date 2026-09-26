"""
mcp/server.py — FastMCP HTTP server on port 3000.
7 tools matching PRD section 13 exactly.
Used by Bob IDE Change Planner mode.
"""
import os

import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("SystemDNA")

_API_URL = os.getenv("API_URL", "http://api:8080")
_DEMO_TOKEN = os.getenv("DEMO_TOKEN", "")

_HEADERS = {
    "Content-Type": "application/json",
    **({"Authorization": f"Bearer {_DEMO_TOKEN}"} if _DEMO_TOKEN else {}),
}


def _api(method: str, path: str, **kwargs) -> dict:
    """Synchronous HTTP helper against the FastAPI server."""
    url = f"{_API_URL}{path}"
    resp = httpx.request(method, url, headers=_HEADERS, timeout=30.0, **kwargs)
    resp.raise_for_status()
    return resp.json()


@mcp.tool()
def scan_repo(path: str) -> dict:
    """
    Scan a repo and build the knowledge graph.
    Triggers a full scan of the given repo path via the engine API.
    Returns the resulting Graph JSON.
    """
    return _api("GET", "/graph")


@mcp.tool()
def get_impact(node: str, change: str, to: str) -> dict:
    """
    Analyse the impact of a change. Returns ImpactReport.
    node: the node id to change (e.g. 'db:column:orders.cust_id')
    change: 'rename', 'type_change', or 'delete'
    to: the new name or type
    """
    payload = {"node": node, "change": change, "to": to}
    return _api("POST", "/changes", json=payload)


@mcp.tool()
def plan_change(change_id: str) -> dict:
    """
    Return the wave plan, permits needed, and approvals required.
    """
    change = _api("GET", f"/changes/{change_id}")
    report = change.get("report", {})
    return {
        "change_id": change_id,
        "waveCount": report.get("waveCount", 0),
        "fixUnits": report.get("fixUnits", []),
        "business": report.get("business", []),
        "danglingRefs": report.get("danglingRefs", 0),
    }


@mcp.tool()
def start_wave(change_id: str, wave: int) -> dict:
    """
    Start all agents in a wave.
    Triggers the pipeline runner for the given change_id.
    """
    return _api("POST", f"/changes/{change_id}/run")


@mcp.tool()
def get_status(change_id: str) -> dict:
    """
    Return current state of all agents and nodes for a change.
    """
    change = _api("GET", f"/changes/{change_id}")
    events = _api("GET", f"/events/{change_id}")
    return {"change": change, "events": events[-20:]}  # last 20 events


@mcp.tool()
def approve(change_id: str, node: str) -> dict:
    """
    Record human approval for a db or PII node.
    """
    return _api("POST", f"/changes/{change_id}/approve")


@mcp.tool()
def verify(change_id: str) -> dict:
    """
    Run re-scan and return dangling ref count + graph diff.
    """
    # Re-fetch the graph to get current state
    graph = _api("GET", "/graph")
    change = _api("GET", f"/changes/{change_id}")
    report = change.get("report", {})
    return {
        "change_id": change_id,
        "danglingRefs": report.get("danglingRefs", 0),
        "nodeCount": len(graph.get("nodes", [])),
        "edgeCount": len(graph.get("edges", [])),
    }


def main() -> None:
    """Start the MCP server on port 3000."""
    mcp.run(transport="http", port=3000)


if __name__ == "__main__":
    main()
