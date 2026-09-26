"use client";

import { useState, type ReactNode } from "react";
import { ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { StatusDot, bobState, githubState, refreshConnections, useConnections, type ConnState } from "@/components/layout/sidebar";
import { Card, PageHeader, PageShell, secondaryButton } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status-badge";
import { API_URL, DATA_MODE } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useApp } from "@/lib/store";

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[140px_1fr] gap-y-3">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-tertiary pt-0.5">{k}</dt>
          <dd className="text-body text-text-primary break-all">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Dot + short mono status, used in card headers. */
function StatePill({ state }: { state: ConnState }) {
  return (
    <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md border border-border bg-surface-secondary">
      <StatusDot tone={state.tone} />
      <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-secondary">{state.short}</span>
    </span>
  );
}

const Mono = ({ children }: { children: ReactNode }) => <span className="font-mono text-[12px] text-text-primary">{children}</span>;

export function SettingsClient() {
  const graph = useApp((s) => s.graph);
  const changes = useApp((s) => s.changes);
  const resetDemo = useApp((s) => s.resetDemo);
  const { github, bob } = useConnections();
  const [checking, setChecking] = useState(false);

  const recheck = async () => {
    setChecking(true);
    await refreshConnections(true);
    setChecking(false);
  };

  const gh = githubState(github);
  const bs = bobState(bob);

  const githubRows: [string, ReactNode][] = github
    ? [
        ["Sign-in", github.mode === "app" ? "GitHub App" : github.mode === "token" ? "Personal token (GITHUB_TOKEN)" : "Not connected"],
        ...(github.app ? ([["App", <span key="a">{github.app.name} <span className="text-text-tertiary">· </span><Mono>{github.app.slug}[bot]</Mono></span>]] as [string, ReactNode][]) : []),
        ...(github.login ? ([["Account", <Mono key="l">@{github.login}</Mono>]] as [string, ReactNode][]) : []),
        ["Used by", "GitHub agent (opens draft pull requests with the fix)"],
      ]
    : [];

  const bobRows: [string, ReactNode][] = bob
    ? [
        ["API key", bob.configured ? "Set on the server (BOB_API_KEY)" : "Not set (BOB_API_KEY)"],
        ["Bob Shell", bob.cli ? "Installed" : "Not installed"],
        ...(bob.version ? ([["Version", <Mono key="v">{bob.version}</Mono>]] as [string, ReactNode][]) : []),
        ["Used by", "Inspector (reviews GitHub agent diffs), Cartographer (enriches connected repos)"],
      ]
    : [];

  const rows: [string, ReactNode][] = [
    ["Data mode", DATA_MODE === "live" ? "Live backend" : "Demo data"],
    ["API URL", API_URL || "Not set (NEXT_PUBLIC_API_URL)"],
    ["Event feed", API_URL ? `${API_URL.replace(/^http/, "ws")}/ws` : "Simulated in the browser"],
    ["Repository", graph?.repo ?? "…"],
    ["Graph scanned", graph ? <span className="tabular-nums">{new Date(graph.scannedAt).toLocaleString()}</span> : "…"],
  ];

  const loading = <div className="h-24 rounded-lg bg-surface-secondary animate-pulse" />;

  return (
    <PageShell>
      <PageHeader
        title="Settings"
        subtitle="Where this dashboard gets its data, and what it can reach."
        actions={
          <button className={secondaryButton} onClick={recheck} disabled={checking}>
            <RefreshCw className={cn(checking && "animate-spin")} />
            Check again
          </button>
        }
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card
          title="GitHub"
          subtitle="How the agent signs in to push branches and open pull requests. No secret reaches the browser."
          actions={<StatePill state={gh} />}
        >
          {github ? (
            <div className="flex flex-col gap-4">
              <Rows rows={githubRows} />
              {github.error ? (
                <p className="px-3 py-2 rounded-lg border border-error/25 bg-error-soft text-body text-error break-words">{github.error}</p>
              ) : github.mode === "none" ? (
                <p className="type-caption">
                  Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH (or GITHUB_TOKEN) in web/.env.local, then restart the dev server.
                </p>
              ) : github.mode === "token" ? (
                <p className="type-caption">Set up the GitHub App to let each user pick the repos the agent may change.</p>
              ) : null}
              {github.mode === "app" && github.app && !github.error ? (
                <div className="flex items-center justify-between gap-4 pt-4 border-t border-border">
                  <span className="type-caption">Install the app on a repo before the agent can open a pull request there.</span>
                  <a href={github.app.installUrl} target="_blank" rel="noreferrer" className={cn(secondaryButton, "shrink-0")}>
                    <ExternalLink />
                    Install or pick repos
                  </a>
                </div>
              ) : null}
            </div>
          ) : (
            loading
          )}
        </Card>

        <Card
          title="IBM Bob"
          subtitle="Bob Shell runs headless on the server. The key never reaches the browser."
          actions={<StatePill state={bs} />}
        >
          {bob ? (
            <div className="flex flex-col gap-4">
              <Rows rows={bobRows} />
              {!bob.ready && bob.reason ? <p className="type-caption">{bob.reason}</p> : null}
            </div>
          ) : (
            loading
          )}
        </Card>

        <Card title="Connection" actions={<StatusBadge status={DATA_MODE === "live" ? "Live" : "Demo"} />}>
          <Rows rows={rows} />
          <p className="type-caption mt-4">
            To connect the FastAPI server, set NEXT_PUBLIC_API_URL in web/.env.local and restart the dev server.
          </p>
        </Card>

        <Card title="Local data" subtitle="Changes are saved in this browser.">
          <div className="flex items-center justify-between gap-4">
            <span className="text-body text-text-secondary tabular-nums">{changes.length} saved changes</span>
            <button
              className={secondaryButton}
              disabled={changes.length === 0}
              onClick={() => {
                resetDemo();
                toast.success("Saved changes cleared");
              }}
            >
              <Trash2 />
              Clear saved changes
            </button>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
