"use client";

import { AlertTriangle, Building2, FileCode2, Layers, SearchX, Waves } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { KpiTile } from "@/components/ui/kpi-tile";
import { Card } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { indexGraph } from "@/lib/impact";
import { layerLabel, SEVERITY_LABEL } from "@/lib/layers";
import type { Graph, ImpactReport } from "@/lib/types";

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
            return (
              <TableRow key={item.nodeId}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-semibold text-text-primary">{n.name}</span>
                    <span className="type-caption">{n.file}</span>
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
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                      <div className="h-full bg-zinc-950 rounded-full" style={{ width: `${item.risk}%` }} />
                    </div>
                    <span className="type-caption text-text-secondary">{item.risk}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {e?.source === "bob" ? <StatusBadge status="Found by Bob" /> : <Badge variant="neutral">Parser</Badge>}
                </TableCell>
                <TableCell className="type-caption">{e?.evidence ?? "—"}</TableCell>
              </TableRow>
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
                <span className="size-6 rounded-full bg-zinc-900 text-white text-caption font-semibold flex items-center justify-center">{w}</span>
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
