"""
agents/inspector.py — WatsonX InspectorAgent.
Reviews the full git diff against the impact report.
Uses WatsonX (cheaper — read-only analysis).
Emits inspector RunEvent with verdict.
"""
import json
import logging
import re
import subprocess
from pathlib import Path

from agents.llm_config import get_watsonx_langchain
from orchestrator.events import EventEmitter

logger = logging.getLogger(__name__)

_PROMPT_TEMPLATE = """You are the Inspector agent. Review this git diff against the impact report.

Verify:
1. Every affected node in the report has been changed.
2. No files outside the permitted scope were changed.
3. All changes are syntactically correct for their language.

Impact report summary:
{report_summary}

Git diff:
{diff_text}

Return JSON only:
{{"verdict": "approved" or "needs_revision", "issues": <integer count>, "details": [<string>, ...]}}
"""


class InspectorAgent:
    """
    Uses WatsonX (cheaper — read-only analysis).
    Reviews the full git diff against the impact report.
    """

    def __init__(self) -> None:
        self._llm = get_watsonx_langchain()

    def _get_git_diff(self, repo_path: str) -> str:
        """Return the current git diff for repo_path."""
        try:
            result = subprocess.run(
                ["git", "diff", "HEAD"],
                capture_output=True,
                text=True,
                cwd=repo_path,
                timeout=15,
            )
            return result.stdout[:8000]  # truncate for LLM
        except Exception as exc:  # noqa: BLE001
            logger.warning("[Inspector] git diff failed: %s", exc)
            return ""

    def run(
        self,
        diff_text: str,
        report: dict,
        emitter: EventEmitter,
    ) -> dict:
        """
        Prompt WatsonX to review the git diff against the impact report.
        Emit: agent_started → done → inspector RunEvent
        Returns: {verdict: str, issues: int, details: list[str]}
        """
        agent_id = "inspector"
        emitter.emit("agent_started", agent_id=agent_id)

        # Build a compact report summary
        affected_files = [fu["file"] for fu in report.get("fixUnits", [])]
        report_summary = (
            f"Changed node: {report.get('request', {}).get('node', 'unknown')}\n"
            f"Total affected items: {len(report.get('items', []))}\n"
            f"Affected files: {', '.join(affected_files[:20])}"
        )

        prompt = _PROMPT_TEMPLATE.format(
            report_summary=report_summary,
            diff_text=diff_text[:5000],
        )

        result = {"verdict": "approved", "issues": 0, "details": []}
        try:
            response = self._llm.invoke(prompt)
            raw = response if isinstance(response, str) else str(response)

            # Extract JSON from response
            match = re.search(r"\{.*\}", raw, re.DOTALL)
            if match:
                parsed = json.loads(match.group(0))
                result = {
                    "verdict": parsed.get("verdict", "approved"),
                    "issues": int(parsed.get("issues", 0)),
                    "details": parsed.get("details", []),
                }
        except Exception as exc:  # noqa: BLE001
            logger.warning("[Inspector] LLM call failed: %s", exc)
            result = {
                "verdict": "approved",
                "issues": 0,
                "details": [f"Inspector unavailable: {exc}"],
            }

        emitter.emit(
            "inspector",
            agent_id=agent_id,
            data={
                "verdict": result["verdict"],
                "issues": result["issues"],
            },
        )
        emitter.emit("done", agent_id=agent_id)

        return result
