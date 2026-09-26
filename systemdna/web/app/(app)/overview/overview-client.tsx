"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Boxes, GitBranch, Map as MapIcon, Network, ShieldCheck, Sparkles } from "lucide-react";
import { KpiTile } from "@/components/ui/kpi-tile";
import { Card, PageHeader, PageShell, PrimaryLink, SecondaryLink } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status-badge";
import { deriveRun, type RunStatus } from "@/lib/run-state";
import { useApp, useRepoChanges } from "@/lib/store";

const STATUS_LABEL: Record<RunStatus, string> = {
  planned: "Planned",
  awaiting_approval: "Awaiting approval",
  running: "Running",
  completed: "Completed",
};

// Charts render only after mount (DESIGN.md: pulse skeleton until mounted).
const noop = () => () => {};
function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value?: number; name?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded-md shadow-[0_8px_24px_-12px_rgb(0_0_0/0.3)] px-2.5 py-1.5 font-mono text-[11px] font-medium tabular-nums text-text-primary">
      {label ?? payload[0].name}: {payload[0].value}
    </div>
  );
}

export function OverviewClient() {
  const graph = useApp((s) => s.graph);
  const changes = useRepoChanges();
  const mounted = useMounted();

  const stats = useMemo(() => {
    if (!graph) return null;
    const byLayer = graph.layers.map((l) => ({
      name: l.label,
      count: graph.nodes.filter((n) => n.layer === l.id).length,
    }));
    const bob = graph.edges.filter((e) => e.source === "bob").length;
    return {
      byLayer,
      bob,
      parser: graph.edges.length - bob,
      pii: graph.nodes.filter((n) => n.pii).length,
      untested: graph.nodes.filter((n) => !n.parent && !n.tested).length,
    };
  }, [graph]);

  const runs = useMemo(() => changes.map((c) => ({ change: c, view: deriveRun(c) })), [changes]);
  const recentEvents = useMemo(
    () =>
      changes
        .flatMap((c) => c.events.filter((e) => ["blocked", "done", "approved", "change_completed", "check_failed"].includes(e.event)))
        .sort((a, b) => b.ts.localeCompare(a.ts))
        .slice(0, 6),
    [changes],
  );

  return (
    <PageShell>
      <PageHeader
        title="Overview"
        subtitle={graph ? `The knowledge graph of ${graph.repo} and the changes running on it.` : "Loading the knowledge graph…"}
        actions={
          <>
            <SecondaryLink href="/city">
              <MapIcon />
              Open Agent City
            </SecondaryLink>
            <PrimaryLink href="/changes/new">
              <GitBranch />
              New change
            </PrimaryLink>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiTile label="Components" value={graph?.nodes.length ?? "—"} icon={Boxes} delta={{ text: `${graph?.layers.length ?? 0} layers`, tone: "neutral" }} />
        <KpiTile label="Dependencies" value={graph?.edges.length ?? "—"} icon={Network} />
        <KpiTile label="Found by Bob" value={stats?.bob ?? "—"} icon={Sparkles} tone="inactive" accent />
        <KpiTile label="Personal data" value={stats?.pii ?? "—"} icon={ShieldCheck} tone="warning" delta={{ text: `${stats?.untested ?? 0} untested`, tone: "warning" }} />
        <KpiTile label="Changes shipped" value={runs.filter((r) => r.view.status === "completed").length} icon={GitBranch} tone="success" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card title="Components by district" subtitle="Where the system's parts live." className="lg:col-span-8">
          {mounted && stats ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats.byLayer} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid vertical={false} stroke="var(--divider)" />
                <XAxis dataKey="name" interval={0} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--text-tertiary)", fontWeight: 500 }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--text-disabled)", fontFamily: "var(--font-geist-mono)" }} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--brand-soft)", radius: 4 }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {stats.byLayer.map((l) => (
                    <Cell key={l.name} fill={l.count === Math.max(...stats.byLayer.map((x) => x.count)) ? "var(--brand)" : "var(--chart-3)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] bg-surface-secondary rounded-lg animate-pulse" />
          )}
        </Card>

        <Card title="How links were found" subtitle="Parsers find the certain links. Bob finds the hidden ones." className="lg:col-span-4">
          {mounted && stats ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={[{ name: "Parser", value: stats.parser }, { name: "Found by Bob", value: stats.bob }]} dataKey="value" innerRadius={58} outerRadius={80} stroke="var(--surface)" strokeWidth={2} paddingAngle={0}>
                    <Cell fill="var(--chart-3)" />
                    <Cell fill="var(--brand)" />
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5 type-caption"><span className="size-2 rounded-[2px]" style={{ background: "var(--chart-3)" }} /> Parser ({stats.parser})</span>
                <span className="inline-flex items-center gap-1.5 type-caption"><span className="size-2 rounded-[2px]" style={{ background: "var(--brand)" }} /> Found by Bob ({stats.bob})</span>
              </div>
            </div>
          ) : (
            <div className="h-[200px] bg-surface-secondary rounded-lg animate-pulse" />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card title="Recent changes" className="lg:col-span-7" actions={<Link href="/changes" className="text-caption font-semibold text-text-tertiary hover:text-text-primary">View all</Link>}>
          <div className="flex flex-col divide-y divide-border">
            {runs.length === 0 ? <p className="type-caption py-6 text-center">No changes yet. Start one from New change.</p> : null}
            {runs.slice(0, 5).map(({ change, view }) => (
              <Link key={change.id} href={`/changes/${change.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-surface-hover -mx-2 px-2 rounded-lg transition-colors">
                <div className="flex flex-col min-w-0">
                  <span className="text-body font-semibold text-text-primary truncate">{change.title}</span>
                  <span className="type-caption">
                    {change.id} · {change.report.fixUnits.length} files · {change.mode === "demo" ? "simulated" : "live"}
                  </span>
                </div>
                <StatusBadge status={STATUS_LABEL[view.status]} />
              </Link>
            ))}
          </div>
        </Card>

        <Card title="Agent activity" subtitle="Latest governed actions across all changes." className="lg:col-span-5">
          <div className="flex flex-col divide-y divide-border">
            {recentEvents.length === 0 ? <p className="type-caption py-6 text-center">No agent activity yet.</p> : null}
            {recentEvents.map((e, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex flex-col min-w-0">
                  <span className="text-body text-text-primary truncate">
                    {e.event === "change_completed" ? `Change ${e.change_id}` : e.event === "approved" ? `You approved ${e.file}` : e.agent_id}
                  </span>
                  <span className="type-caption truncate">
                    {e.event === "change_completed" ? "All files fixed and verified" : e.detail ?? e.file}
                  </span>
                </div>
                <StatusBadge
                  status={
                    e.event === "blocked" ? "Blocked" : e.event === "check_failed" ? "Failed" : e.event === "approved" ? "Approved" : e.event === "change_completed" ? "Completed" : "Done"
                  }
                />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
