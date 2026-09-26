"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, Clock, Coins, Download, FileSearch, Info, Layers3, Loader2, RotateCcw, ShieldCheck, Square } from "lucide-react";
import { toast } from "sonner";
import { CityLegend } from "@/components/city/city-legend";
import { CityMap, type CityAgent } from "@/components/city/city-map";
import { GithubAgentPanel } from "@/components/changes/github-agent-panel";
import { AgentsTable, GovernancePanel, GraphDiffCard, TraceTimeline } from "@/components/changes/run-panels";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader, PageShell, PrimaryLink, primaryButton, secondaryButton } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status-badge";
import { approveChange, DEMO_REPOS, subscribeEvents } from "@/lib/api";
import { isRealRunning, realRunTarget, startRealRun, stopRealRun } from "@/lib/real-run";
import { buildReport, downloadText } from "@/lib/report";
import { deriveRun, formatDuration, type BuildingState, type RunStatus } from "@/lib/run-state";
import { approveSimulation, isSimulating, startSimulation, stopSimulation } from "@/lib/simulator";
import { useApp, useChange } from "@/lib/store";
import type { ChangeRunResult, RunStrategy, Severity } from "@/lib/types";

const STATUS_LABEL: Record<RunStatus, string> = {
  planned: "Planned",
  awaiting_approval: "Awaiting approval",
  running: "Running",
  completed: "Completed",
};

const STRATEGY_LABEL: Record<RunStrategy, string> = {
  compiler: "the TypeScript compiler's rename",
  bob: "IBM Bob Fixer agents, one per file",
};

