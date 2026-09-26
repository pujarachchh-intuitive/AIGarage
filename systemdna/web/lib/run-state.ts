// Turns a change's event list into what the run screens show.
// The same function works for demo (simulated) and live (WebSocket) events.

import type { Change, RunEvent } from "@/lib/types";

export type AgentState =
  | "queued"
  | "awaiting_approval"
  | "reading"
  | "editing"
  | "verifying"
  | "retrying"
  | "blocked"
  | "done"
  | "quarantined";

export type BuildingState =
  | "affected"
  | "awaiting_approval"
  | "under_construction"
  | "inspecting"
  | "blocked"
  | "fixed"
  | "needs_human";

export type RunStatus = "planned" | "awaiting_approval" | "running" | "completed";

export interface AgentView {
  id: string;
  unit: string;
  file: string;
  wave: number;
  state: AgentState;
  lastAction: string;
  bobcoins: number;
  retries: number;
  blocked: number;
  startedAt?: string;
  endedAt?: string;
}

export interface RunView {
  status: RunStatus;
  startedAt?: string;
  endedAt?: string;
  elapsedMs: number;
  currentWave: number;
  waveCount: number;
  agents: AgentView[];
  unitState: Record<string, BuildingState>;
  pendingApprovals: { unit: string; file: string; reason: string }[];
  approvals: RunEvent[];
  blocked: RunEvent[];
  checksPassed: number;
  checksFailed: number;
  bobcoins: number;
  danglingBefore?: number;
  danglingAfter?: number;
  inspector?: { verdict: string; issues: number };
  pr?: { branch: string; simulated: boolean };
}

const TOOL_STATE: Record<string, AgentState> = {
  read_file: "reading",
  list_files: "reading",
  search_files: "reading",
  write_to_file: "editing",
  apply_diff: "editing",
  execute_command: "verifying",
};

export function deriveRun(change: Change, now: number = Date.now()): RunView {
  const units = change.report.fixUnits;
  const unitState: Record<string, BuildingState> = Object.fromEntries(
    units.map((u) => [u.id, "affected" as BuildingState]),
  );
  const agents = new Map<string, AgentView>();
  const pending = new Map<string, { unit: string; file: string; reason: string }>();
  const view: RunView = {
    status: "planned",
    elapsedMs: 0,
    currentWave: 0,
    waveCount: change.report.waveCount,
    agents: [],
    unitState,
    pendingApprovals: [],
    approvals: [],
    blocked: [],
    checksPassed: 0,
    checksFailed: 0,
    bobcoins: 0,
  };

  for (const ev of change.events) {
    if (!view.startedAt && ev.event !== "impact_ready") view.startedAt = ev.ts;
    const agent = ev.agent_id ? agents.get(ev.agent_id) : undefined;
    if (ev.bobcoins) view.bobcoins += ev.bobcoins;

    switch (ev.event) {
      case "awaiting_approval":
        if (ev.node) {
          pending.set(ev.node, { unit: ev.node, file: ev.file ?? "", reason: ev.detail ?? "" });
          unitState[ev.node] = "awaiting_approval";
        }
        view.status = "awaiting_approval";
        break;
      case "approved":
        if (ev.node) {
          pending.delete(ev.node);
          unitState[ev.node] = "affected";
        }
        view.approvals.push(ev);
        if (pending.size === 0) view.status = "running";
        break;
      case "wave_started":
        view.status = "running";
        view.currentWave = ev.wave ?? view.currentWave;
        break;
      case "agent_started":
        if (ev.agent_id && ev.node) {
          agents.set(ev.agent_id, {
            id: ev.agent_id,
            unit: ev.node,
            file: ev.file ?? "",
            wave: ev.wave ?? view.currentWave,
            state: "queued",
            lastAction: "Permit issued",
            bobcoins: 0,
            retries: 0,
            blocked: 0,
            startedAt: ev.ts,
          });
        }
        break;
      case "tool_call":
        if (agent) {
          agent.state = TOOL_STATE[ev.tool ?? ""] ?? agent.state;
          agent.lastAction = `${ev.tool} ${ev.file ?? ""}`.trim();
          unitState[agent.unit] = "under_construction";
        }
        break;
      case "blocked":
        view.blocked.push(ev);
        if (agent) {
          agent.state = "blocked";
          agent.blocked += 1;
          agent.lastAction = ev.detail ?? "Blocked by permit";
          unitState[agent.unit] = "blocked";
        }
        break;
      case "check_failed":
        view.checksFailed += 1;
        if (agent) {
          agent.state = "verifying";
          agent.lastAction = ev.detail ?? "Check failed";
          unitState[agent.unit] = "needs_human";
        }
        break;
      case "retrying":
        if (agent) {
          agent.state = "retrying";
          agent.retries += 1;
          agent.lastAction = "Retrying with the error message";
          unitState[agent.unit] = "under_construction";
        }
        break;
      case "check_passed":
        view.checksPassed += 1;
        if (agent) {
          agent.state = "verifying";
          agent.lastAction = ev.detail ?? "Checks passed";
          unitState[agent.unit] = "inspecting";
        }
        break;
      case "done":
        if (agent) {
          agent.state = "done";
          agent.lastAction = "Done";
          agent.endedAt = ev.ts;
          unitState[agent.unit] = "fixed";
        }
        break;
      case "quarantined":
        if (agent) {
          agent.state = "quarantined";
          agent.lastAction = ev.detail ?? "Quarantined";
          unitState[agent.unit] = "needs_human";
        }
        break;
      case "rescan":
        view.danglingBefore = Number(ev.data?.before ?? 0);
        view.danglingAfter = Number(ev.data?.after ?? 0);
        break;
      case "inspector":
        view.inspector = {
          verdict: String(ev.data?.verdict ?? "approved"),
          issues: Number(ev.data?.issues ?? 0),
        };
        break;
      case "pr_created":
        view.pr = {
          branch: String(ev.data?.branch ?? ""),
          simulated: Boolean(ev.data?.simulated),
        };
        break;
      case "change_completed":
        view.status = "completed";
        view.endedAt = ev.ts;
        break;
    }
    if (agent && ev.bobcoins) agent.bobcoins += ev.bobcoins;
  }

  view.agents = [...agents.values()];
  view.pendingApprovals = [...pending.values()];
  if (view.startedAt) {
    const end = view.endedAt ? Date.parse(view.endedAt) : now;
    view.elapsedMs = Math.max(0, end - Date.parse(view.startedAt));
  }
  return view;
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}
