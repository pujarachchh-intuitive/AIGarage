"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ExternalLink, GitPullRequest, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, primaryButton, secondaryButton } from "@/components/ui/page";
import { fetchBobStatus, fetchGithubStatus, openPullRequestFromPatch } from "@/lib/api";
import { cn } from "@/lib/cn";
import { realRunTarget } from "@/lib/real-run";
import { useApp } from "@/lib/store";
import type { BobReview, BobStatus, Change, GithubStatus, Graph } from "@/lib/types";
import { StepTrack, type StepState } from "@/components/changes/run-panels";

// The PR stream's progress steps (lib/server/change-agent.ts and github-agent.ts).
const PR_STAGES = [
  { key: "clone", label: "Clone" },
  { key: "apply", label: "Apply diff" },
  { key: "push", label: "Push branch" },
  { key: "pr", label: "Draft PR" },
];

/** The Bob Inspector's review as a PR description section. */
function reviewMarkdown(review: BobReview | undefined) {
  if (!review || review.status !== "done") return "";
  const lines = [
    "## IBM Bob Inspector review",
    "",
    `**Verdict:** ${review.verdict === "approved" ? "Approved" : "Changes requested"}`,
    "",
    review.summary,
  ];
  if (review.issues.length) {
    lines.push("", ...review.issues.map((i) => `- \`${i.file}${i.line ? `:${i.line}` : ""}\` ${i.message}`));
  }
  return `\n\n${lines.join("\n")}`;
}

