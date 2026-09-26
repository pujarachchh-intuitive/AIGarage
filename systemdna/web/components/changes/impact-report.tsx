"use client";

import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, Building2, Check, ChevronDown, ChevronRight, FileCode2, Flame, Layers, Repeat2, SearchX, Waves } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { KpiTile } from "@/components/ui/kpi-tile";
import { Card } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { indexGraph } from "@/lib/impact";
import { layerLabel, SEVERITY_LABEL } from "@/lib/layers";
import { cn } from "@/lib/cn";
import type { Confidence, Graph, ImpactItem, ImpactReport, RiskFactor, RiskLevel } from "@/lib/types";

/** Small mono uppercase label, the house style for section and field labels. */
const MONO_LABEL = "font-mono text-[10.5px] leading-4 font-medium uppercase tracking-[0.06em] text-text-tertiary";

const LEVEL: Record<RiskLevel, { label: string; badge: "success" | "info" | "warning" | "destructive"; bar: string; text: string }> = {
  low: { label: "Low risk", badge: "success", bar: "bg-success", text: "text-success" },
  medium: { label: "Medium risk", badge: "info", bar: "bg-info", text: "text-info" },
  high: { label: "High risk", badge: "warning", bar: "bg-warning", text: "text-warning" },
  critical: { label: "Critical risk", badge: "destructive", bar: "bg-error", text: "text-error" },
};

/** The same bands the engine uses for the whole change (lib/impact.ts LEVELS). */
const BANDS: { level: RiskLevel; from: number; to: number }[] = [
  { level: "low", from: 0, to: 25 },
  { level: "medium", from: 25, to: 50 },
  { level: "high", from: 50, to: 70 },
  { level: "critical", from: 70, to: 100 },
];

function levelOf(risk: number): RiskLevel {
  return risk >= 70 ? "critical" : risk >= 50 ? "high" : risk >= 25 ? "medium" : "low";
}

const CONFIDENCE: Record<Confidence, { label: string; bars: number; variant: "success" | "info" | "warning"; fill: string; hint: string }> = {
  high: { label: "Sure", bars: 3, variant: "success", fill: "bg-success", hint: "Every link on the way is certain." },
  medium: { label: "Likely", bars: 2, variant: "info", fill: "bg-info", hint: "The weakest link on the way is likely, not certain." },
  low: { label: "Unsure", bars: 1, variant: "warning", fill: "bg-warning", hint: "The weakest link on the way is a guess. Check it by hand." },
};

/** How sure the engine is: the weakest link on the path from the change. */
export function ConfidenceBadge({ confidence, className }: { confidence: Confidence; className?: string }) {
  const c = CONFIDENCE[confidence];
  return (
    <Badge variant={c.variant} className={className} title={c.hint}>
      <span aria-hidden className="flex items-end gap-px h-2.5">
        {[1, 2, 3].map((b) => (
          <span key={b} className={cn("w-[3px] rounded-[1px]", b <= c.bars ? "bg-current" : "bg-current/25")} style={{ height: `${3 + b * 2.5}px` }} />
        ))}
      </span>
      {c.label}
    </Badge>
  );
}

/** The whole change's risk as one compact badge: score and level. */
export function RiskBadge({ score, level, className }: { score: number; level: RiskLevel; className?: string }) {
  return (
    <Badge variant={LEVEL[level].badge} className={cn("tabular-nums", className)} title={LEVEL[level].label}>
      <span className="font-semibold">{score}</span>
      <span className="opacity-70">{level}</span>
    </Badge>
  );
}

/** Text with `names` in backticks shown as code. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/g).map((part, i) =>
        part.startsWith("`") && part.endsWith("`") ? (
          <code key={i} className="px-1 py-px rounded bg-surface-secondary border border-border font-mono text-[0.85em] text-text-primary">
            {part.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** The score on a banded track: low, medium, high, critical. */
