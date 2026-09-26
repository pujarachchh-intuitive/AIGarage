"use client";

import { Fragment, useState } from "react";
import { AlertTriangle, Building2, ChevronDown, ChevronRight, FileCode2, Gauge, Layers, SearchX, ShieldAlert, Waves } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { KpiTile } from "@/components/ui/kpi-tile";
import { Card } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { indexGraph } from "@/lib/impact";
import { layerLabel, SEVERITY_LABEL } from "@/lib/layers";
import { cn } from "@/lib/cn";
import type { Graph, ImpactReport, RiskLevel } from "@/lib/types";

const LEVEL: Record<RiskLevel, { label: string; badge: "success" | "info" | "warning" | "destructive"; bar: string; text: string }> = {
  low: { label: "Low risk", badge: "success", bar: "bg-success", text: "text-success" },
  medium: { label: "Medium risk", badge: "info", bar: "bg-info", text: "text-info" },
  high: { label: "High risk", badge: "warning", bar: "bg-warning", text: "text-warning" },
  critical: { label: "Critical risk", badge: "destructive", bar: "bg-error", text: "text-error" },
};

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

/** The risk of the whole change: score, level, what drives it and what to do. */
export function RiskCard({ report }: { report: ImpactReport }) {
  const risk = report.risk;
  if (!risk) return null;
  const tone = LEVEL[risk.level];
  const maxDriver = Math.max(1, ...risk.drivers.map((d) => d.points));
  const sure = risk.confidence.high;
  const unsure = risk.confidence.medium + risk.confidence.low;
  const files = risk.coverage.tested + risk.coverage.untested;
  return (
    <Card title="Risk assessment" subtitle="How risky this change is, why, and what to do before shipping it." actions={<Badge variant={tone.badge}>{tone.label}</Badge>}>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-3 flex flex-col gap-3">
          <div className="flex items-end gap-1.5">
            <span className={cn("text-5xl font-semibold tracking-tighter tabular-nums", tone.text)}>{risk.score}</span>
            <span className="type-caption pb-1.5">/ 100</span>
          </div>
          <div className="relative h-2 rounded-full bg-surface-secondary overflow-hidden">
            <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", tone.bar)} style={{ width: `${risk.score}%` }} />
            {[25, 50, 70].map((m) => (
              <span key={m} className="absolute top-0 bottom-0 w-px bg-background/80" style={{ left: `${m}%` }} />
            ))}
          </div>
          <div className="flex flex-col gap-1.5 pt-1">
            <span className="flex items-center justify-between gap-2 text-body">
              <span className="text-text-secondary">Files with tests</span>
              <span className="font-semibold text-text-primary tabular-nums">{risk.coverage.known ? `${risk.coverage.tested} of ${files}` : "No tests in repo"}</span>
            </span>
            <span className="flex items-center justify-between gap-2 text-body">
              <span className="text-text-secondary">Sure / less sure</span>
              <span className="font-semibold text-text-primary tabular-nums">
                {sure} / {unsure}
              </span>
            </span>
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-3">
          <p className="type-label flex items-center gap-1.5">
            <Gauge className="size-3.5" />
            What drives it
          </p>
          {risk.drivers.length === 0 ? <p className="type-caption">Nothing stands out.</p> : null}
          {risk.drivers.map((d) => (
            <div key={d.label} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-body font-semibold text-text-primary">{d.label}</span>
                <div className="w-20 h-1.5 rounded-full bg-surface-secondary overflow-hidden shrink-0">
                  <div className="h-full rounded-full bg-text-primary" style={{ width: `${(d.points / maxDriver) * 100}%` }} />
                </div>
              </div>
              <span className="type-caption">
                <Rich text={d.detail} />
              </span>
            </div>
          ))}
        </div>

        <div className="lg:col-span-5 flex flex-col gap-3">
          <p className="type-label flex items-center gap-1.5">
            <ShieldAlert className="size-3.5" />
            What to do
          </p>
          <ol className="flex flex-col gap-2">
            {risk.recommendations.map((r, i) => (
              <li key={i} className="flex gap-2.5 text-body text-text-secondary">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-secondary border border-border text-caption font-semibold text-text-primary">{i + 1}</span>
                <span>
                  <Rich text={r} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
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

export function AffectedTable({ report, graph }: { report: ImpactReport; graph: Graph }) {
  const { byId } = indexGraph(graph);
  const edgeById = new Map(graph.edges.map((e) => [e.id, e]));
  const rows = report.items.filter((i) => i.depth > 0);
  const hot = new Set(report.risk?.hotspots.slice(0, 3));
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Component</TableHead>
            <TableHead>District</TableHead>
            <TableHead>Impact</TableHead>
            <TableHead>Risk</TableHead>
            <TableHead>Link</TableHead>
            <TableHead>Evidence</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((item) => {
            const n = byId.get(item.nodeId)!;
            const e = item.viaEdge ? edgeById.get(item.viaEdge) : undefined;
            const why = Boolean(item.factors?.length || (item.path?.length ?? 0) > 2);
            const expanded = open.has(item.nodeId);
            return (
              <Fragment key={item.nodeId}>
                <TableRow className={cn(why && "cursor-pointer")} onClick={why ? () => toggle(item.nodeId) : undefined} aria-expanded={why ? expanded : undefined}>
                  <TableCell>
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
                      <div className="flex flex-col">
                        <span className="flex items-center gap-1.5 font-semibold text-text-primary">
                          {n.name}
                          {hot.has(item.nodeId) ? <Badge variant="destructive">Hotspot</Badge> : null}
                        </span>
                        <span className="type-caption">{n.file}</span>
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
                  <div className="flex items-center gap-2" title={item.factors?.map((f) => `${f.label} +${f.points}`).join(" · ")}>
                    <div className="w-16 h-1.5 rounded-full bg-surface-secondary overflow-hidden">
                      <div className={cn("h-full rounded-full", item.risk >= 70 ? "bg-error" : item.risk >= 50 ? "bg-warning" : "bg-text-primary")} style={{ width: `${item.risk}%` }} />
                    </div>
                    <span className="type-caption text-text-secondary tabular-nums">{item.risk}</span>
                    {item.confidence !== "high" ? <Badge variant="neutral">{item.confidence === "low" ? "Unsure" : "Likely"}</Badge> : null}
                  </div>
                </TableCell>
                <TableCell>
                  {e?.source === "bob" ? <StatusBadge status="Found by Bob" /> : <Badge variant="neutral">Parser</Badge>}
                </TableCell>
                <TableCell className="type-caption">{e?.evidence ?? "—"}</TableCell>
                </TableRow>
                {expanded ? (
                  <TableRow className="bg-surface-secondary/60 hover:bg-surface-secondary/60">
                    <TableCell colSpan={6}>
                      <div className="flex flex-col gap-3 pl-5 py-1 animate-in fade-in duration-200">
                        {item.path && item.path.length > 1 ? (
                          <div className="flex flex-wrap items-center gap-1.5 type-caption">
                            <span className="font-semibold text-text-primary">How the change gets here:</span>
                            {item.path.map((id, k) => (
                              <Fragment key={id}>
                                {k > 0 ? <ChevronRight className="size-3 text-icon-secondary" /> : null}
                                <span className={cn("px-1.5 py-px rounded border border-border bg-surface", k === item.path!.length - 1 && "font-semibold text-text-primary")}>{byId.get(id)?.name ?? id}</span>
                              </Fragment>
                            ))}
                          </div>
                        ) : null}
                        {item.factors?.length ? (
                          <div className="flex flex-col gap-1">
                            {item.factors.map((f) => (
                              <div key={f.label} className="flex items-center gap-3 text-body">
                                <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-text-primary">{f.points > 0 ? `+${f.points}` : "·"}</span>
                                <span className="w-36 shrink-0 font-semibold text-text-primary">{f.label}</span>
                                <span className="text-text-secondary">{f.detail}</span>
                              </div>
                            ))}
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
          <p className="type-label">Missed by grep ({report.grep.missed.length})</p>
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
          <p className="type-label">False alarms ({report.grep.falsePositives.length})</p>
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
                <span className="size-6 rounded-full bg-text-primary text-surface text-caption font-semibold flex items-center justify-center">{w}</span>
                {w < report.waveCount ? <span className="w-px flex-1 bg-border mt-1" /> : null}
              </div>
              <div className="flex flex-col gap-1.5 pb-1 min-w-0 flex-1">
                <span className="type-caption">
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
