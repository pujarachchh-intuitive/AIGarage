"""
Pydantic models for the SystemDNA FastAPI server.
Every model mirrors its counterpart in systemdna/web/lib/types.ts exactly
(snake_case field names as used in the RunEvent WS protocol).
"""
from typing import Literal, Optional
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Change request / response
# ---------------------------------------------------------------------------

class ChangeRequest(BaseModel):
    """Mirrors ChangeRequest in types.ts."""

    node: str
    change: Literal["rename", "type_change", "delete"]
    to: str


class PostChangesResponse(BaseModel):
    """Response body for POST /changes."""

    change_id: str
    report: dict  # ImpactReport dict


# ---------------------------------------------------------------------------
# RunEvent — must match types.ts RunEvent field-for-field
# ---------------------------------------------------------------------------

class RunEvent(BaseModel):
    """
    A single pipeline event broadcasted over WebSocket and stored in the event log.
    Field names must exactly match the RunEvent interface in types.ts.
    """

    ts: str
    change_id: str
    event: Literal[
        "impact_ready",
        "awaiting_approval",
        "approved",
        "wave_started",
        "agent_started",
        "tool_call",
        "blocked",
        "check_passed",
        "check_failed",
        "retrying",
        "done",
        "quarantined",
        "wave_completed",
        "rescan",
        "inspector",
        "pr_created",
        "change_completed",
    ]
    agent_id: Optional[str] = None
    session_id: Optional[str] = None
    wave: Optional[int] = None
    tool: Optional[str] = None
    file: Optional[str] = None
    node: Optional[str] = None
    permit_ok: Optional[bool] = None
    detail: Optional[str] = None
    bobcoins: Optional[float] = None
    data: Optional[dict] = None


# ---------------------------------------------------------------------------
# Change — the top-level object stored and returned by GET /changes/{id}
# CRITICAL: mode must always be "live" — frontend switches to demo simulator
# if mode == "demo".
# ---------------------------------------------------------------------------

class Change(BaseModel):
    """Top-level change record stored server-side and returned to the frontend."""

    id: str
    repo: Optional[str] = None
    title: str
    request: dict
    report: dict
    createdAt: str
    mode: Literal["live"] = "live"  # hardcoded — must never be "demo"
    events: list[dict] = []
