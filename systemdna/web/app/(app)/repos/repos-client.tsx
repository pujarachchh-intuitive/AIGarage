"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FolderGit2, GitBranch, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { StatusDot, useConnections, type ConnTone } from "@/components/layout/sidebar";
import { GithubConnection } from "@/components/repos/github-connection";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LocalTime } from "@/components/ui/local-time";
import { PageHeader, PageShell, PrimaryLink } from "@/components/ui/page";
import { DEMO_REPOS, fetchGithubStatus, removeRepo, rescanRepo } from "@/lib/api";
import { buildCityData } from "@/lib/city";
import { cn } from "@/lib/cn";
import { useApp } from "@/lib/store";
import type { ConnectedRepo } from "@/lib/types";

const iconBtn =
  "cursor-pointer inline-flex items-center justify-center size-8 rounded-lg border border-border bg-surface text-icon-secondary hover:text-text-primary hover:bg-surface-hover hover:border-border-strong transition-colors disabled:opacity-40 disabled:pointer-events-none";

const label = "font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-tertiary";

// Ingestion steps in order, for the re-scan progress bar.
const STEP_ORDER = ["fetch", "fetched", "checked", "files", "parse", "references", "docs", "imports", "bob", "write", "saved"];

interface Rescan {
  step: string;
  detail: string;
}

function omit<T>(m: Record<string, T>, key: string): Record<string, T> {
  const next = { ...m };
  delete next[key];
  return next;
}

