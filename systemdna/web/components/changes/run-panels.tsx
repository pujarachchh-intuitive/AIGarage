"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2, GitPullRequest, Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { indexGraph } from "@/lib/impact";
import type { AgentState, RunView } from "@/lib/run-state";
import type { Change, Graph, RunEvent } from "@/lib/types";

export const AGENT_STATE_LABEL: Record<AgentState, string> = {
  queued: "Queued",
  awaiting_approval: "Awaiting approval",
  reading: "Reading",
  editing: "Editing",
  verifying: "Verifying",
  retrying: "Retrying",
  blocked: "Blocked",
  done: "Done",
  quarantined: "Quarantined",
};

function describe(ev: RunEvent): { text: string; tone: "neutral" | "info" | "warning" | "error" | "success" } {
  const who = ev.agent_id ?? "";
  switch (ev.event) {
    case "impact_ready":
      return { text: "Impact analysis ready", tone: "neutral" };
    case "awaiting_approval":
      return { text: `Waiting for approval: ${ev.file} (${ev.detail})`, tone: "warning" };
    case "approved":
      return { text: `Approved: ${ev.file}`, tone: "success" };
    case "wave_started":
      return { text: `Wave ${ev.wave} started with ${ev.data?.agents ?? "?"} agents`, tone: "neutral" };
    case "agent_started":
      return { text: `${who} received a permit for ${ev.file}`, tone: "neutral" };
    case "tool_call":
      return ev.permit_ok === false
        ? { text: `${who} tried ${ev.tool} on ${ev.file}`, tone: "error" }
        : { text: `${who} ${ev.tool} ${ev.file ?? ""}`, tone: ev.tool === "read_file" ? "info" : "warning" };
    case "blocked":
      return { text: `Blocked ${who}: ${ev.detail}`, tone: "error" };
    case "check_failed":
      return { text: `${who} check failed: ${ev.detail}`, tone: "error" };
    case "retrying":
      return { text: `${who} retrying with the error message`, tone: "warning" };
    case "check_passed":
      return { text: `${who}: ${ev.detail}`, tone: "info" };
    case "done":
      return { text: `${who} done${ev.detail ? `: ${ev.detail}` : ""}`, tone: "success" };
    case "quarantined":
      return { text: `${who} quarantined: ${ev.detail}`, tone: "error" };
    case "wave_completed":
      return { text: `Wave ${ev.wave} complete`, tone: "success" };
    case "rescan":
      return ev.detail
        ? { text: ev.detail, tone: Number(ev.data?.after ?? 0) === 0 ? "success" : "warning" }
        : { text: `Graph re-scan: dangling references ${ev.data?.before} → ${ev.data?.after}`, tone: "success" };
    case "inspector":
      if (ev.data?.verdict === "skipped") return { text: ev.detail ?? "Inspector skipped", tone: "neutral" };
      return { text: `Inspector ${String(ev.data?.verdict).replace("_", " ")}: ${ev.data?.issues} issues`, tone: ev.data?.verdict === "approved" ? "success" : "warning" };
    case "pr_created":
      return { text: `Branch ${ev.data?.branch} ready${ev.data?.simulated ? " (simulated)" : ""}`, tone: "success" };
    case "change_completed":
      return ev.detail
        ? { text: ev.detail, tone: /^(Failed|Stopped|Refused)/.test(ev.detail) ? "error" : /need a human|type errors and/.test(ev.detail) ? "warning" : "success" }
        : { text: "Change complete", tone: "success" };
  }
}

const DOT: Record<string, string> = {
  neutral: "bg-icon-secondary",
  info: "bg-info",
  warning: "bg-warning",
  error: "bg-error",
  success: "bg-success",
};

