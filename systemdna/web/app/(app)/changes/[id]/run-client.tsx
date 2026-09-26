"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, Clock, Coins, Download, FileSearch, Info, Layers3, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { CityLegend } from "@/components/city/city-legend";
import { CityMap, type CityAgent } from "@/components/city/city-map";
import { AgentsTable, GovernancePanel, GraphDiffCard, TraceTimeline } from "@/components/changes/run-panels";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader, PageShell, PrimaryLink, primaryButton, secondaryButton } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status-badge";
import { approveChange, subscribeEvents } from "@/lib/api";
import { buildReport, downloadText } from "@/lib/report";
import { deriveRun, formatDuration, type BuildingState, type RunStatus } from "@/lib/run-state";
import { approveSimulation, isSimulating, startSimulation, stopSimulation } from "@/lib/simulator";
import { useApp, useChange } from "@/lib/store";
import type { Severity } from "@/lib/types";

const STATUS_LABEL: Record<RunStatus, string> = {
  planned: "Planned",
  awaiting_approval: "Awaiting approval",
  running: "Running",
  completed: "Completed",
};

export function RunClient({ id }: { id: string }) {
  const hydrated = useApp((s) => s.hydrated);
  const graph = useApp((s) => s.graph);
  const appendEvent = useApp((s) => s.appendEvent);
  const resetEvents = useApp((s) => s.resetEvents);
  const change = useChange(id);
  const [now, setNow] = useState(() => Date.now());

  const completed = change?.events.some((e) => e.event === "change_completed") ?? false;

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

  // Demo mode: play the simulated run. It keeps going if you leave the page.
  useEffect(() => {
    if (!change || !simOpts || change.mode !== "demo" || completed || isSimulating(change.id)) return;
    resetEvents(change.id);
    startSimulation(change, appendEvent, simOpts);
  }, [change, simOpts, completed, appendEvent, resetEvents]);

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

  if (!hydrated || !graph) {
    return (
      <PageShell>
        <div className="h-[600px] rounded-xl bg-zinc-50 animate-pulse" />
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
  const replay = () => {
    stopSimulation(change.id);
    resetEvents(change.id);
    startSimulation({ ...change, events: [] }, appendEvent, simOpts);
  };
  const approve = async () => {
    if (change.mode === "demo") approveSimulation(change.id);
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
            {change.mode === "demo" ? (
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

      {change.mode === "demo" ? (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-border bg-zinc-50/50">
          <Info className="size-4 text-icon-secondary mt-0.5 shrink-0" />
          <p className="text-body text-text-secondary">
            <span className="font-semibold text-text-primary">Simulated run.</span> No backend is connected, so these
            agent events are generated in the browser. The impact analysis and the plan are real. Set{" "}
            <code className="text-caption font-semibold">NEXT_PUBLIC_API_URL</code> to watch real Bob agents.
          </p>
        </div>
      ) : null}

      {view.pendingApprovals.length > 0 ? (
        <div className="flex items-center justify-between gap-4 px-5 py-4 rounded-xl border border-amber-200/50 bg-amber-50">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-body font-semibold text-amber-700">
              {view.pendingApprovals.length} {view.pendingApprovals.length === 1 ? "file needs" : "files need"} your approval before agents start
            </span>
            <span className="type-caption text-amber-700">
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
