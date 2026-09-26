"""
server/app.py — SystemDNA FastAPI application.
Implements all endpoints from systemdna/web/lib/api.ts exactly.
Critical: POST /events broadcasts to all WS clients within 100ms.
Critical: change.mode is always "live" — never "demo".
"""
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends, Header
from fastapi.middleware.cors import CORSMiddleware

from core.graph import GraphStore
from core.impact import ImpactEngine
from pipeline.runner import PipelineRunner
from server.models import Change, ChangeRequest, PostChangesResponse, RunEvent
from server.store import EventStore
from server.ws import ConnectionManager

load_dotenv()

app = FastAPI(title="SystemDNA Engine", version="1.0.0")

# Allow the Next.js frontend to talk to us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Singletons
# ---------------------------------------------------------------------------
manager = ConnectionManager()
store = EventStore()
_graph_store: Optional[GraphStore] = None
_impact_engine = ImpactEngine()
_pipeline_runner = PipelineRunner()

_DEMO_TOKEN = os.getenv("DEMO_TOKEN", "")


def _get_graph_store() -> GraphStore:
    """Return the shared GraphStore, initialising it lazily."""
    global _graph_store
    if _graph_store is None:
        _graph_store = GraphStore(
            uri=os.getenv("NEO4J_URI", "bolt://localhost:7687"),
            user=os.getenv("NEO4J_USER", "neo4j"),
            password=os.getenv("NEO4J_PASSWORD", "neo4j"),
        )
    return _graph_store


def _auth(authorization: str = Header(default="")) -> None:
    """Validate Bearer token on write endpoints."""
    if not _DEMO_TOKEN:
        return  # No token configured — open access
    expected = f"Bearer {_DEMO_TOKEN}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> dict:
    """Health check endpoint."""
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------

@app.get("/graph")
async def get_graph() -> dict:
    """
    Return the complete Graph JSON matching types.ts Graph interface.
    Used by the Agent City map to render the city.
    """
    gs = _get_graph_store()
    try:
        return gs.to_json()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Changes
# ---------------------------------------------------------------------------

@app.post("/changes")
async def post_changes(
    request: ChangeRequest,
    _auth: None = Depends(_auth),
) -> PostChangesResponse:
    """
    Compute impact report for a ChangeRequest.
    Creates a Change record in the store.
    Returns change_id + ImpactReport.
    """
    gs = _get_graph_store()
    change_id = f"chg-{uuid.uuid4().hex[:8]}"
    report = _impact_engine.analyse(gs, request.model_dump())

    now = datetime.now(timezone.utc).isoformat()
    change = Change(
        id=change_id,
        repo=gs._repo if gs else None,
        title=f"{request.change} {request.node} → {request.to}",
        request=request.model_dump(),
        report=report,
        createdAt=now,
        mode="live",
        events=[],
    )
    await store.save_change(change.model_dump())

    # Emit impact_ready event
    impact_event = RunEvent(
        ts=now,
        change_id=change_id,
        event="impact_ready",
        data={"waveCount": report.get("waveCount", 1)},
    )
    await store.save_event(impact_event.model_dump())
    await manager.broadcast(impact_event.model_dump_json())

    return PostChangesResponse(change_id=change_id, report=report)


@app.get("/changes")
async def list_changes() -> list[dict]:
    """Return all Change records."""
    return await store.list_changes()


@app.get("/changes/{change_id}")
async def get_change(change_id: str) -> dict:
    """Return a single Change record by id."""
    change = await store.get_change(change_id)
    if not change:
        raise HTTPException(status_code=404, detail="Change not found")
    return change


@app.post("/changes/{change_id}/run")
async def run_change(
    change_id: str,
    _auth: None = Depends(_auth),
) -> dict:
    """
    Start the LangGraph pipeline for change_id.
    """
    change = await store.get_change(change_id)
    if not change:
        raise HTTPException(status_code=404, detail="Change not found")

    repo_path = os.getenv("REPO_WORKSPACE", "/workspace")
    _pipeline_runner.start(
        change_id=change_id,
        repo_path=repo_path,
        request=change["request"],
    )
    return {"status": "started", "change_id": change_id}


@app.post("/changes/{change_id}/resume")
async def resume_change(
    change_id: str,
    _auth: None = Depends(_auth),
) -> dict:
    """
    Resume a paused/failed pipeline from its Redis checkpoint.
    LangGraph skips already-completed nodes.
    """
    _pipeline_runner.resume(change_id)
    return {"status": "resumed", "change_id": change_id}


@app.post("/changes/{change_id}/approve")
async def approve_change(
    change_id: str,
    _auth: None = Depends(_auth),
) -> dict:
    """
    Record human approval for a database or PII node.
    Emits an 'approved' RunEvent.
    """
    now = datetime.now(timezone.utc).isoformat()
    ev = RunEvent(
        ts=now,
        change_id=change_id,
        event="approved",
        detail="Approved via API",
    )
    await store.save_event(ev.model_dump())
    await manager.broadcast(ev.model_dump_json())
    return {"status": "approved"}


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------

@app.post("/events")
async def receive_event(event: RunEvent) -> dict:
    """
    This endpoint is the heart of the live UI.
    Every Bob hook and every AG2 agent posts here.
    1. Save to store
    2. Broadcast to all WebSocket clients
    The frontend's subscribeEvents() in api.ts receives these via WS /ws.
    """
    await store.save_event(event.model_dump())
    await manager.broadcast(event.model_dump_json())
    return {}


@app.get("/events/{change_id}")
async def get_events(change_id: str) -> list[dict]:
    """Return all stored events for a change_id."""
    return await store.get_events(change_id)


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """
    Frontend connects here when NEXT_PUBLIC_API_URL is set.
    Keep connection alive; relay events from POST /events.
    """
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep alive ping
    except WebSocketDisconnect:
        manager.disconnect(websocket)