export function TraceTimeline({ events, startedAt, className }: { events: RunEvent[]; startedAt?: string; className?: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [events.length]);
  const t0 = startedAt ? Date.parse(startedAt) : events[0] ? Date.parse(events[0].ts) : 0;

  return (
    <Card title="Trace" subtitle={`${events.length} events`} className={cn("min-h-0", className)} bodyClassName="flex-1 min-h-0 overflow-y-auto scroll-thin">
      {events.length === 0 ? <p className="type-caption py-8 text-center">Waiting for the first event…</p> : null}
      <ol className="flex flex-col">
        {events.map((ev, i) => {
          const d = describe(ev);
          const secs = Math.max(0, Math.round((Date.parse(ev.ts) - t0) / 1000));
          return (
            <li key={i} className="flex gap-3 py-1.5">
              <span className="type-caption w-10 shrink-0 tabular-nums">
                {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
              </span>
              <span className={cn("size-2 rounded-full mt-1.5 shrink-0", DOT[d.tone])} />
              <span className={cn("text-caption font-medium break-words min-w-0", d.tone === "error" ? "text-error" : "text-text-secondary")}>
                {d.text}
              </span>
            </li>
          );
        })}
      </ol>
      <div ref={endRef} />
    </Card>
  );
}

export function AgentsTable({ view }: { view: RunView }) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Agent</TableHead>
            <TableHead>Wave</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Last action</TableHead>
            <TableHead className="text-right">Bobcoins</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {view.agents.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-12 text-center type-caption">
                No agents yet. They start when the plan is approved.
              </TableCell>
            </TableRow>
          ) : null}
          {view.agents.map((a) => (
            <TableRow key={a.id}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-semibold text-text-primary">{a.id}</span>
                  <span className="type-caption">{a.file}</span>
                </div>
              </TableCell>
              <TableCell className="text-text-secondary">{a.wave}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={AGENT_STATE_LABEL[a.state]} />
                  {a.retries > 0 ? <Badge variant="neutral">{a.retries} retry</Badge> : null}
                </div>
              </TableCell>
              <TableCell className="type-caption max-w-[280px] truncate">{a.lastAction}</TableCell>
              <TableCell className="text-right tabular-nums text-text-secondary">{a.bobcoins.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function GovernancePanel({ view, change, graph }: { view: RunView; change: Change; graph: Graph }) {
  const { byId } = indexGraph(graph);
  const piiUnits = change.report.fixUnits.filter((u) => u.nodes.some((id) => byId.get(id)?.pii) || byId.get(u.id)?.pii);
  return (
    <Card title="Governance" subtitle="Every action checked against its permit.">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="type-label">Blocked actions ({view.blocked.length})</p>
          {view.blocked.length === 0 ? <p className="type-caption">None so far.</p> : null}
          {view.blocked.map((b, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <ShieldAlert className="size-4 text-error mt-0.5 shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-body font-semibold text-text-primary">{b.agent_id}</span>
                <span className="type-caption">{b.detail}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <p className="type-label">Approvals ({view.approvals.length})</p>
          {view.approvals.length === 0 && view.pendingApprovals.length === 0 ? <p className="type-caption">None needed.</p> : null}
          {view.pendingApprovals.map((p) => (
            <div key={p.unit} className="flex items-center justify-between gap-2">
              <span className="text-body text-text-primary truncate">{p.file}</span>
              <StatusBadge status="Awaiting approval" />
            </div>
          ))}
          {view.approvals.map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="text-body text-text-primary truncate">{a.file}</span>
              <StatusBadge status="Approved" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <p className="type-label">Personal data touched ({piiUnits.length})</p>
          {piiUnits.map((u) => (
            <div key={u.id} className="flex items-center gap-2">
              <Lock className="size-3.5 text-icon-secondary" />
              <span className="text-body text-text-primary truncate">{u.file}</span>
            </div>
          ))}
        </div>
        {view.inspector || view.pr ? (
          <div className="flex flex-col gap-2 pt-3 border-t border-border">
            {view.inspector ? (
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-success" />
                <span className="text-body text-text-primary">
                  Inspector {view.inspector.verdict}, {view.inspector.issues} issues
                </span>
              </div>
            ) : null}
            {view.pr ? (
              <div className="flex items-center gap-2">
                <GitPullRequest className="size-4 text-icon-secondary" />
                <span className="text-body text-text-primary truncate">{view.pr.branch}</span>
                {view.pr.simulated ? <Badge variant="neutral">Simulated</Badge> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function GraphDiffCard({ change, graph, view }: { change: Change; graph: Graph; view: RunView }) {
  const { byId } = indexGraph(graph);
  const severity = new Map(change.report.items.map((i) => [i.nodeId, i.severity]));
  const changed = graph.edges.filter((e) => {
    // Calls and imports do not name the field, so they are not part of the diff.
    if (e.rule === "passthrough") return false;
    const s = severity.get(e.from);
    const t = severity.get(e.to);
    return s === "breaking" && t && t !== "safe";
  });
  return (
    <Card
      title="Graph diff"
      subtitle={
        change.request.change === "rename"
          ? `Every link that pointed at "${change.report.oldName}" now points at "${change.request.to}".`
          : `The links the change broke, and whether each was fixed.`
      }
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="destructive">{view.danglingBefore ?? change.report.danglingRefs} before</Badge>
          <Badge variant="success">{view.danglingAfter ?? 0} dangling after</Badge>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
        {changed.map((e) => (
          <div key={e.id} className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="size-4 text-success shrink-0" />
            <span className="text-body text-text-secondary truncate">
              {byId.get(e.from)?.name} → {byId.get(e.to)?.name}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
