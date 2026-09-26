"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderGit2, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, PageShell, PrimaryLink } from "@/components/ui/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEMO_REPOS, removeRepo, rescanRepo } from "@/lib/api";
import { buildCityData } from "@/lib/city";
import { useApp } from "@/lib/store";

const iconBtn =
  "cursor-pointer inline-flex items-center justify-center size-8 rounded-lg border border-border bg-surface text-icon-secondary hover:text-text-primary hover:bg-surface-hover hover:border-border-strong transition-colors disabled:opacity-40 disabled:pointer-events-none";

export function ReposClient() {
  const router = useRouter();
  const repos = useApp((s) => s.repos);
  const repoId = useApp((s) => s.repoId);
  const setRepo = useApp((s) => s.setRepo);
  const loadRepos = useApp((s) => s.loadRepos);
  const [busy, setBusy] = useState<string | null>(null);

  const open = async (id: string) => {
    await setRepo(id);
    router.push("/city?view=3d");
  };

  const rescan = async (id: string) => {
    setBusy(id);
    const last = await rescanRepo(id, () => {});
    setBusy(null);
    if (last.type === "done") {
      await loadRepos();
      if (id === repoId) await setRepo(id);
      toast.success("Re-scanned", { description: `${last.repo.stats.nodes} components, ${last.repo.stats.edges} links` });
    } else if (last.type === "error") {
      toast.error("Re-scan failed", { description: last.message });
    }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Remove ${name} and its knowledge graph?`)) return;
    await removeRepo(id);
    await loadRepos();
    if (id === repoId) await setRepo(DEMO_REPOS[0].id);
    toast.success("Repository removed");
  };

  const samples = DEMO_REPOS.map((r) => {
    const city = buildCityData(r.graph);
    return { r, files: city.stats.files, lines: city.stats.lines };
  });

  return (
    <PageShell>
      <PageHeader
        title="Repositories"
        subtitle="Connect a repository and SystemDNA builds its knowledge graph."
        actions={
          <PrimaryLink href="/repos/new">
            <Plus />
            Connect repository
          </PrimaryLink>
        }
      />

      {repos.length === 0 ? (
        <div className="border border-border rounded-xl">
          <EmptyState
            icon={FolderGit2}
            title="No repositories connected yet"
            body="Paste a public Git URL or upload a .zip. The samples below work right away."
            action={<PrimaryLink href="/repos/new">Connect repository</PrimaryLink>}
          />
        </div>
      ) : null}

      <div className="border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Repository</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Files</TableHead>
              <TableHead className="text-right">Lines</TableHead>
              <TableHead className="text-right">Components</TableHead>
              <TableHead className="text-right">Links</TableHead>
              <TableHead>Scanned</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {repos.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <button onClick={() => open(r.id)} className="cursor-pointer flex flex-col text-left">
                    <span className="font-semibold text-text-primary hover:underline">{r.name}</span>
                    <span className="type-caption">{r.url ?? "Uploaded zip"}{r.ref ? ` · ${r.ref}` : ""}</span>
                  </button>
                </TableCell>
                <TableCell>
                  <Badge variant="neutral">{r.source === "git" ? "Git" : "Upload"}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.stats.files}</TableCell>
                <TableCell className="text-right tabular-nums">{r.stats.lines.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{r.stats.nodes}</TableCell>
                <TableCell className="text-right tabular-nums">{r.stats.edges}</TableCell>
                <TableCell className="type-caption">{new Date(r.scannedAt).toLocaleString()}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    {r.id === repoId ? <Badge variant="success">On screen</Badge> : null}
                    <button className={iconBtn} disabled={r.source !== "git" || busy === r.id} onClick={() => rescan(r.id)} title="Re-scan the latest code" aria-label="Re-scan">
                      {busy === r.id ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                    </button>
                    <button className={iconBtn} onClick={() => remove(r.id, r.name)} title="Remove" aria-label="Remove">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {samples.map(({ r, files, lines }) => (
              <TableRow key={r.id}>
                <TableCell>
                  <button onClick={() => open(r.id)} className="cursor-pointer flex flex-col text-left">
                    <span className="font-semibold text-text-primary hover:underline">{r.label}</span>
                    <span className="type-caption">{r.description}</span>
                  </button>
                </TableCell>
                <TableCell>
                  <Badge variant="info">Sample</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{files}</TableCell>
                <TableCell className="text-right tabular-nums">{lines.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{r.graph.nodes.length}</TableCell>
                <TableCell className="text-right tabular-nums">{r.graph.edges.length}</TableCell>
                <TableCell className="type-caption">{new Date(r.graph.scannedAt).toLocaleString()}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">{r.id === repoId ? <Badge variant="success">On screen</Badge> : null}</div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </PageShell>
  );
}
