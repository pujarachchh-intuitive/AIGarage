"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ExternalLink, Eye, GitPullRequest, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, primaryButton, secondaryButton } from "@/components/ui/page";
import { DEMO_REPOS, fetchGithubStatus, runGithubAgent } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useApp } from "@/lib/store";
import type { AgentEvent, Change, Graph } from "@/lib/types";

type Preview = Extract<AgentEvent, { type: "preview" }>;

function DiffView({ diff }: { diff: string }) {
  // Split per file so each can be opened on its own.
  const files = useMemo(() => {
    const parts = diff.split(/^(?=diff --git )/m).filter(Boolean);
    return parts.map((p) => ({ name: p.match(/^diff --git a\/(.+?) b\//)?.[1] ?? "file", text: p }));
  }, [diff]);
  return (
    <div className="flex flex-col gap-2">
      {files.map((f, i) => (
        <details key={f.name} open={i < 2} className="border border-border rounded-lg overflow-hidden">
          <summary className="cursor-pointer px-3 py-2 bg-zinc-50/80 text-body font-semibold text-text-primary">{f.name}</summary>
          <pre className="text-caption leading-5 overflow-x-auto scroll-thin p-3 font-mono">
            {f.text.split("\n").map((line, j) => (
              <div
                key={j}
                className={cn(
                  "whitespace-pre",
                  line.startsWith("+") && !line.startsWith("+++") && "bg-emerald-50 text-emerald-700",
                  line.startsWith("-") && !line.startsWith("---") && "bg-red-50 text-red-700",
                  line.startsWith("@@") && "text-text-tertiary",
                )}
              >
                {line || " "}
              </div>
            ))}
          </pre>
        </details>
      ))}
    </div>
  );
}

export function GithubAgentPanel({ change, graph, reportMarkdown }: { change: Change; graph: Graph; reportMarkdown: () => string }) {
  const repos = useApp((s) => s.repos);
  const setPullRequest = useApp((s) => s.setPullRequest);
  const [status, setStatus] = useState<{ configured: boolean; login?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState<"preview" | "pr" | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<{ message: string; newErrors?: { file: string; line: number; message: string }[] } | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    void fetchGithubStatus().then(setStatus);
  }, []);

  // Which real repo does this change belong to?
  const target = useMemo(() => {
    const connected = repos.find((r) => r.name === change.repo && r.source === "git" && r.url);
    if (connected) return { url: connected.url!, ref: connected.ref };
    const sample = DEMO_REPOS.find((r) => r.graph.repo === change.repo && r.gitUrl);
    return sample ? { url: sample.gitUrl!, ref: undefined } : null;
  }, [repos, change.repo]);

  const node = graph.nodes.find((n) => n.id === change.request.node);
  const renameable = change.request.change === "rename" && node?.type === "TSField";
  const onGithub = target?.url.startsWith("https://github.com/");
  const blocked = !target
    ? "Connect this repository from a Git URL (Repositories page) so the agent can reach its code."
    : !onGithub
      ? "The agent opens pull requests on github.com repositories today."
      : !renameable
        ? "The agent handles renames of TypeScript fields today. This change is analysis only."
        : null;

  const run = async (dryRun: boolean) => {
    if (!target || !node) return;
    setBusy(dryRun ? "preview" : "pr");
    setError(null);
    setSteps([]);
    if (dryRun) setPreview(null);
    await runGithubAgent(
      {
        url: target.url,
        ref: target.ref,
        field: node.name,
        to: change.request.to,
        changeId: change.id,
        title: `Rename ${node.name} to ${change.request.to}`,
        body: `${reportMarkdown()}\n\n---\nOpened by the SystemDNA GitHub agent. Edits come from the TypeScript compiler's rename and were checked for new type errors.`,
        dryRun,
      },
      (e) => {
        if (e.type === "progress") setSteps((s) => [...s, e.detail]);
        if (e.type === "preview") setPreview(e);
        if (e.type === "error") setError({ message: e.message, newErrors: e.newErrors });
        if (e.type === "done" && !e.dryRun) setPullRequest(change.id, e.pr);
      },
    );
    setBusy(null);
    setConfirming(false);
  };

  const pr = change.pullRequest;

  return (
    <Card
      title="GitHub agent"
      subtitle="Makes this change in the real repo with the TypeScript compiler's rename, checks it, and opens a draft pull request."
      actions={
        status ? (
          status.configured && status.login ? (
            <Badge variant="success">GitHub: @{status.login}</Badge>
          ) : status.configured ? (
            <Badge variant="destructive">Token problem</Badge>
          ) : (
            <Badge variant="neutral">No GitHub token</Badge>
          )
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        {blocked ? (
          <p className="text-body text-text-secondary">{blocked}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-body text-text-secondary">
                Target <span className="font-semibold text-text-primary">{target!.url.replace("https://github.com/", "")}</span>
                {target!.ref ? ` · ${target!.ref}` : ""}
              </span>
              <span className="flex-1" />
              <button className={secondaryButton} disabled={busy !== null} onClick={() => run(true)}>
                {busy === "preview" ? <Loader2 className="animate-spin" /> : <Eye />}
                Preview changes
              </button>
              <button
                className={primaryButton}
                disabled={busy !== null || !preview || !status?.login || Boolean(pr)}
                onClick={() => setConfirming(true)}
                title={!status?.login ? "Set GITHUB_TOKEN on the server first" : !preview ? "Preview the changes first" : undefined}
              >
                {busy === "pr" ? <Loader2 className="animate-spin" /> : <GitPullRequest />}
                Open draft pull request
              </button>
            </div>

            {!status?.configured ? (
              <p className="type-caption">
                To open pull requests, add GITHUB_TOKEN to web/.env.local (a fine-grained token with Contents: write and Pull requests: write on this repo) and restart. Preview works without it.
              </p>
            ) : status.error ? (
              <p className="type-caption text-error">{status.error}</p>
            ) : null}

            {confirming ? (
              <div className="flex items-start justify-between gap-4 px-4 py-3 rounded-xl border border-amber-200/50 bg-amber-50">
                <div className="flex flex-col gap-1">
                  <span className="text-body font-semibold text-amber-700">Push a new branch and open a draft PR on {target!.url.replace("https://github.com/", "")}?</span>
                  <span className="type-caption text-amber-700">
                    {preview?.files.length} code files and {preview?.docs.length} docs change. Nothing is merged; the default branch is not touched.
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button className={secondaryButton} onClick={() => setConfirming(false)}>
                    <X />
                    Cancel
                  </button>
                  <button className={primaryButton} onClick={() => run(false)}>
                    <Check />
                    Open draft PR
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}

        {steps.length > 0 ? (
          <ol className="flex flex-col gap-1">
            {steps.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-body text-text-secondary">
                {busy && i === steps.length - 1 ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5 text-success" />}
                {s}
              </li>
            ))}
          </ol>
        ) : null}

        {error ? (
          <div className="flex flex-col gap-2 px-4 py-3 rounded-xl border border-red-200/50 bg-red-50">
            <span className="flex items-center gap-2 text-body font-semibold text-red-700">
              <AlertTriangle className="size-4" />
              {error.message}
            </span>
            {error.newErrors?.slice(0, 6).map((e, i) => (
              <span key={i} className="type-caption text-red-700">
                {e.file}:{e.line} {e.message}
              </span>
            ))}
          </div>
        ) : null}

        {pr ? (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border">
            <div className="flex flex-col">
              <span className="text-body font-semibold text-text-primary">Draft pull request #{pr.number} is open</span>
              <span className="type-caption">
                {pr.branch} → {pr.base}
              </span>
            </div>
            <a href={pr.url} target="_blank" rel="noreferrer" className={secondaryButton}>
              <ExternalLink />
              View on GitHub
            </a>
          </div>
        ) : null}

        {preview ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">No new type errors</Badge>
              <Badge variant="neutral">{preview.locations} edits</Badge>
              <Badge variant="neutral">{preview.files.length} code files</Badge>
              <Badge variant="neutral">{preview.docs.length} docs</Badge>
              {preview.stringKeys ? <Badge variant="info">{preview.stringKeys} string keys</Badge> : null}
              {preview.diffTruncated ? <Badge variant="warning">Diff shortened</Badge> : null}
            </div>
            <DiffView diff={preview.diff} />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