function isGithub(url?: string) {
  return Boolean(url && /^https?:\/\/(www\.)?github\.com\//i.test(url));
}

function Stat({ k, v }: { k: string; v: number | string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className={label}>{k}</span>
      <span className="text-body font-semibold text-text-primary tabular-nums truncate">{v}</span>
    </div>
  );
}

function ScanState({ tone, text }: { tone: ConnTone; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <StatusDot tone={tone} />
      <span className={cn(label, "truncate")}>{text}</span>
    </span>
  );
}

export function ReposClient() {
  const router = useRouter();
  const repos = useApp((s) => s.repos);
  const repoId = useApp((s) => s.repoId);
  const setRepo = useApp((s) => s.setRepo);
  const loadRepos = useApp((s) => s.loadRepos);
  const { github } = useConnections();
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, Rescan>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  // GitHub App mode: is the app installed on each connected GitHub repo?
  const [installed, setInstalled] = useState<Record<string, boolean | undefined>>({});

  const appMode = github?.mode === "app" && !github.error;
  const githubUrls = repos.filter((r) => r.source === "git" && isGithub(r.url)).map((r) => r.url!);
  const urlsKey = githubUrls.join("\n");

  useEffect(() => {
    if (!appMode || !urlsKey) return;
    let live = true;
    for (const url of urlsKey.split("\n")) {
      void fetchGithubStatus(url).then((s) => {
        if (live && s.installed !== undefined) setInstalled((m) => ({ ...m, [url]: s.installed }));
      });
    }
    return () => {
      live = false;
    };
  }, [appMode, urlsKey]);

  const open = async (id: string) => {
    await setRepo(id);
    router.push("/city?view=3d");
  };

  const rescan = async (id: string) => {
    setBusy(id);
    setFailed((f) => omit(f, id));
    setProgress((p) => ({ ...p, [id]: { step: "fetch", detail: "Starting" } }));
    const last = await rescanRepo(id, (e) => {
      if (e.type === "progress") setProgress((p) => ({ ...p, [id]: { step: e.step, detail: e.detail } }));
    });
    setBusy(null);
    setProgress((p) => omit(p, id));
    if (last.type === "done") {
      await loadRepos();
      if (id === repoId) await setRepo(id);
      toast.success("Re-scanned", { description: `${last.repo.stats.nodes} components, ${last.repo.stats.edges} links` });
    } else if (last.type === "error") {
      setFailed((f) => ({ ...f, [id]: last.message }));
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

  const repoCard = (r: ConnectedRepo) => {
    const p = progress[r.id];
    const err = failed[r.id];
    const stepIdx = p ? Math.max(0, STEP_ORDER.indexOf(p.step)) : 0;
    const pct = p ? Math.round(((stepIdx + 1) / STEP_ORDER.length) * 100) : 0;
    const appInstalled = r.url ? installed[r.url] : undefined;
    return (
      <article
        key={r.id}
        className={cn(
          "relative flex flex-col border rounded-xl bg-surface transition-colors",
          r.id === repoId ? "border-border-strong" : "border-border hover:border-border-strong",
        )}
      >
        {r.id === repoId ? <span aria-hidden className="absolute left-0 top-0 h-[2px] w-12 bg-brand" /> : null}
        <div className="flex items-start justify-between gap-3 px-4 pt-4">
          <button onClick={() => open(r.id)} className="cursor-pointer flex flex-col text-left min-w-0">
            <span className="text-body font-semibold text-text-primary hover:underline truncate">{r.name}</span>
            <span className="type-caption truncate">
              {r.url ?? "Uploaded zip"}
              {r.ref ? ` · ${r.ref}` : ""}
            </span>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <button
              className={iconBtn}
              disabled={r.source !== "git" || busy !== null}
              onClick={() => rescan(r.id)}
              title={r.source === "git" ? "Re-scan the latest code" : "Uploaded repositories cannot be re-scanned"}
              aria-label="Re-scan"
            >
              {busy === r.id ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </button>
            <button className={iconBtn} disabled={busy === r.id} onClick={() => remove(r.id, r.name)} title="Remove" aria-label="Remove">
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
          <Badge variant="neutral">{r.source === "git" ? "Git" : "Upload"}</Badge>
          {r.id === repoId ? <Badge variant="default">On screen</Badge> : null}
          {r.stats.bobLinks !== undefined ? <Badge variant="info">Bob · {r.stats.bobLinks} links</Badge> : null}
          {r.stats.truncated ? <Badge variant="warning">Partial scan</Badge> : null}
          {appMode && appInstalled !== undefined ? (
            appInstalled ? (
              <Badge variant="success">App installed</Badge>
            ) : github?.app ? (
              <a href={github.app.installUrl} target="_blank" rel="noreferrer" title="Install the GitHub App on this repo">
                <Badge variant="outline" className="hover:border-border-strong hover:text-text-primary">
                  App not installed <ExternalLink />
                </Badge>
              </a>
            ) : null
          ) : null}
        </div>

        <div className="grid grid-cols-4 gap-3 px-4 py-4">
          <Stat k="Files" v={r.stats.files.toLocaleString()} />
          <Stat k="Lines" v={r.stats.lines.toLocaleString()} />
          <Stat k="Nodes" v={r.stats.nodes.toLocaleString()} />
          <Stat k="Links" v={r.stats.edges.toLocaleString()} />
        </div>

        <div className="mt-auto flex flex-col gap-2 px-4 py-3 border-t border-border">
          {p ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <ScanState tone="warn" text="Re-scanning" />
                <span className={cn(label, "tabular-nums")}>{pct}%</span>
              </div>
              <div className="h-1 rounded-full bg-surface-secondary overflow-hidden">
                <div className="h-full bg-brand transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
              </div>
              <span className="type-caption truncate">{p.detail}</span>
            </>
          ) : err ? (
            <>
              <ScanState tone="error" text="Re-scan failed" />
              <span className="type-caption text-error line-clamp-2">{err}</span>
            </>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <ScanState tone="ok" text="Scanned" />
              <span className="type-caption tabular-nums">
                <LocalTime iso={r.scannedAt} />
                <span className="text-text-disabled"> · </span>
                {(r.stats.ms / 1000).toFixed(1)} s
              </span>
            </div>
          )}
        </div>
      </article>
    );
  };

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

      <GithubConnection />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={label}>Your repositories · {repos.length}</span>
        </div>
        {repos.length === 0 ? (
          <div className="border border-border rounded-xl">
            <EmptyState
              icon={FolderGit2}
              title="No repositories connected yet"
              body="Paste a public Git URL or upload a .zip. The samples below work right away."
              action={<PrimaryLink href="/repos/new">Connect repository</PrimaryLink>}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{repos.map(repoCard)}</div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <span className={label}>Samples</span>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {samples.map(({ r, files, lines }) => (
            <article
              key={r.id}
              className={cn(
                "relative flex flex-col border rounded-xl bg-surface transition-colors",
                r.id === repoId ? "border-border-strong" : "border-border hover:border-border-strong",
              )}
            >
              {r.id === repoId ? <span aria-hidden className="absolute left-0 top-0 h-[2px] w-12 bg-brand" /> : null}
              <div className="flex items-start justify-between gap-3 px-4 pt-4">
                <button onClick={() => open(r.id)} className="cursor-pointer flex flex-col text-left min-w-0">
                  <span className="text-body font-semibold text-text-primary hover:underline truncate">{r.label}</span>
                  <span className="type-caption">{r.description}</span>
                </button>
                <FolderGit2 className="size-4 text-icon-secondary shrink-0 mt-0.5" />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
                <Badge variant="info">Sample</Badge>
                {r.id === repoId ? <Badge variant="default">On screen</Badge> : null}
                {r.gitUrl ? (
                  <Badge variant="outline">
                    <GitBranch /> {r.gitUrl.replace(/^https?:\/\/(www\.)?github\.com\//, "")}
                  </Badge>
                ) : null}
              </div>
              <div className="grid grid-cols-4 gap-3 px-4 py-4">
                <Stat k="Files" v={files.toLocaleString()} />
                <Stat k="Lines" v={lines.toLocaleString()} />
                <Stat k="Nodes" v={r.graph.nodes.length.toLocaleString()} />
                <Stat k="Links" v={r.graph.edges.length.toLocaleString()} />
              </div>
              <div className="mt-auto flex items-center justify-between gap-3 px-4 py-3 border-t border-border">
                <ScanState tone="ok" text="Scanned" />
                <span className="type-caption tabular-nums">
                  <LocalTime iso={r.graph.scannedAt} />
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