function ReviewView({ review }: { review: BobReview }) {
  if (review.status === "skipped") {
    return <p className="type-caption">IBM Bob Inspector skipped: {review.reason}</p>;
  }
  const approved = review.verdict === "approved";
  return (
    <div className={cn("flex flex-col gap-2 px-4 py-3 rounded-xl border", approved ? "border-border" : "border-warning/25 bg-warning-soft")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body font-semibold text-text-primary">IBM Bob Inspector</span>
        <Badge variant={approved ? "success" : "warning"}>{approved ? "Approved" : "Changes requested"}</Badge>
        {review.bobcoins !== undefined ? <Badge variant="neutral">{review.bobcoins.toFixed(2)} Bobcoins</Badge> : null}
      </div>
      {review.summary ? <p className="text-body text-text-secondary">{review.summary}</p> : null}
      {review.issues.map((i, k) => (
        <span key={k} className="type-caption">
          <span className="font-semibold">
            {i.file}
            {i.line ? `:${i.line}` : ""}
          </span>{" "}
          {i.message}
        </span>
      ))}
    </div>
  );
}

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
          <summary className="cursor-pointer px-3 py-2 bg-surface-secondary text-body font-semibold text-text-primary">{f.name}</summary>
          <pre className="text-caption leading-5 overflow-x-auto scroll-thin p-3 font-mono">
            {f.text.split("\n").map((line, j) => (
              <div
                key={j}
                className={cn(
                  "whitespace-pre",
                  line.startsWith("+") && !line.startsWith("+++") && "bg-success-soft text-success",
                  line.startsWith("-") && !line.startsWith("---") && "bg-error-soft text-error",
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

/**
 * The result of the change's real run, and the step that ships it: a draft pull
 * request opened from the exact diff shown here (no agent runs again).
 */
export function GithubAgentPanel({ change, graph, reportMarkdown }: { change: Change; graph: Graph; reportMarkdown: () => string }) {
  const repos = useApp((s) => s.repos);
  const setPullRequest = useApp((s) => s.setPullRequest);
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [bob, setBob] = useState<BobStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<{ step: string; detail: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    void fetchBobStatus().then(setBob);
  }, []);

  const target = useMemo(() => realRunTarget(change, graph, repos), [change, graph, repos]);

  // GitHub status for this repo. Asked again when the user comes back from installing the app.
  const targetUrl = target?.url;
  useEffect(() => {
    const load = () => void fetchGithubStatus(targetUrl).then(setStatus);
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [targetUrl]);

  // Can the server push to this repo right now?
  const canPush = status?.mode === "app" ? Boolean(status.installed) && !status.error : Boolean(status?.login);
  const needsInstall = status?.mode === "app" && !status.error && status.installed === false;
  const run = change.run;
  const pr = change.pullRequest;
  const repoLabel = target?.url.replace("https://github.com/", "");

  // From run to pull request, at a glance.
  const readiness: { label: string; state: StepState; hint?: string }[] = [
    { label: "Real run", state: !run ? "waiting" : run.status === "running" ? "active" : run.status === "done" ? "done" : "failed", hint: run?.error },
    {
      label: "Diff ready",
      state: run?.patchId ? "done" : !run || run.status === "running" ? "waiting" : run.status === "failed" ? "failed" : "skipped",
      hint: run?.patchId ? `${run.files.length} files` : undefined,
    },
    {
      label: "GitHub access",
      state: !status ? "waiting" : canPush ? "done" : status.error ? "failed" : "waiting",
      hint: status?.error ?? (needsInstall ? "Install the GitHub App on this repo" : !canPush && status ? "Not connected on the server" : undefined),
    },
    { label: "Draft PR", state: pr ? "done" : busy ? "active" : error ? "failed" : "waiting", hint: pr ? `#${pr.number}` : undefined },
  ];

  const openPr = async () => {
    if (!run?.patchId) return;
    setBusy(true);
    setError(null);
    setSteps([]);
    await openPullRequestFromPatch(
      {
        patchId: run.patchId,
        title: change.title,
        body: `${reportMarkdown()}${reviewMarkdown(run.review)}\n\n---\nOpened by SystemDNA. Edits were made by ${run.strategy === "compiler" ? "the TypeScript compiler's rename" : "IBM Bob Fixer agents, one per file, each limited to its own file"} and type-checked${run.remainingErrors?.length ? ` (${run.remainingErrors.length} new type errors remain; see the report)` : " with no new type errors"}.`,
      },
      (e) => {
        if (e.type === "progress") setSteps((s) => [...s, { step: e.step, detail: e.detail }]);
        if (e.type === "error") setError(e.message);
        if (e.type === "done" && !e.dryRun) setPullRequest(change.id, e.pr);
      },
    );
    setBusy(false);
    setConfirming(false);
  };

  const body = !target ? (
    <p className="text-body text-text-secondary">
      {change.mode !== "demo"
        ? "The live backend runs this change."
        : "This repository has no code SystemDNA can reach (a sample, a zip upload or a non-GitHub host), so the run above is simulated. Connect it from a github.com URL to run changes for real."}
    </p>
  ) : !run || run.status === "running" ? (
    <p className="flex items-center gap-2 text-body text-text-secondary">
      {run ? <Loader2 className="size-4 animate-spin" /> : null}
      {run ? "The diff appears here when the run finishes." : "The run starts after the plan is approved."}
    </p>
  ) : run.status === "failed" && !run.patchId ? (
    <p className="text-body text-text-secondary">No diff: the run did not finish. {run.error}</p>
  ) : !run.patchId ? (
    <p className="text-body text-text-secondary">The agents made no changes, so there is nothing to open a pull request for.</p>
  ) : (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {run.remainingErrors?.length ? <Badge variant="warning">{run.remainingErrors.length} new type errors</Badge> : <Badge variant="success">No new type errors</Badge>}
        <Badge variant="neutral">{run.files.length} files changed</Badge>
        <Badge variant="neutral">{run.strategy === "compiler" ? "TypeScript compiler" : "IBM Bob Fixer agents"}</Badge>
        {run.diffTruncated ? <Badge variant="warning">Diff shortened</Badge> : null}
        <span className="flex-1" />
        <button
          className={primaryButton}
          disabled={busy || !canPush || Boolean(pr)}
          onClick={() => setConfirming(true)}
          title={needsInstall ? "Install the GitHub App on this repo first" : !canPush ? "Connect GitHub on the server first" : undefined}
        >
          {busy ? <Loader2 className="animate-spin" /> : <GitPullRequest />}
          Open draft pull request
        </button>
      </div>
      {needsInstall && status?.app ? (
        <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-border bg-surface-secondary">
          <span className="text-body text-text-secondary">
            The <span className="font-semibold text-text-primary">{status.app.name}</span> app is not installed on this repo yet. Install it, pick this repo, then come back here.
          </span>
          <a href={status.app.installUrl} target="_blank" rel="noreferrer" className={cn(secondaryButton, "shrink-0")}>
            <ExternalLink />
            Install GitHub App
          </a>
        </div>
      ) : null}
      {status && !status.configured ? (
        <p className="type-caption">
          To open pull requests, set up the GitHub App (GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH in web/.env.local) and restart. A personal GITHUB_TOKEN (Contents: write and Pull requests: write on this repo) also works as a fallback.
        </p>
      ) : status?.error ? (
        <p className="type-caption text-error">{status.error}</p>
      ) : null}
      {confirming ? (
        <div className="flex items-start justify-between gap-4 px-4 py-3 rounded-xl border border-warning/25 bg-warning-soft">
          <div className="flex flex-col gap-1">
            <span className="text-body font-semibold text-warning">Push a new branch and open a draft PR on {repoLabel}?</span>
            <span className="type-caption text-warning">
              {run.files.length} files change, exactly as shown below. Nothing is merged; the default branch is not touched.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button className={secondaryButton} onClick={() => setConfirming(false)}>
              <X />
              Cancel
            </button>
            <button className={primaryButton} onClick={openPr}>
              <Check />
              Open draft PR
            </button>
          </div>
        </div>
      ) : null}
      {run.review ? <ReviewView review={run.review} /> : null}
      {run.remainingErrors?.length ? (
        <div className="flex flex-col gap-1 px-4 py-3 rounded-xl border border-warning/25 bg-warning-soft">
          <span className="text-body font-semibold text-warning">New type errors left after the run</span>
          {run.remainingErrors.slice(0, 8).map((e, i) => (
            <span key={i} className="type-caption text-warning">
              {e.file}:{e.line} {e.message}
            </span>
          ))}
        </div>
      ) : null}
      <DiffView diff={run.diff} />
    </div>
  );

  return (
    <Card
      title="Pull request"
      subtitle={target ? `The real run's diff for ${repoLabel}. Open it as a draft pull request when it looks right.` : "Real runs need the repository's code on github.com."}
      actions={
        <div className="flex items-center gap-2">
          {bob ? (
            <Badge variant={bob.ready ? "success" : "neutral"} title={bob.reason ?? (bob.version ? `Bob Shell ${bob.version}` : undefined)}>
              <span className={cn("size-1.5 rounded-full", bob.ready ? "bg-success" : "bg-icon-secondary")} />
              {bob.ready ? "IBM Bob ready" : "IBM Bob off"}
            </Badge>
          ) : null}
          {status ? (
            status.error ? (
              <Badge variant="destructive">{status.mode === "app" ? "GitHub App problem" : "Token problem"}</Badge>
            ) : status.mode === "app" ? (
              <Badge variant={status.installed === false ? "warning" : "success"}>
                GitHub App: {status.app?.slug}
                {status.installed === false ? " (not installed)" : ""}
              </Badge>
            ) : status.login ? (
              <Badge variant="success">GitHub: @{status.login}</Badge>
            ) : (
              <Badge variant="neutral">Not connected to GitHub</Badge>
            )
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {target ? <StepTrack steps={readiness} /> : null}
        {body}
        {steps.length > 0 || (busy && !pr) ? (
          <div className="flex flex-col gap-3 px-4 py-3.5 rounded-xl border border-border">
            <span className="font-mono text-[10.5px] leading-4 font-medium uppercase tracking-[0.06em] text-text-tertiary">Opening the draft pull request</span>
            <StepTrack
              steps={PR_STAGES.map((s, i): { label: string; state: StepState } => {
                const reached = Math.max(-1, ...steps.map((x) => PR_STAGES.findIndex((p) => p.key === x.step)));
                const finished = Boolean(pr) && !busy;
                if (finished || i < reached) return { label: s.label, state: "done" };
                if (i === reached || (reached < 0 && i === 0)) return { label: s.label, state: error ? "failed" : busy ? "active" : "done" };
                return { label: s.label, state: "waiting" };
              })}
            />
            {steps.length > 0 ? (
              <ol className="flex flex-col gap-1">
                {steps.map((s, i) => (
                  <li key={i} className="flex items-center gap-2 font-mono text-[11px] leading-4 text-text-secondary">
                    {busy && i === steps.length - 1 ? <Loader2 className="size-3 animate-spin text-brand-text" /> : error && i === steps.length - 1 ? <X className="size-3 text-error" /> : <Check className="size-3 text-success" />}
                    {s.detail}
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-error/25 bg-error-soft text-body font-semibold text-error">
            <AlertTriangle className="size-4" />
            {error}
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
      </div>
    </Card>
  );
}