/** What the real run is doing, or how it ended. */
function RealRunBanner({ run, interrupted, running }: { run: ChangeRunResult | undefined; interrupted: boolean; running: boolean }) {
  if (interrupted) {
    return (
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-warning/25 bg-warning-soft">
        <AlertTriangle className="size-4 text-warning mt-0.5 shrink-0" />
        <p className="text-body text-warning">
          <span className="font-semibold">This run was interrupted</span> (the page was reloaded or closed while it ran). Use Run again to start it on a fresh clone.
        </p>
      </div>
    );
  }
  if (run?.status === "failed" || (run?.error && run.status !== "running")) {
    return (
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-error/25 bg-error-soft">
        <AlertTriangle className="size-4 text-error mt-0.5 shrink-0" />
        <p className="text-body text-error">
          <span className="font-semibold">{run.status === "failed" ? "The run did not finish." : "The run stopped early."}</span> {run.error}
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-border bg-surface-secondary">
      {running ? <Loader2 className="size-4 text-icon-secondary mt-0.5 shrink-0 animate-spin" /> : <Info className="size-4 text-icon-secondary mt-0.5 shrink-0" />}
      <p className="text-body text-text-secondary">
        <span className="font-semibold text-text-primary">Real run.</span>{" "}
        {running
          ? `${run?.step ?? "Starting"}${run?.strategy ? ` · ${STRATEGY_LABEL[run.strategy]}` : ""}. The change is made in a fresh clone of the repository; nothing is pushed.`
          : run?.status === "done"
            ? `Made by ${run.strategy ? STRATEGY_LABEL[run.strategy] : "the agents"} in a fresh clone, then type-checked and reviewed by the IBM Bob Inspector. Nothing is pushed until you open a pull request below.`
            : "The change runs in a fresh clone of the repository with the TypeScript compiler or IBM Bob Fixer agents. Nothing is pushed."}
      </p>
    </div>
  );
}

export function RunClient({ id }: { id: string }) {
  const hydrated = useApp((s) => s.hydrated);
  const graph = useApp((s) => s.graph);
  const appendEvent = useApp((s) => s.appendEvent);
  const resetEvents = useApp((s) => s.resetEvents);
  const change = useChange(id);
  const repos = useApp((s) => s.repos);
  const setRepo = useApp((s) => s.setRepo);
  const setRun = useApp((s) => s.setRun);
  const [now, setNow] = useState(() => Date.now());

  // A change belongs to one repo: show it against that repo's graph.
  const wrongRepo = Boolean(change?.repo && graph && graph.repo !== change.repo);
  useEffect(() => {
    if (!change?.repo || !graph || graph.repo === change.repo) return;
    const id = repos.find((r) => r.name === change.repo)?.id ?? DEMO_REPOS.find((r) => r.graph.repo === change.repo)?.id;
    if (id) void setRepo(id);
  }, [change?.repo, graph, repos, setRepo]);

  const completed = change?.events.some((e) => e.event === "change_completed") ?? false;

  // Changes on a github.com repo run for real (compiler or IBM Bob agents in a
  // fresh clone); samples without code run the simulator. A connected repo is
  // only known once the repo list has loaded, so wait for it before deciding.
  const decided = Boolean(
    change && (!change.repo || DEMO_REPOS.some((r) => r.graph.repo === change.repo) || repos.some((r) => r.name === change.repo)),
  );
  const realTarget = useMemo(() => (change && graph ? realRunTarget(change, graph, repos) : null), [change, graph, repos]);
  const isRealRun = Boolean(realTarget);
  const run = change?.run;
  // A run saved as "running" that this tab is not running was cut off (page reload).
  const interrupted = Boolean(isRealRun && run?.status === "running" && change && !isRealRunning(change.id));

  // Simulator options come from the graph: check messages per layer and the owning type name.
  const simOpts = useMemo(() => {
    if (!graph || !change) return undefined;
    const origin = graph.nodes.find((n) => n.id === change.request.node);
    const owner = origin?.parent ? graph.nodes.find((n) => n.id === origin.parent)?.name : undefined;
    return {
      checks: Object.fromEntries(graph.layers.map((l) => [l.id, l.check ?? "Checks passed"])),
      ownerName: owner,
    };
  }, [graph, change?.request.node]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real run: files that need approval wait for it (the gate is part of the
  // event list, like the simulator's), then the server run starts.
  const beginReal = useCallback(() => {
    if (!change || !graph || !realTarget) return;
    const approvals = change.report.fixUnits.filter((u) => u.needsApproval);
    const approved = change.events.some((e) => e.event === "approved");
    if (approvals.length > 0 && !approved) {
      if (!change.events.some((e) => e.event === "awaiting_approval")) {
        for (const u of approvals) appendEvent({ ts: new Date().toISOString(), change_id: change.id, event: "awaiting_approval", node: u.id, file: u.file, detail: u.approvalReason });
      }
      return;
    }
    void startRealRun(change, graph, realTarget);
  }, [change, graph, realTarget, appendEvent]);

  // Start once: the real run for github.com repos, the simulator for samples.
  useEffect(() => {
    if (!change || !simOpts || completed || !decided || change.mode !== "demo") return;
    if (realTarget) {
      if (!isRealRunning(change.id) && !change.run && !change.events.some((e) => e.event === "awaiting_approval")) beginReal();
    } else if (!isSimulating(change.id)) {
      resetEvents(change.id);
      startSimulation(change, appendEvent, simOpts);
    }
  }, [change, simOpts, completed, decided, realTarget, beginReal, appendEvent, resetEvents]);

  // Live mode: listen to the backend event feed for this change.
  useEffect(() => {
    if (!change || change.mode !== "live") return;
    return subscribeEvents(
      (ev) => ev.change_id === change.id && appendEvent(ev),
      () => {},
    );
  }, [change?.id, change?.mode, appendEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tick the clock while the run is going.
  useEffect(() => {
    if (completed) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [completed]);

  const view = useMemo(() => (change ? deriveRun(change, now) : null), [change, now]);

  const severity = useMemo(() => {
    if (!change) return undefined;
    return Object.fromEntries(change.report.items.map((i) => [i.nodeId, i.severity])) as Record<string, Severity>;
  }, [change]);

  // Run state is per file; the map draws buildings (assets). Translate.
  const assetsOf = useMemo(
    () => new Map((change?.report.fixUnits ?? []).map((u) => [u.id, u.assets])),
    [change?.report.fixUnits],
  );
  const assetState = useMemo(() => {
    const out: Record<string, BuildingState> = {};
    for (const [file, state] of Object.entries(view?.unitState ?? {})) {
      for (const asset of assetsOf.get(file) ?? []) out[asset] = state;
    }
    return out;
  }, [view?.unitState, assetsOf]);

  const agents: CityAgent[] = useMemo(
    () =>
      (view?.agents ?? []).map((a, i) => ({
        id: a.id,
        label: String(i + 1),
        unit: assetsOf.get(a.unit)?.[0] ?? a.unit,
        state: a.state,
      })),
    [view?.agents, assetsOf],
  );

  if (!hydrated || !graph || wrongRepo) {
    return (
      <PageShell>
        <div className="h-[600px] rounded-xl bg-surface-secondary animate-pulse" />
      </PageShell>
    );
  }

  if (!change || !view) {
    return (
      <PageShell>
        <EmptyState
          icon={FileSearch}
          title="No change found"
          body={`There is no change called ${id} in this browser.`}
          action={<PrimaryLink href="/changes/new">New change</PrimaryLink>}
        />
      </PageShell>
    );
  }

  const done = view.agents.filter((a) => a.state === "done").length;
  const realRunning = isRealRun && run?.status === "running" && isRealRunning(change.id);

  const replay = () => {
    stopSimulation(change.id);
    resetEvents(change.id);
    startSimulation({ ...change, events: [] }, appendEvent, simOpts);
  };
  // A real run is paid work (Bobcoins), so running it again is an explicit choice.
  const runAgain = () => {
    stopRealRun(change.id);
    resetEvents(change.id);
    setRun(change.id, undefined);
    // Approvals were given for this plan already; keep them.
    for (const u of change.report.fixUnits.filter((x) => x.needsApproval)) {
      appendEvent({ ts: new Date().toISOString(), change_id: change.id, event: "approved", node: u.id, file: u.file, detail: "Approved by you" });
    }
    void startRealRun({ ...change, events: [], run: undefined }, graph, realTarget!);
  };
  const stop = () => {
    stopRealRun(change.id);
    appendEvent({ ts: new Date().toISOString(), change_id: change.id, event: "change_completed", detail: "Stopped by you" });
    setRun(change.id, { status: "failed", step: undefined, error: "Stopped by you. Files already fixed in the clone were discarded." });
  };
  const approve = async () => {
    if (isRealRun) {
      for (const p of view.pendingApprovals) {
        appendEvent({ ts: new Date().toISOString(), change_id: change.id, event: "approved", node: p.unit, file: p.file, detail: "Approved by you" });
      }
      void startRealRun(change, graph, realTarget!);
    } else if (change.mode === "demo") approveSimulation(change.id);
    else {
      try {
        await approveChange(change.id);
      } catch (err) {
        toast.error("Approval failed", { description: err instanceof Error ? err.message : undefined });
      }
    }
  };

  return (
    <PageShell>
      <PageHeader
        title={change.title}
        meta={<StatusBadge status={STATUS_LABEL[view.status]} />}
        subtitle={`${change.id} · ${change.report.items.filter((i) => i.severity !== "safe").length} components affected · ${change.report.fixUnits.length} files · ${change.report.waveCount} waves`}
        actions={
          <>
            {isRealRun ? (
              realRunning ? (
                <button className={secondaryButton} onClick={stop}>
                  <Square />
                  Stop
                </button>
              ) : run ? (
                <button className={secondaryButton} onClick={runAgain} title="Runs the agents again on a fresh clone (uses Bobcoins)">
                  <RotateCcw />
                  Run again
                </button>
              ) : null
            ) : change.mode === "demo" ? (
              <button className={secondaryButton} onClick={replay}>
                <RotateCcw />
                Replay
              </button>
            ) : null}
            <button
              className={secondaryButton}
              onClick={() => downloadText(`${change.id}-report.md`, buildReport(change, graph, view))}
            >
              <Download />
              Download report
            </button>
          </>
        }
      />

      {change.mode === "demo" && !isRealRun ? (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-border bg-surface-secondary">
          <Info className="size-4 text-icon-secondary mt-0.5 shrink-0" />
          <p className="text-body text-text-secondary">
            <span className="font-semibold text-text-primary">Simulated run.</span> No backend is connected, so these
            agent events are generated in the browser. The impact analysis and the plan are real. Set{" "}
            <code className="text-caption font-semibold">NEXT_PUBLIC_API_URL</code> to watch real Bob agents.
          </p>
        </div>
      ) : null}

      {isRealRun ? <RealRunBanner run={run} interrupted={interrupted} running={realRunning} /> : null}

      <GithubAgentPanel change={change} graph={graph} reportMarkdown={() => buildReport(change, graph, view)} />

      {view.pendingApprovals.length > 0 ? (
        <div className="flex items-center justify-between gap-4 px-5 py-4 rounded-xl border border-warning/25 bg-warning-soft">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-body font-semibold text-warning">
              {view.pendingApprovals.length} {view.pendingApprovals.length === 1 ? "file needs" : "files need"} your approval before agents start
            </span>
            <span className="type-caption text-warning">
              {view.pendingApprovals.map((p) => `${p.file} (${p.reason})`).join(" · ")}
            </span>
          </div>
          <button className={primaryButton} onClick={approve}>
            <ShieldCheck />
            Approve
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiTile label="Elapsed" value={formatDuration(view.elapsedMs)} icon={Clock} />
        <KpiTile label="Agents done" value={`${done} / ${change.report.fixUnits.length}`} icon={Bot} tone={done === change.report.fixUnits.length ? "success" : "neutral"} />
        <KpiTile label="Wave" value={`${view.currentWave} / ${view.waveCount}`} icon={Layers3} />
        <KpiTile label="Bobcoins spent" value={view.bobcoins.toFixed(2)} icon={Coins} tone="inactive" />
        <KpiTile
          label="Dangling references"
          value={view.danglingAfter !== undefined ? view.danglingAfter : change.report.danglingRefs}
          icon={FileSearch}
          tone={view.danglingAfter === 0 ? "success" : "warning"}
          delta={
            view.danglingAfter !== undefined
              ? { text: `was ${view.danglingBefore}`, tone: "success" }
              : { text: "before fix", tone: "warning" }
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 flex flex-col gap-3">
          <CityMap
            graph={graph}
            severity={severity}
            buildingState={assetState}
            agents={agents}
            className="h-[560px]"
          />
          <CityLegend showAgents />
        </div>
        <TraceTimeline events={change.events} startedAt={view.startedAt} className="lg:col-span-4 h-[600px]" />
      </div>

      {view.status === "completed" ? <GraphDiffCard change={change} graph={graph} view={view} /> : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 flex flex-col gap-3">
          <h2 className="type-heading">Agents</h2>
          <AgentsTable view={view} />
        </div>
        <div className="lg:col-span-4">
          <GovernancePanel view={view} change={change} graph={graph} />
        </div>
      </div>
    </PageShell>
  );
}
