"""
orchestrator/orchestrator.py — Wave-based fix execution orchestrator.
Drives agents wave-by-wave, emits RunEvents, manages permits.
"""
import asyncio
import logging
import os
from datetime import datetime, timezone

from orchestrator.events import EventEmitter
from orchestrator.permits import issue_permit, revoke_permit

logger = logging.getLogger(__name__)


class Orchestrator:
    """
    Drives the wave-by-wave fix execution for a change.
    - Emits wave_started / wave_completed / agent_started / done events
    - Issues per-file permits before each agent runs
    - Revokes permits after each agent completes
    """

    def __init__(self, change_id: str, report: dict, api_url: str) -> None:
        self.change_id = change_id
        self.report = report
        self.emitter = EventEmitter(api_url=api_url, change_id=change_id)

    async def run(self) -> None:
        """Execute all waves for a change_id."""
        fix_units = self.report.get("fixUnits", [])
        wave_count = self.report.get("waveCount", 1)

        # Group fix units by wave
        waves: dict[int, list[dict]] = {}
        for fu in fix_units:
            w = fu.get("wave", 1)
            waves.setdefault(w, []).append(fu)

        for wave_num in sorted(waves.keys()):
            units = waves[wave_num]
            self.emitter.emit("wave_started", wave=wave_num)
            logger.info("[Orchestrator] wave %d — %d units", wave_num, len(units))

            # Check if any units need approval
            needs_approval = [u for u in units if u.get("needsApproval")]
            if needs_approval:
                for u in needs_approval:
                    self.emitter.emit(
                        "awaiting_approval",
                        node=u["id"],
                        file=u.get("file", ""),
                        detail=u.get("approvalReason", "Approval required"),
                    )
                # In live mode, block here until approved — simplified: just log
                logger.info(
                    "[Orchestrator] wave %d — %d units awaiting approval (non-blocking in this impl)",
                    wave_num, len(needs_approval),
                )

            # Issue permits and run agents in parallel
            tasks = [self._run_unit(u, wave_num) for u in units]
            await asyncio.gather(*tasks)

            self.emitter.emit("wave_completed", wave=wave_num)

        self.emitter.emit("change_completed")

    async def _run_unit(self, unit: dict, wave_num: int) -> None:
        """Run a single FixUnit: issue permit → run fixer → revoke permit."""
        agent_id = f"fixer-{unit['id'].replace('/', '-')}"
        self.emitter.emit(
            "agent_started",
            agent_id=agent_id,
            node=unit["id"],
            file=unit.get("file", ""),
            wave=wave_num,
        )

        # Issue permit scoped to this unit's file
        issue_permit(agent_id, [unit.get("file", "")])

        try:
            from agents.fixer import FixerAgent

            permit = {"allowed_files": [unit.get("file", "")]}
            change = self.report.get("request", {})
            fixer = FixerAgent()
            result = await asyncio.get_event_loop().run_in_executor(
                None, fixer.run, unit, permit, change, self.emitter
            )
            if result.get("passed"):
                self.emitter.emit(
                    "done",
                    agent_id=agent_id,
                    node=unit["id"],
                    detail=result.get("detail", ""),
                )
            else:
                self.emitter.emit(
                    "check_failed",
                    agent_id=agent_id,
                    node=unit["id"],
                    detail=result.get("detail", ""),
                )
        except Exception as exc:  # noqa: BLE001
            logger.error("[Orchestrator] unit %s failed: %s", unit["id"], exc)
            self.emitter.emit(
                "quarantined",
                agent_id=agent_id,
                node=unit["id"],
                detail=str(exc),
            )
        finally:
            revoke_permit(agent_id)
