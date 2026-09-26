"""
EventEmitter — posts RunEvents to POST /events (sync, uses httpx).
Used by Bob hooks and AG2 agents; must never crash the caller if the API is down.
"""
import os
from datetime import datetime, timezone

import httpx


class EventEmitter:
    """
    Posts RunEvents to the FastAPI /events endpoint.
    Uses httpx (sync) so it works inside sync Bob hook scripts.
    """

    def __init__(self, api_url: str, change_id: str) -> None:
        self.api_url = api_url.rstrip("/")
        self.change_id = change_id

    def emit(self, event: str, **kwargs) -> None:
        """
        Build a RunEvent dict and POST it to /events.
        Constructs the payload with all required fields from types.ts RunEvent.
        Never raises — logs and returns on any failure.
        """
        payload: dict = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "change_id": self.change_id,
            "event": event,
            **kwargs,
        }
        try:
            httpx.post(
                f"{self.api_url}/events",
                json=payload,
                headers={"Authorization": f"Bearer {os.getenv('DEMO_TOKEN', '')}"},
                timeout=5.0,
            )
        except Exception as exc:  # noqa: BLE001
            # Never crash the agent because event emission failed
            print(f"[EventEmitter] Failed to emit {event}: {exc}")
