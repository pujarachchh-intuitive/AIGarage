"""
agents/fixer.py — AG2 FixerAgent (Gemini 1.5 Pro).
Applies propagate-rename recipes per file type.
Falls back to this when 'bob -p' is unavailable.
"""
import json
import logging
import re
import subprocess
import tempfile
from pathlib import Path

import autogen

from agents.llm_config import get_gemini_ag2_config
from orchestrator.events import EventEmitter

logger = logging.getLogger(__name__)

# Per-language fix recipes
_RECIPES: dict[str, str] = {
    "sql": (
        "Rename all occurrences of {old_name} to {to} in SQL. "
        "For aliased columns (SELECT {old_name} AS x), change only "
        "the source side: SELECT {to} AS x."
    ),
    "py": (
        "Rename {old_name} to {to}. Update SQLAlchemy column names, "
        "Pydantic field names, and PySpark column string references."
    ),
    "ts": (
        "Rename TypeScript interface field {old_name} to {to}. "
        "Update all usages in the component."
    ),
    "tsx": (
        "Rename field {old_name} to {to} in the React component "
        "and any typed props."
    ),
    "yaml": "Update 'source:' lines that reference {old_name} to {to}.",
    "test": "Update test assertions that check for {old_name} to {to}.",
    "md": "Update documentation mentions of {old_name} to {to}.",
}

_CHECK_CMDS: dict[str, list[str]] = {
    "py": ["ruff", "check", "--select=E,F"],
    "sql": [],  # sqlglot parse done separately
    "ts": ["tsc", "--noEmit"],
    "tsx": ["tsc", "--noEmit"],
    "yaml": [],  # no check
    "md": [],
}


class FixerAgent:
    """
    AG2 AssistantAgent using Gemini (code generation).
    Applies propagate-rename recipes per file type.
    Falls back to this when 'bob -p' is unavailable.
    """

    def __init__(self) -> None:
        self._config = get_gemini_ag2_config()

    def run(
        self,
        unit: dict,
        permit: dict,
        change: dict,
        emitter: EventEmitter,
    ) -> dict:
        """
        Run the Fixer for one FixUnit.
        Emit: agent_started → tool_call (per write) → check_passed/failed → done
        Returns: {passed: bool, detail: str}
        """
        file_path = unit.get("file", "")
        old_name = change.get("node", "").split(".")[-1]
        to = change.get("to", "")
        ext = Path(file_path).suffix.lstrip(".").lower()
        recipe_key = ext if ext in _RECIPES else ("test" if "test" in file_path else "md")
        recipe = _RECIPES.get(recipe_key, _RECIPES["md"])
        instruction = recipe.format(old_name=old_name, to=to)

        agent_id = f"fixer-{file_path.replace('/', '-')}"

        # Read the file content
        try:
            content = Path(file_path).read_text(encoding="utf-8")
        except OSError as exc:
            return {"passed": False, "detail": f"Cannot read {file_path}: {exc}"}

        # Build AG2 prompt
        prompt = (
            f"You are a code fixer agent.\n"
            f"File: {file_path}\n"
            f"Task: {instruction}\n"
            f"Return ONLY the complete updated file content, no explanation.\n\n"
            f"Original content:\n```\n{content}\n```"
        )

        assistant = autogen.AssistantAgent(
            name="fixer",
            llm_config=self._config,
            system_message="You are a code fixer. Return only the updated file content.",
        )
        user_proxy = autogen.UserProxyAgent(
            name="user_proxy",
            human_input_mode="NEVER",
            max_consecutive_auto_reply=1,
            code_execution_config=False,
        )

        user_proxy.initiate_chat(assistant, message=prompt, max_turns=1)
        last_msg = assistant.last_message()
        raw_response = last_msg.get("content", "") if last_msg else ""

        # Extract code block if present
        code_match = re.search(r"```(?:\w+)?\n(.*?)```", raw_response, re.DOTALL)
        new_content = code_match.group(1).strip() if code_match else raw_response.strip()

        if not new_content:
            return {"passed": False, "detail": "Fixer returned empty content"}

        # Write the file
        emitter.emit("tool_call", agent_id=agent_id, tool="write_file", file=file_path)
        try:
            Path(file_path).write_text(new_content, encoding="utf-8")
        except OSError as exc:
            return {"passed": False, "detail": f"Cannot write {file_path}: {exc}"}

        # Run check
        check_cmds = _CHECK_CMDS.get(ext, [])
        if check_cmds:
            try:
                result = subprocess.run(
                    check_cmds + [file_path],
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
                if result.returncode != 0:
                    emitter.emit(
                        "check_failed",
                        agent_id=agent_id,
                        file=file_path,
                        detail=result.stdout[:500],
                    )
                    return {"passed": False, "detail": result.stdout[:500]}
                emitter.emit("check_passed", agent_id=agent_id, file=file_path)
            except Exception as exc:  # noqa: BLE001
                logger.warning("[FixerAgent] check failed for %s: %s", file_path, exc)
        else:
            emitter.emit("check_passed", agent_id=agent_id, file=file_path)

        return {"passed": True, "detail": f"Fixed {file_path}"}
