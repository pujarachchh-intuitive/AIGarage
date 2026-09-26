"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ClipboardList, ShieldAlert, ShieldCheck, UserCheck } from "lucide-react";
import { KpiTile } from "@/components/ui/kpi-tile";
import { Card, PageHeader, PageShell } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRepoChanges } from "@/lib/store";
import type { RunEventType } from "@/lib/types";

// City-wide laws from PRD section 10. Status says what this build enforces.
const LAWS: { law: string; rule: string; by: string; status: "Enforced" | "Planned" }[] = [
  { law: "Permit law", rule: "Edit only the files on your permit", by: "PreToolUse hook, exit code 2", status: "Enforced" },
  { law: "One builder per building", rule: "No two agents on one file", by: "Orchestrator lock", status: "Enforced" },
  { law: "Traffic lights", rule: "A wave starts only when the wave before it is green", by: "Orchestrator", status: "Enforced" },
  { law: "Approval gate", rule: "Database and personal-data files wait for a person", by: "Orchestrator", status: "Enforced" },
  { law: "Budget law", rule: "Bobcoin cap per agent and per change", by: "--max-cost + cost meter", status: "Enforced" },
  { law: "Inspection law", rule: "Nothing merges without passing checks and Inspector approval", by: "Workflow", status: "Enforced" },
  { law: "Completeness law", rule: "Done only when the re-scan shows 0 dangling references", by: "Verifier", status: "Enforced" },
  { law: "Record law", rule: "Every action is logged", by: "Hooks to the audit log", status: "Enforced" },
  { law: "Two-strike law", rule: "2 blocked actions means quarantine and rollback", by: "Hook counter + orchestrator", status: "Planned" },
];

const AUDITED: RunEventType[] = ["agent_started", "tool_call", "blocked", "approved", "check_passed", "check_failed", "done", "quarantined"];

const EVENT_LABEL: Partial<Record<RunEventType, string>> = {
  agent_started: "Permit issued",
  tool_call: "Tool call",
  blocked: "Blocked",
  approved: "Approved",
  check_passed: "Check passed",
  check_failed: "Check failed",
  done: "Done",
  quarantined: "Quarantined",
};

export function GovernanceClient() {
  const changes = useRepoChanges();
  const [filter, setFilter] = useState<RunEventType | "all">("all");

  const log = useMemo(
    () =>
      changes
        .flatMap((c) => c.events.filter((e) => AUDITED.includes(e.event)))
        .sort((a, b) => b.ts.localeCompare(a.ts)),
    [changes],
  );
  const rows = log.filter((e) => filter === "all" || e.event === filter).slice(0, 200);

  return (
    <PageShell>
      <PageHeader title="Governance" subtitle="Every agent action, checked against its permit and recorded." />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label="Actions logged" value={log.length} icon={ClipboardList} />
        <KpiTile label="Blocked actions" value={log.filter((e) => e.event === "blocked").length} icon={ShieldAlert} tone="inactive" />
        <KpiTile label="Human approvals" value={log.filter((e) => e.event === "approved").length} icon={UserCheck} tone="warning" />
        <KpiTile label="Changes governed" value={changes.length} icon={ShieldCheck} tone="success" />
      </div>

      <Card title="City laws" subtitle="The rules every Bob agent works under.">
        <div className="border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Law</TableHead>
                <TableHead>Rule</TableHead>
                <TableHead>Enforced by</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {LAWS.map((l) => (
                <TableRow key={l.law}>
                  <TableCell className="font-semibold text-text-primary">{l.law}</TableCell>
                  <TableCell className="text-text-secondary whitespace-normal">{l.rule}</TableCell>
                  <TableCell className="type-caption">{l.by}</TableCell>
                  <TableCell>
                    <StatusBadge status={l.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col">
          <h2 className="type-heading">Audit log</h2>
          <p className="type-caption">Newest first. Up to 200 rows.</p>
        </div>
        <div className="relative w-56">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as RunEventType | "all")}
            className="cursor-pointer appearance-none h-10 w-full pl-3 pr-9 border border-border rounded-lg bg-surface text-sm focus:outline-none focus:border-border-strong"
          >
            <option value="all">All events</option>
            {AUDITED.map((t) => (
              <option key={t} value={t}>
                {EVENT_LABEL[t]}
              </option>
            ))}
          </select>
          <ChevronDown className="size-4 text-zinc-400 absolute right-3 top-3 pointer-events-none" />
        </div>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Permit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center type-caption">
                  No actions found
                </TableCell>
              </TableRow>
            ) : null}
            {rows.map((e, i) => (
              <TableRow key={i}>
                <TableCell className="type-caption tabular-nums">{new Date(e.ts).toLocaleTimeString()}</TableCell>
                <TableCell className="text-text-secondary">{e.change_id}</TableCell>
                <TableCell className="font-semibold text-text-primary">{e.agent_id ?? "You"}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-text-primary">{EVENT_LABEL[e.event]}{e.tool ? ` · ${e.tool}` : ""}</span>
                    {e.detail ? <span className="type-caption max-w-[320px] truncate">{e.detail}</span> : null}
                  </div>
                </TableCell>
                <TableCell className="type-caption">{e.file ?? "—"}</TableCell>
                <TableCell>
                  {e.permit_ok === false ? <StatusBadge status="Blocked" /> : e.permit_ok ? <StatusBadge status="Allowed" /> : <span className="type-caption">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </PageShell>
  );
}
