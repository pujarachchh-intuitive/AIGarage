"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, GitBranch, Loader, Search, ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader, PageShell, PrimaryLink } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deriveRun, formatDuration, type RunStatus } from "@/lib/run-state";
import { useApp, useRepoChanges } from "@/lib/store";

const STATUS_LABEL: Record<RunStatus, string> = {
  planned: "Planned",
  awaiting_approval: "Awaiting approval",
  running: "Running",
  completed: "Completed",
};

export function ChangesClient() {
  const router = useRouter();
  const changes = useRepoChanges();
  const hydrated = useApp((s) => s.hydrated);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<RunStatus | "all">("all");

  const rows = useMemo(
    () => changes.map((c) => ({ change: c, view: deriveRun(c) })),
    [changes],
  );
  const filtered = rows.filter(
    ({ change, view }) =>
      (status === "all" || view.status === status) &&
      (query === "" || `${change.id} ${change.title}`.toLowerCase().includes(query.toLowerCase())),
  );
  const blocked = rows.reduce((n, r) => n + r.view.blocked.length, 0);

  return (
    <PageShell>
      <PageHeader
        title="Changes"
        subtitle="Every change SystemDNA analysed, planned and ran with Bob agents."
        actions={
          <PrimaryLink href="/changes/new">
            <GitBranch />
            New change
          </PrimaryLink>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label="Total changes" value={rows.length} icon={GitBranch} />
        <KpiTile label="In progress" value={rows.filter((r) => r.view.status !== "completed").length} icon={Loader} tone="warning" />
        <KpiTile label="Completed" value={rows.filter((r) => r.view.status === "completed").length} icon={CheckCircle2} tone="success" />
        <KpiTile label="Blocked agent actions" value={blocked} icon={ShieldAlert} tone="inactive" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="relative lg:col-span-2">
          <Search className="size-4 text-zinc-400 absolute left-3 top-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by ID or change"
            className="h-10 w-full pl-9 pr-3 border border-border rounded-lg bg-surface text-sm focus:outline-none focus:border-border-strong"
          />
        </div>
        <div className="relative">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as RunStatus | "all")}
            className="cursor-pointer appearance-none h-10 w-full pl-3 pr-9 border border-border rounded-lg bg-surface text-sm focus:outline-none focus:border-border-strong"
          >
            <option value="all">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <ChevronDown className="size-4 text-zinc-400 absolute right-3 top-3 pointer-events-none" />
        </div>
      </div>

      {hydrated && rows.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No changes yet"
          body="Pick a column or field, give it a new name, and SystemDNA will show the ripple and fix it."
          action={<PrimaryLink href="/changes/new">New change</PrimaryLink>}
        />
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Affected</TableHead>
                <TableHead>Files</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center type-caption">
                    No changes found
                  </TableCell>
                </TableRow>
              ) : null}
              {filtered.map(({ change, view }) => (
                <TableRow key={change.id} className="cursor-pointer" onClick={() => router.push(`/changes/${change.id}`)}>
                  <TableCell className="font-semibold text-text-primary">{change.id}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-semibold text-text-primary">{change.title}</span>
                      <span className="type-caption">{new Date(change.createdAt).toLocaleString()}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-text-secondary">{change.report.items.filter((i) => i.severity !== "safe").length}</TableCell>
                  <TableCell className="text-text-secondary">{change.report.fixUnits.length}</TableCell>
                  <TableCell>
                    <StatusBadge status={STATUS_LABEL[view.status]} />
                  </TableCell>
                  <TableCell className="text-text-secondary">{change.mode === "demo" ? "Simulated" : "Live"}</TableCell>
                  <TableCell className="text-text-secondary tabular-nums">{view.startedAt ? formatDuration(view.elapsedMs) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageShell>
  );
}
