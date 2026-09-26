"""
hooks/permit_check.py — Bob PreToolUse hook.
Called by Bob before every tool call.
Reads hook payload from stdin.
Checks the agent's permit file. Exits with code 2 if out of permit
(causes Bob to refuse the tool call).

Hook payload fields (accept both variants per PRD):
  event_name: "PreToolUse"
  tool_name OR tool: str
  tool_input.path OR tool_input.file_path: str
  session_id: str
  env.SYSTEMDNA_AGENT_ID: str
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


def _post_event(event_type: str, **kwargs) -> None:
    """Post a RunEvent to POST /events via httpx (sync)."""
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
        # Never crash the hook because event emission failed
        print(f"[permit_check] Failed to emit event: {exc}", file=sys.stderr)


def main() -> None:
    """
    Read hook payload from stdin.
    Validate permit. Exit 2 if write is out of permit scope.
    Exit 0 to allow the tool call.
    """
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, EOFError):
        # No payload — allow through (non-agent session)
        sys.exit(0)

    # Normalise field names (accept both variants)
    tool = payload.get("tool_name") or payload.get("tool", "")
    tool_input = payload.get("tool_input", {})
    file_path = tool_input.get("path") or tool_input.get("file_path", "")
    agent_id = (
        os.getenv("SYSTEMDNA_AGENT_ID")
        or payload.get("session_id", "")
    )

    # Load permit
    permit_path = Path(f".systemdna/permits/{agent_id}.json")
    if not permit_path.exists():
        # No permit = developer session, allow everything
        _post_event("tool_call", agent_id=agent_id, tool=tool,
                    file=file_path, permit_ok=True)
        sys.exit(0)

    try:
        permit = json.loads(permit_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        _post_event("tool_call", agent_id=agent_id, tool=tool,
                    file=file_path, permit_ok=True)
        sys.exit(0)

    allowed = permit.get("allowed_files", [])
    is_write = tool in (
        "write_to_file", "apply_diff", "create_file",
        "replace_in_file", "write_file", "insert_content",
        "search_and_replace",
    )

    if is_write and file_path and file_path not in allowed:
        _post_event(
            "blocked",
            agent_id=agent_id,
            tool=tool,
            file=file_path,
            permit_ok=False,
            detail=f"out of permit: {file_path} not in {allowed}",
        )
        sys.exit(2)  # Bob refuses the tool call

    _post_event("tool_call", agent_id=agent_id, tool=tool,
                file=file_path, permit_ok=True)
    sys.exit(0)


if __name__ == "__main__":
    main()
