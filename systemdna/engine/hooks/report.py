"""
hooks/report.py — Bob SessionStart / PostToolUse / Stop lifecycle hook.
Reads the Bob hook payload from stdin (if any) and emits a RunEvent.
"""
import json
import os
import sys
from datetime import datetime, timezone


def _post_event(event_type: str, **kwargs) -> None:
    """Post a RunEvent to POST /events via httpx (sync). Never raises."""
    try:
        import httpx

        api_url = os.getenv("API_URL", "http://localhost:8080")
        change_id = os.getenv("SYSTEMDNA_CHANGE_ID", "unknown")
        payload = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "change_id": change_id,
            "event": event_type,
            **kwargs,
        }
        httpx.post(
            f"{api_url}/events",
            json=payload,
            headers={"Authorization": f"Bearer {os.getenv('DEMO_TOKEN', '')}"},
            timeout=5.0,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[report] Failed to emit event: {exc}", file=sys.stderr)


def main() -> None:
    """
    Emit a RunEvent for the current Bob lifecycle hook.
    Reads optional JSON payload from stdin to extract session_id and tool info.
    """
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
    except (json.JSONDecodeError, OSError):
        payload = {}

    event_name = payload.get("event_name", "")
    session_id = payload.get("session_id", "")
    agent_id = os.getenv("SYSTEMDNA_AGENT_ID", session_id)

    if event_name == "SessionStart" or not event_name:
        _post_event("tool_call", agent_id=agent_id,
                    detail=f"session_start:{session_id}")
    elif event_name == "PostToolUse":
        tool = payload.get("tool_name") or payload.get("tool", "")
        file_path = (payload.get("tool_input") or {}).get("path", "")
        _post_event("tool_call", agent_id=agent_id,
                    tool=tool, file=file_path)
    elif event_name == "Stop":
        _post_event("done", agent_id=agent_id, detail="session_stop")


if __name__ == "__main__":
    main()
