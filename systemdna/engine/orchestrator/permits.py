"""
orchestrator/permits.py — Issue and revoke per-agent permit files.
Each permit lives at .systemdna/permits/{agent_id}.json
and lists the exact file paths the agent is allowed to write.
"""
import json
import os
from pathlib import Path


def issue_permit(agent_id: str, allowed_files: list[str]) -> None:
    """
    Write a permit JSON to .systemdna/permits/{agent_id}.json.
    Creates the directory if it doesn't exist.
    """
    permit_dir = Path(".systemdna/permits")
    permit_dir.mkdir(parents=True, exist_ok=True)
    permit_path = permit_dir / f"{agent_id}.json"
    permit_path.write_text(
        json.dumps({"agent_id": agent_id, "allowed_files": allowed_files}, indent=2),
        encoding="utf-8",
    )


def revoke_permit(agent_id: str) -> None:
    """Delete the permit file for agent_id (silently if not found)."""
    permit_path = Path(".systemdna/permits") / f"{agent_id}.json"
    try:
        permit_path.unlink()
    except FileNotFoundError:
        pass


def load_permit(agent_id: str) -> dict | None:
    """Load and return permit dict for agent_id, or None if not found."""
    permit_path = Path(".systemdna/permits") / f"{agent_id}.json"
    if not permit_path.exists():
        return None
    try:
        return json.loads(permit_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
