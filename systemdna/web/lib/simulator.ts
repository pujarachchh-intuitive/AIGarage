// Demo-mode run simulator.
// It plays the event sequence the real orchestrator will send, so the UI
// can be built and demoed before the backend exists. The UI always labels
// these runs as "Simulated". It pauses at the approval gate until the user
// clicks Approve, exactly like a real run.

import type { Change, FixUnit, RunEvent } from "@/lib/types";

type Emit = (ev: RunEvent) => void;

interface Sim {
  cancelled: boolean;
  approve?: () => void;
}

const sims = new Map<string, Sim>();

const CONCURRENCY = 4;

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Small deterministic pseudo-random numbers so every demo looks the same.
function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function isSimulating(changeId: string) {
  const sim = sims.get(changeId);
  return Boolean(sim && !sim.cancelled);
}

export function approveSimulation(changeId: string) {
  sims.get(changeId)?.approve?.();
}

export function stopSimulation(changeId: string) {
  const sim = sims.get(changeId);
  if (sim) sim.cancelled = true;
  sims.delete(changeId);
}

export interface SimOptions {
  /** Check message per layer id (from graph.layers[].check). */
  checks?: Record<string, string>;
  /** Name of the type or table that owns the renamed field, for realistic errors. */
  ownerName?: string;
  speed?: number;
}

export function startSimulation(change: Change, emit: Emit, opts: SimOptions = {}) {
  const speed = opts.speed ?? 1;
  const checks = opts.checks ?? {};
  stopSimulation(change.id);
  const sim: Sim = { cancelled: false };
  sims.set(change.id, sim);
  const rand = seeded(change.id + change.request.to);

  const sleep = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      setTimeout(() => (sim.cancelled ? reject(new Error("cancelled")) : resolve()), ms / speed);
    });

  const send = (ev: Omit<RunEvent, "ts" | "change_id">) => {
    if (sim.cancelled) throw new Error("cancelled");
    emit({ ts: new Date().toISOString(), change_id: change.id, ...ev });
  };

  const { report } = change;
  const later = report.fixUnits.filter((u) => u.wave > 1 && !u.needsApproval && u.layer !== "quality");
  // One agent tries to step outside its permit: the dynamic-SQL job in ShopFlow,
  // otherwise the busiest code file after the first wave.
  const blockedUnit =
    report.fixUnits.find((u) => u.id.includes("export_job")) ??
    [...later].sort((a, b) => b.nodes.length - a.nodes.length)[0];
  // It reaches for a file grep would have changed, or another agent's file.
  const blockedTarget =
    report.grep.falsePositives.find((f) => !f.endsWith(".md")) ??
    report.fixUnits.find((u) => u !== blockedUnit && u.layer !== "quality")?.file ??
    "a file outside its permit";
  // One agent fails its first check, then passes on retry.
  const retryUnit =
    later.find((u) => u !== blockedUnit && /\.(tsx?|jsx?)$/.test(u.file)) ?? later.find((u) => u !== blockedUnit);

  const runAgent = async (unit: FixUnit, wave: number) => {
    const agentId = `fix-${slug(unit.assetName.replace(/\.[^.]+$/, ""))}`;
    const session = `bob-${Math.floor(rand() * 1e8).toString(16)}`;
    send({ event: "agent_started", agent_id: agentId, session_id: session, wave, node: unit.id, file: unit.file, detail: `Permit: ${unit.file}` });
    await sleep(500 + rand() * 600);
    send({ event: "tool_call", agent_id: agentId, wave, node: unit.id, tool: "read_file", file: unit.file, permit_ok: true, bobcoins: 0.1 });
    await sleep(700 + rand() * 700);

    if (unit === blockedUnit) {
      send({ event: "tool_call", agent_id: agentId, wave, node: unit.id, tool: "write_to_file", file: blockedTarget, permit_ok: false });
      send({ event: "blocked", agent_id: agentId, wave, node: unit.id, file: blockedTarget, permit_ok: false, detail: `Tried to edit ${blockedTarget}, which is outside its permit` });
      await sleep(1100);
    }

    send({ event: "tool_call", agent_id: agentId, wave, node: unit.id, tool: "write_to_file", file: unit.file, permit_ok: true, bobcoins: +(0.3 + rand() * 0.4).toFixed(2) });
    await sleep(600 + rand() * 500);
    send({ event: "tool_call", agent_id: agentId, wave, node: unit.id, tool: "execute_command", file: unit.file, permit_ok: true, detail: "Run checks" });
    await sleep(700 + rand() * 500);

    if (unit === retryUnit) {
      const owner = opts.ownerName ? ` on type '${opts.ownerName}'` : "";
      send({ event: "check_failed", agent_id: agentId, wave, node: unit.id, file: unit.file, detail: `Property '${report.oldName}' does not exist${owner}. Did you mean '${change.request.to}'?` });
      await sleep(800);
      send({ event: "retrying", agent_id: agentId, wave, node: unit.id, file: unit.file });
      await sleep(500);
      send({ event: "tool_call", agent_id: agentId, wave, node: unit.id, tool: "apply_diff", file: unit.file, permit_ok: true, bobcoins: 0.2 });
      await sleep(700);
    }

    send({ event: "check_passed", agent_id: agentId, wave, node: unit.id, file: unit.file, detail: checks[unit.layer] ?? "Checks passed" });
    await sleep(400);
    send({ event: "done", agent_id: agentId, wave, node: unit.id, file: unit.file });
  };

  const run = async () => {
    const approvals = report.fixUnits.filter((u) => u.needsApproval);
    if (approvals.length > 0) {
      for (const u of approvals) {
        send({ event: "awaiting_approval", node: u.id, file: u.file, detail: u.approvalReason });
      }
      await new Promise<void>((resolve) => {
        sim.approve = resolve;
      });
      sim.approve = undefined;
      for (const u of approvals) {
        send({ event: "approved", node: u.id, file: u.file, detail: "Approved by you" });
      }
      await sleep(400);
    }

    for (let wave = 1; wave <= report.waveCount; wave++) {
      const units = report.fixUnits.filter((u) => u.wave === wave);
      send({ event: "wave_started", wave, data: { agents: units.length } });
      // Run agents with a concurrency limit, like the orchestrator.
      const queue = [...units];
      const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length) {
          const unit = queue.shift()!;
          await runAgent(unit, wave);
        }
      });
      await Promise.all(workers);
      send({ event: "wave_completed", wave });
      await sleep(300);
    }

    await sleep(600);
    send({ event: "rescan", data: { before: report.danglingRefs, after: 0 } });
    await sleep(800);
    send({ event: "inspector", data: { verdict: "approved", issues: 0 }, detail: "Diff matches the impact report" });
    await sleep(500);
    send({ event: "pr_created", data: { branch: `systemdna/${change.id}`, simulated: true } });
    send({ event: "change_completed" });
    sims.delete(change.id);
  };

  run().catch(() => {
    // Cancelled: a replay or navigation stopped this run.
  });
}