function ScoreGauge({ score, level }: { score: number; level: RiskLevel }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative flex h-2 gap-[2px]">
        {BANDS.map((b) => {
          const fill = Math.max(0, Math.min(1, (score - b.from) / (b.to - b.from)));
          return (
            <span key={b.level} className="relative h-full rounded-[2px] bg-surface-secondary overflow-hidden" style={{ width: `${b.to - b.from}%` }}>
              <span className={cn("absolute inset-y-0 left-0 transition-[width] duration-700 ease-out", LEVEL[level].bar)} style={{ width: `${fill * 100}%` }} />
            </span>
          );
        })}
        <span aria-hidden className="absolute -top-1 -bottom-1 w-[2px] rounded-full bg-text-primary transition-[left] duration-700 ease-out" style={{ left: `calc(${Math.min(99.5, score)}% - 1px)` }} />
      </div>
      <div className="flex font-mono text-[10px] leading-3 uppercase tracking-[0.06em] text-text-tertiary">
        {BANDS.map((b) => (
          <span key={b.level} className={cn("truncate", b.level === level && "text-text-primary font-semibold")} style={{ width: `${b.to - b.from}%` }}>
            {b.level === "critical" ? "Crit" : b.level === "medium" ? "Med" : b.level}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Sure / likely / unsure as one stacked bar with a legend. */
function ConfidenceSplit({ counts }: { counts: Record<Confidence, number> }) {
  const total = counts.high + counts.medium + counts.low;
  const order: Confidence[] = ["high", "medium", "low"];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-1.5 gap-[2px] rounded-full overflow-hidden bg-surface-secondary">
        {total > 0
          ? order.map((c) => (counts[c] ? <span key={c} className={cn("h-full", CONFIDENCE[c].fill)} style={{ width: `${(counts[c] / total) * 100}%` }} /> : null))
          : null}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {order.map((c) => (
          <span key={c} className="flex items-center gap-1.5 font-mono text-[10.5px] leading-4 text-text-secondary tabular-nums" title={CONFIDENCE[c].hint}>
            <span className={cn("size-1.5 rounded-full", CONFIDENCE[c].fill)} />
            {CONFIDENCE[c].label} {counts[c]}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The risk of the whole change: score, level, what drives it and what to do. */
export function RiskCard({ report, graph }: { report: ImpactReport; graph?: Graph }) {
  const risk = report.risk;
  const [checked, setChecked] = useState<Set<number>>(() => new Set());
  if (!risk) return null;
  const tone = LEVEL[risk.level];
  const maxDriver = Math.max(1, ...risk.drivers.map((d) => d.points));
  const files = risk.coverage.tested + risk.coverage.untested;
  const byItem = new Map(report.items.map((i) => [i.nodeId, i]));
  const nameOf = (id: string) => graph?.nodes.find((n) => n.id === id)?.name ?? id;
  const toggle = (k: number) =>
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <Card
      title="Risk assessment"
      subtitle="How risky this change is, why, and what to do before shipping it."
      className="relative overflow-hidden"
      actions={<Badge variant={tone.badge}>{tone.label}</Badge>}
    >
      <span aria-hidden className="absolute left-0 top-0 h-[2px] w-12 bg-brand" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-0 lg:divide-x lg:divide-border">
        {/* Score */}
        <div className="lg:col-span-3 flex flex-col gap-4 lg:pr-6">
          <span className={MONO_LABEL}>Score</span>
          <div className="flex items-end gap-2 -mt-1">
            <span className={cn("text-[56px] leading-[52px] font-semibold tracking-[-0.04em] tabular-nums", tone.text)}>{risk.score}</span>
            <span className="font-mono text-[11px] text-text-tertiary tabular-nums pb-1.5">/ 100</span>
          </div>
          <ScoreGauge score={risk.score} level={risk.level} />
          <div className="flex flex-col gap-3 pt-3 border-t border-border">
            <div className="flex items-center justify-between gap-2">
              <span className={MONO_LABEL}>Files with tests</span>
              <span className="font-mono text-[12px] font-semibold text-text-primary tabular-nums">
                {risk.coverage.known ? `${risk.coverage.tested} / ${files}` : "none in repo"}
              </span>
            </div>
            {risk.coverage.known && files > 0 ? (
              <div className="flex h-1 gap-[2px] -mt-1.5">
                {Array.from({ length: Math.min(files, 24) }, (_, k) => (
                  <span key={k} className={cn("flex-1 rounded-[1px]", k < Math.round((risk.coverage.tested / files) * Math.min(files, 24)) ? "bg-success" : "bg-surface-secondary")} />
                ))}
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <span className={MONO_LABEL}>Confidence</span>
              <ConfidenceSplit counts={risk.confidence} />
            </div>
          </div>
        </div>

        {/* Drivers */}
        <div className="lg:col-span-4 flex flex-col gap-3 lg:px-6">
          <div className="flex items-center justify-between gap-2">
            <span className={MONO_LABEL}>What drives it</span>
            <span className="font-mono text-[10.5px] text-text-tertiary">points</span>
          </div>
          {risk.drivers.length === 0 ? <p className="type-caption">Nothing stands out.</p> : null}
          <ol className="flex flex-col gap-3.5">
            {risk.drivers.map((d, k) => (
              <li key={d.label} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-body font-semibold text-text-primary">{d.label}</span>
                  <span className="font-mono text-[11px] font-semibold tabular-nums text-text-secondary">+{d.points}</span>
                </div>
                <div className="h-1 rounded-full bg-surface-secondary overflow-hidden">
                  <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", k === 0 ? tone.bar : "bg-text-tertiary")} style={{ width: `${(d.points / maxDriver) * 100}%` }} />
                </div>
                <span className="type-caption text-text-secondary">
                  <Rich text={d.detail} />
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* Recommendations */}
        <div className="lg:col-span-5 flex flex-col gap-3 lg:pl-6">
          <div className="flex items-center justify-between gap-2">
            <span className={MONO_LABEL}>Before you ship</span>
            <span className="font-mono text-[10.5px] text-text-tertiary tabular-nums">
              {checked.size} / {risk.recommendations.length} done
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {risk.recommendations.map((r, k) => {
              const on = checked.has(k);
              return (
                <li key={k}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(k)}
                    className="group w-full cursor-pointer flex items-start gap-2.5 -mx-2 px-2 py-1.5 rounded-md text-left transition-colors duration-150 hover:bg-surface-hover"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-150",
                        on ? "bg-brand border-brand text-brand-ink" : "border-border-strong bg-surface group-hover:border-text-tertiary",
                      )}
                    >
                      {on ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <span className={cn("text-body transition-colors duration-150", on ? "text-text-tertiary line-through decoration-text-tertiary/60" : "text-text-secondary")}>
                      <Rich text={r} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {risk.hotspots.length ? (
        <div className="flex flex-col gap-2 mt-5 pt-4 border-t border-border">
          <span className={cn(MONO_LABEL, "flex items-center gap-1.5")}>
            <Flame className="size-3" />
            Riskiest components
          </span>
          <div className="flex flex-wrap gap-2">
            {risk.hotspots.map((id) => {
              const it = byItem.get(id);
              const lv = levelOf(it?.risk ?? 0);
              return (
                <span key={id} className="inline-flex items-center gap-2 h-7 pl-2.5 pr-1.5 rounded-md border border-border bg-surface text-body text-text-primary">
                  <span className="font-semibold truncate max-w-[200px]">{nameOf(id)}</span>
                  <span className={cn("font-mono text-[11px] font-semibold tabular-nums px-1 rounded-[3px] bg-surface-secondary", LEVEL[lv].text)}>{it?.risk ?? "—"}</span>
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export function ImpactKpis({ report }: { report: ImpactReport }) {
  const count = (s: string) => report.items.filter((i) => i.severity === s).length;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <KpiTile label="Components affected" value={report.items.filter((i) => i.severity !== "safe").length} icon={Layers} tone="error" delta={{ text: `${count("breaking")} breaking`, tone: "error" }} />
      <KpiTile label="Files to change" value={report.fixUnits.length} icon={FileCode2} delta={{ text: `${report.fixUnits.filter((u) => u.needsApproval).length} need approval`, tone: "warning" }} />
      <KpiTile label="Fix waves" value={report.waveCount} icon={Waves} delta={{ text: "upstream first", tone: "neutral" }} />
      <KpiTile label="Business processes hit" value={report.business.filter((b) => b.severity !== "safe").length} icon={Building2} tone="warning" delta={{ text: `${report.business.filter((b) => b.severity === "safe").length} protected`, tone: "success" }} />
      <KpiTile
        label="Grep missed / false alarms"
        value={`${report.grep.missed.length} / ${report.grep.falsePositives.length}`}
        icon={SearchX}
        tone="inactive"
        delta={{ text: `of ${report.fixUnits.length} files`, tone: "neutral" }}
      />
    </div>
  );
}

/** Opacity steps so neighbouring factor segments read apart without new colours. */
const SEGMENT_OPACITY = ["opacity-100", "opacity-70", "opacity-50", "opacity-35", "opacity-25"];

/** The item's risk as a bar split into its factors (hover for the numbers). */
function RiskBar({ item }: { item: ImpactItem }) {
  const lv = levelOf(item.risk);
  const factors = (item.factors ?? []).filter((f) => f.points > 0);
  const sum = factors.reduce((s, f) => s + f.points, 0);
  const scale = sum > 0 ? item.risk / sum : 0;
  const title = factors.length ? `Risk ${item.risk}: ${factors.map((f) => `${f.label} +${f.points}`).join(" · ")}` : `Risk ${item.risk}`;
  return (
    <div className="flex items-center gap-2" title={title}>
      <div className="flex w-20 h-1.5 gap-px rounded-full bg-surface-secondary overflow-hidden">
        {factors.length ? (
          factors.map((f, k) => (
            <span key={f.label} className={cn("h-full", LEVEL[lv].bar, SEGMENT_OPACITY[Math.min(k, SEGMENT_OPACITY.length - 1)])} style={{ width: `${f.points * scale}%` }} />
          ))
        ) : (
          <span className={cn("h-full", LEVEL[lv].bar)} style={{ width: `${item.risk}%` }} />
        )}
      </div>
      <span className={cn("w-6 font-mono text-[11px] font-semibold tabular-nums", item.risk >= 50 ? LEVEL[lv].text : "text-text-secondary")}>{item.risk}</span>
    </div>
  );
}

/** Compact breadcrumb of the path from the change: first, …, the one before this. */
function PathCrumbs({ path, name }: { path: string[]; name: (id: string) => string }) {
  // The last step is the row itself; show where it came from.
  const from = path.slice(0, -1);
  const shown = from.length > 3 ? [from[0], null, ...from.slice(-2)] : from;
  return (
    <span className="flex items-center gap-1 min-w-0 font-mono text-[10.5px] leading-4 text-text-tertiary" title={path.map(name).join(" → ")}>
      {shown.map((id, k) => (
        <Fragment key={id ?? `gap-${k}`}>
          {k > 0 ? <ChevronRight className="size-2.5 shrink-0 opacity-60" /> : null}
          <span className="truncate max-w-[120px]">{id ? name(id) : "…"}</span>
        </Fragment>
      ))}
      <ChevronRight className="size-2.5 shrink-0 opacity-60" />
      <span className="text-text-secondary">here</span>
    </span>
  );
}

/** Loops inside each fix step: strongly connected groups of same-step nodes (Tarjan). */
function findLoops(rows: ImpactItem[], graph: Graph): Map<string, number> {
  const depth = new Map(rows.map((r) => [r.nodeId, r.depth]));
  const out = new Map<string, string[]>();
  for (const e of graph.edges) {
    const d = depth.get(e.from);
    if (d === undefined || d !== depth.get(e.to) || e.from === e.to) continue;
    out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  }
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const loopOf = new Map<string, number>();
  let counter = 0;
  let loops = 0;
  const visit = (v: string) => {
    index.set(v, counter);
    low.set(v, counter++);
    stack.push(v);
    onStack.add(v);
    for (const w of out.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
    }
    if (low.get(v) === index.get(v)) {
      const group: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        group.push(w);
      } while (w !== v);
      if (group.length > 1) {
        loops++;
        for (const id of group) loopOf.set(id, loops);
      }
    }
  };
  for (const v of out.keys()) if (!index.has(v)) visit(v);
  return loopOf;
}

const LOOP_LETTER = (n: number) => String.fromCharCode(64 + ((n - 1) % 26) + 1);

function FactorList({ factors }: { factors: RiskFactor[] }) {
  const max = Math.max(1, ...factors.map((f) => f.points));
  return (
    <div className="flex flex-col gap-1.5">
      {factors.map((f) => (
        <div key={f.label} className="grid grid-cols-[40px_140px_64px_1fr] items-center gap-3 text-body">
          <span className="text-right font-mono text-[11px] font-semibold tabular-nums text-text-primary">{f.points > 0 ? `+${f.points}` : "·"}</span>
          <span className="font-semibold text-text-primary truncate">{f.label}</span>
          <span className="h-1 rounded-full bg-surface-secondary overflow-hidden">
            <span className="block h-full rounded-full bg-text-tertiary" style={{ width: `${(Math.max(0, f.points) / max) * 100}%` }} />
          </span>
          <span className="text-text-secondary min-w-0">
            <Rich text={f.detail} />
          </span>
        </div>
      ))}
    </div>
  );
}

export function AffectedTable({ report, graph }: { report: ImpactReport; graph: Graph }) {
  const { byId } = indexGraph(graph);
  const edgeById = new Map(graph.edges.map((e) => [e.id, e]));
  const hot = new Set(report.risk?.hotspots.slice(0, 3));
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const name = (id: string) => byId.get(id)?.name ?? id;

  // Rows in fix order; inside a step, loop members sit together, riskiest first.
  const { steps, loopOf } = useMemo(() => {
    const rows = report.items.filter((i) => i.depth > 0);
    const loopOf = findLoops(rows, graph);
    const sorted = [...rows].sort((a, b) => a.depth - b.depth || (loopOf.get(a.nodeId) ?? 1e9) - (loopOf.get(b.nodeId) ?? 1e9) || b.risk - a.risk);
    const steps: { depth: number; rows: ImpactItem[] }[] = [];
    for (const r of sorted) {
      const last = steps[steps.length - 1];
      if (last?.depth === r.depth) last.rows.push(r);
      else steps.push({ depth: r.depth, rows: [r] });
    }
    return { steps, loopOf };
  }, [report.items, graph]);

  const COLS = 7;
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-surface">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Component</TableHead>
            <TableHead>District</TableHead>
            <TableHead>Impact</TableHead>
            <TableHead>Risk</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead>Link</TableHead>
            <TableHead>Evidence</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {steps.map((step) => {
            const loops = [...new Set(step.rows.map((r) => loopOf.get(r.nodeId)).filter((x): x is number => x !== undefined))];
            return (
              <Fragment key={step.depth}>
                <TableRow className="bg-surface-secondary/40 hover:bg-surface-secondary/40">
                  <TableCell colSpan={COLS} className="py-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10.5px] leading-4 font-semibold uppercase tracking-[0.06em] text-text-primary">Step {step.depth}</span>
                      <span className="font-mono text-[10.5px] leading-4 uppercase tracking-[0.06em] text-text-tertiary">
                        {step.rows.length} {step.rows.length === 1 ? "component" : "components"}
                      </span>
                      {loops.map((l) => (
                        <Badge key={l} variant="outline" title="These depend on each other, so they are fixed together in one step.">
                          <Repeat2 />
                          Loop {LOOP_LETTER(l)} · {step.rows.filter((r) => loopOf.get(r.nodeId) === l).length} fixed together
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
                {step.rows.map((item) => {
                  const n = byId.get(item.nodeId)!;
                  const e = item.viaEdge ? edgeById.get(item.viaEdge) : undefined;
                  const why = Boolean(item.factors?.length || (item.path?.length ?? 0) > 2);
                  const expanded = open.has(item.nodeId);
                  const loop = loopOf.get(item.nodeId);
                  return (
                    <Fragment key={item.nodeId}>
                      <TableRow className={cn(why && "cursor-pointer")} onClick={why ? () => toggle(item.nodeId) : undefined} aria-expanded={why ? expanded : undefined}>
                        <TableCell className="relative">
                          {loop !== undefined ? <span aria-hidden className="absolute left-3 inset-y-0 w-px bg-border-strong" /> : null}
                          <div className="flex items-start gap-1.5">
                            {why ? (
                              expanded ? (
                                <ChevronDown className="size-3.5 mt-0.5 text-icon-secondary shrink-0" />
                              ) : (
                                <ChevronRight className="size-3.5 mt-0.5 text-icon-secondary shrink-0" />
                              )
                            ) : (
                              <span className="w-3.5 shrink-0" />
                            )}
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="flex flex-wrap items-center gap-1.5 font-semibold text-text-primary">
                                {n.name}
                                {hot.has(item.nodeId) ? (
                                  <Badge variant="destructive">
                                    <Flame />
                                    Hotspot
                                  </Badge>
                                ) : null}
                                {loop !== undefined ? (
                                  <Badge variant="outline" title="Part of a loop: fixed in the same step as the rest of it.">
                                    <Repeat2 />
                                    {LOOP_LETTER(loop)}
                                  </Badge>
                                ) : null}
                                {(item.links ?? 0) > 1 ? (
                                  <Badge variant="neutral" title="More than one affected link reaches this, so it can break in more than one way.">
                                    {item.links} links
                                  </Badge>
                                ) : null}
                              </span>
                              <span className="type-caption truncate">{n.file}</span>
                              {item.path && item.path.length > 2 ? <PathCrumbs path={item.path} name={name} /> : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-text-secondary">{layerLabel(graph, n.layer)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <StatusBadge status={n.layer === "business" && item.severity !== "safe" ? "Affected" : SEVERITY_LABEL[item.severity]} />
                            {item.needsApproval ? <Badge variant="warning">Approval</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <RiskBar item={item} />
                        </TableCell>
                        <TableCell>
                          <ConfidenceBadge confidence={item.confidence} />
                        </TableCell>
                        <TableCell>{e?.source === "bob" ? <StatusBadge status="Found by Bob" /> : <Badge variant="neutral">Parser</Badge>}</TableCell>
                        <TableCell className="type-caption">{e?.evidence ?? "—"}</TableCell>
                      </TableRow>
                      {expanded ? (
                        <TableRow className="bg-surface-secondary/60 hover:bg-surface-secondary/60">
                          <TableCell colSpan={COLS} className="whitespace-normal">
                            <div className="flex flex-col gap-3 pl-5 py-1.5 animate-in fade-in duration-200">
                              {item.path && item.path.length > 1 ? (
                                <div className="flex flex-col gap-1.5">
                                  <span className={MONO_LABEL}>How the change gets here</span>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {item.path.map((id, k) => (
                                      <Fragment key={id}>
                                        {k > 0 ? <ChevronRight className="size-3 text-icon-secondary" /> : null}
                                        <span
                                          className={cn(
                                            "px-1.5 py-px rounded border font-mono text-[11px]",
                                            k === 0 ? "border-brand/60 bg-brand-soft text-brand-text" : "border-border bg-surface text-text-secondary",
                                            k === item.path!.length - 1 && "font-semibold text-text-primary border-border-strong",
                                          )}
                                        >
                                          {name(id)}
                                        </span>
                                      </Fragment>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                              {item.factors?.length ? (
                                <div className="flex flex-col gap-1.5">
                                  <span className={cn(MONO_LABEL, "flex items-center gap-2")}>
                                    Risk {item.risk} / 100
                                    <span className="normal-case tracking-normal">· {CONFIDENCE[item.confidence].hint}</span>
                                  </span>
                                  <FactorList factors={item.factors} />
                                </div>
                              ) : (
                                <p className="type-caption">Safe: the ripple stops here, so there is nothing to fix.</p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function GrepCard({ report }: { report: ImpactReport }) {
  const foundUseful = report.grep.found.length - report.grep.falsePositives.length;
  return (
    <Card
      title="SystemDNA compared with grep"
      subtitle={`A plain text search for "${report.oldName}" finds ${foundUseful} of the ${report.fixUnits.length} files that need a change${report.grep.falsePositives.length ? `, plus ${report.grep.falsePositives.length} a find-and-replace would change by mistake` : ""}.`}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className={MONO_LABEL}>Missed by grep ({report.grep.missed.length})</p>
          {report.grep.missed.length === 0 ? <p className="type-caption">Nothing missed.</p> : null}
          {report.grep.missed.map((file) => {
            const unit = report.fixUnits.find((u) => u.file === file);
            return (
              <div key={file} className="flex items-start gap-2.5">
                <AlertTriangle className="size-4 text-warning mt-0.5 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-body font-semibold text-text-primary truncate">{file}</span>
                  <span className="type-caption">{unit ? `Wave ${unit.wave} · ${unit.nodes.length} affected` : ""}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          <p className={MONO_LABEL}>False alarms ({report.grep.falsePositives.length})</p>
          {report.grep.falsePositives.length === 0 ? <p className="type-caption">No false matches.</p> : null}
          {report.grep.falsePositives.map((file) => (
            <div key={file} className="flex items-center justify-between gap-2">
              <span className="text-body text-text-secondary truncate">{file}</span>
              <span className="type-caption shrink-0">same word, different thing</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function BusinessCard({ report }: { report: ImpactReport }) {
  return (
    <Card title="Business impact" subtitle="What the business uses that depends on the affected code.">
      <div className="flex flex-col divide-y divide-border">
        {report.business.length === 0 ? <p className="type-caption py-2">No business process is affected.</p> : null}
        {report.business.map((b) => (
          <div key={b.nodeId} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex flex-col min-w-0">
              <span className="text-body font-semibold text-text-primary">{b.name}</span>
              {b.owner ? <span className="type-caption">Owner: {b.owner}</span> : null}
            </div>
            <StatusBadge status={b.severity === "safe" ? "Safe" : "Affected"} />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function WavesCard({ report }: { report: ImpactReport }) {
  const waves = Array.from({ length: report.waveCount }, (_, i) => i + 1);
  return (
    <Card title="Fix plan" subtitle="One Bob agent per file. Each wave starts only when the wave before it is green.">
      <div className="flex flex-col gap-4">
        {waves.map((w) => {
          const units = report.fixUnits.filter((u) => u.wave === w);
          return (
            <div key={w} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "size-6 rounded-md border font-mono text-[11px] font-semibold tabular-nums flex items-center justify-center",
                    w === 1 ? "border-brand/60 bg-brand-soft text-brand-text" : "border-border bg-surface-secondary text-text-primary",
                  )}
                >
                  {w}
                </span>
                {w < report.waveCount ? <span className="w-px flex-1 bg-border mt-1" /> : null}
              </div>
              <div className="flex flex-col gap-1.5 pb-1 min-w-0 flex-1">
                <span className={MONO_LABEL}>
                  Wave {w} · {units.length} {units.length === 1 ? "agent" : "agents"}
                </span>
                {units.map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-2">
                    <span className="text-body text-text-primary truncate">{u.file}</span>
                    {u.needsApproval ? <Badge variant="warning" className="shrink-0">{u.approvalReason}</Badge> : null}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
