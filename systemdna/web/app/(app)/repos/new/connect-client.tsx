"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileArchive, GitBranch, Link2, Loader2, Map as MapIcon, Upload, X } from "lucide-react";
import { Card, PageHeader, PageShell, SecondaryLink, inputClass, primaryButton, secondaryButton } from "@/components/ui/page";
import { connectRepo, fetchBobStatus } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useApp } from "@/lib/store";
import type { BobStatus, ConnectedRepo, IngestEvent } from "@/lib/types";

// The steps the ingestion service reports, in order. Scanner steps map onto them.
const STEPS = [
  { id: "fetch", label: "Get the code", hint: "Clone the repo or unpack the zip" },
  { id: "checked", label: "Check size", hint: "Up to 40,000 files and 300 MB" },
  { id: "files", label: "List files", hint: "Skip node_modules, builds and lock files" },
  { id: "parse", label: "Read declarations", hint: "Types, fields, functions, components, pages" },
  { id: "references", label: "Link references", hint: "The TypeScript compiler finds every use" },
  { id: "docs", label: "Read docs and imports", hint: "Markdown that describes the types; file-to-file imports" },
  { id: "bob", label: "IBM Bob Cartographer", hint: "Bob adds links the parser cannot see and flags personal data" },
  { id: "saved", label: "Save the knowledge graph", hint: "Ready for the city, graph and changes" },
] as const;

const STEP_OF: Record<string, (typeof STEPS)[number]["id"]> = {
  fetch: "fetch",
  fetched: "fetch",
  checked: "checked",
  files: "files",
  parse: "parse",
  references: "references",
  docs: "docs",
  imports: "docs",
  bob: "bob",
  write: "saved",
  done: "saved",
  saved: "saved",
};

type Phase = "idle" | "running" | "done" | "error";

export function ConnectRepoClient() {
  const router = useRouter();
  const loadRepos = useApp((s) => s.loadRepos);
  const setRepo = useApp((s) => s.setRepo);
  const [mode, setMode] = useState<"git" | "zip">("git");
  const [url, setUrl] = useState("");
  const [ref, setRef] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [current, setCurrent] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [repo, setRepoResult] = useState<ConnectedRepo | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [bobStatus, setBobStatus] = useState<BobStatus | null>(null);
  const [useBob, setUseBob] = useState(false);

  useEffect(() => {
    void fetchBobStatus().then((s) => {
      setBobStatus(s);
      setUseBob(s.ready);
    });
  }, []);

  // The Bob step shows only when Bob enrichment is on.
  const steps = STEPS.filter((s) => s.id !== "bob" || useBob);
  const canStart = phase !== "running" && (mode === "git" ? url.trim().length > 0 : Boolean(file));
  const currentIndex = current ? steps.findIndex((s) => s.id === current) : -1;

  const onEvent = (e: IngestEvent) => {
    if (e.type === "progress") {
      const step = STEP_OF[e.step];
      if (!step) return;
      setCurrent(step);
      setDetails((d) => ({ ...d, [step]: e.detail }));
    } else if (e.type === "done") {
      setRepoResult(e.repo);
      setCurrent("saved");
      setPhase("done");
    } else {
      setError(e.message);
      setPhase("error");
    }
  };

  const start = async () => {
    setPhase("running");
    setError(null);
    setDetails({});
    setCurrent("fetch");
    setRepoResult(null);
    try {
      const source = mode === "git" ? { url: url.trim(), ref: ref.trim() || undefined } : { file: file! };
      const last = await connectRepo({ ...source, bob: useBob }, onEvent);
      if (last.type === "done") await loadRepos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("error");
    }
  };

  const open = async (path: string) => {
    if (!repo) return;
    await setRepo(repo.id);
    router.push(path);
  };

  const pickFile = (f: File | undefined | null) => {
    if (!f) return;
    if (!/\.zip$/i.test(f.name)) {
      setError("Choose a .zip file.");
      return;
    }
    setError(null);
    setFile(f);
  };

  return (
    <PageShell>
      <PageHeader
        title="Connect a repository"
        subtitle="Point SystemDNA at your code. It builds the knowledge graph that powers the city, the graph view and safe changes."
        actions={<SecondaryLink href="/repos">All repositories</SecondaryLink>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card title="Source" subtitle="TypeScript and JavaScript repos today." className="lg:col-span-5 h-fit">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-surface-secondary border border-border">
              {(
                [
                  ["git", "Git URL", Link2],
                  ["zip", "Upload .zip", FileArchive],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  disabled={phase === "running"}
                  onClick={() => setMode(id)}
                  className={cn(
                    "cursor-pointer h-8 inline-flex items-center justify-center gap-2 rounded-md text-body font-semibold transition-colors",
                    mode === id ? "bg-surface text-text-primary shadow-2xs border border-border" : "text-text-tertiary hover:text-text-primary",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>

            {mode === "git" ? (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="type-label">Repository URL</span>
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && canStart && void start()}
                    placeholder="https://github.com/owner/repo"
                    className={inputClass}
                    disabled={phase === "running"}
                  />
                  <span className="type-caption">Public repos on GitHub, GitLab or Bitbucket.</span>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="type-label">Branch (optional)</span>
                  <div className="relative">
                    <GitBranch className="size-4 text-zinc-400 absolute left-3 top-3" />
                    <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Default branch" className={cn(inputClass, "pl-9")} disabled={phase === "running"} />
                  </div>
                </label>
              </>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  pickFile(e.dataTransfer.files[0]);
                }}
                onClick={() => fileInput.current?.click()}
                className={cn(
                  "cursor-pointer flex flex-col items-center justify-center gap-2 px-4 py-8 rounded-xl border border-dashed text-center transition-colors",
                  dragging ? "border-border-strong bg-surface-hover" : "border-border bg-zinc-50/50 hover:bg-surface-hover",
                )}
              >
                <Upload className="size-5 text-icon-secondary" />
                {file ? (
                  <span className="flex items-center gap-2 text-body font-semibold text-text-primary">
                    {file.name} <span className="type-caption">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                      className="cursor-pointer p-0.5 rounded text-icon-secondary hover:text-text-primary"
                      aria-label="Remove file"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                ) : (
                  <span className="text-body font-semibold text-text-primary">Drop a .zip here, or click to choose</span>
                )}
                <span className="type-caption">Up to 50 MB. On GitHub: Code, then Download ZIP.</span>
                <input ref={fileInput} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
              </div>
            )}

            <label className={cn("flex items-start gap-2.5", bobStatus?.ready ? "cursor-pointer" : "opacity-60")}>
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-zinc-900"
                checked={useBob}
                disabled={!bobStatus?.ready || phase === "running"}
                onChange={(e) => setUseBob(e.target.checked)}
              />
              <span className="flex flex-col gap-0.5">
                <span className="type-label">Enrich with IBM Bob</span>
                <span className="type-caption">
                  {bobStatus === null
                    ? "Checking IBM Bob…"
                    : bobStatus.ready
                      ? "Bob reads the code after the scan and adds links the parser cannot see (fetch calls, string keys, config). Uses Bobcoins and adds a few minutes."
                      : `Not available: ${bobStatus.reason}`}
                </span>
              </span>
            </label>

            <button className={cn(primaryButton, "justify-center")} disabled={!canStart} onClick={start}>
              {phase === "running" ? <Loader2 className="animate-spin" /> : <MapIcon />}
              {phase === "running" ? "Building the knowledge graph…" : "Build knowledge graph"}
            </button>

            <div className="flex flex-col gap-1.5 pt-3 border-t border-border">
              <p className="type-label">What we do with your code</p>
              <p className="type-caption">
                We only read files. We never install packages, run builds or execute anything from your repo. The copy is deleted as soon as the scan ends; only the knowledge graph is kept.
              </p>
            </div>
          </div>
        </Card>

        <Card title="Progress" subtitle={phase === "idle" ? "This is what happens when you start." : undefined} className="lg:col-span-7">
          <ol className="flex flex-col">
            {steps.map((s, i) => {
              const state =
                phase === "done" || (currentIndex > i && phase !== "idle")
                  ? "done"
                  : currentIndex === i && phase === "running"
                    ? "active"
                    : currentIndex === i && phase === "error"
                      ? "failed"
                      : "todo";
              return (
                <li key={s.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "size-6 rounded-full flex items-center justify-center border text-caption font-semibold shrink-0",
                        state === "done" && "bg-zinc-900 border-transparent text-white",
                        state === "active" && "border-border-strong text-text-primary",
                        state === "failed" && "bg-red-50 border-red-200/50 text-red-700",
                        state === "todo" && "border-border text-text-tertiary",
                      )}
                    >
                      {state === "done" ? <Check className="size-3.5" /> : state === "active" ? <Loader2 className="size-3.5 animate-spin" /> : state === "failed" ? <X className="size-3.5" /> : i + 1}
                    </span>
                    {i < steps.length - 1 ? <span className="w-px flex-1 min-h-4 bg-border my-1" /> : null}
                  </div>
                  <div className="flex flex-col pb-4 min-w-0">
                    <span className={cn("text-body font-semibold", state === "todo" ? "text-text-tertiary" : "text-text-primary")}>{s.label}</span>
                    <span className="type-caption truncate">{details[s.id] ?? s.hint}</span>
                  </div>
                </li>
              );
            })}
          </ol>

          {error ? (
            <div className="mt-2 px-4 py-3 rounded-xl border border-red-200/50 bg-red-50 text-body text-red-700">{error}</div>
          ) : null}

          {repo ? (
            <div className="mt-2 flex flex-col gap-4 p-4 rounded-xl border border-border">
              <div className="flex flex-col">
                <span className="type-heading">{repo.name} is ready</span>
                <span className="type-caption">
                  Scanned in {(repo.stats.ms / 1000).toFixed(1)} s{repo.stats.truncated ? " · large repo: the first 2,500 code files were scanned" : ""}
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {[
                  ["Files", repo.stats.files],
                  ["Lines", repo.stats.lines.toLocaleString()],
                  ["Components", repo.stats.nodes],
                  ["Links", repo.stats.edges],
                  ["Imports", repo.stats.imports],
                  ["Districts", repo.stats.layers],
                  ...(repo.stats.bobLinks !== undefined ? [["Found by Bob", repo.stats.bobLinks]] : []),
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col">
                    <span className="type-caption">{k}</span>
                    <span className="text-body font-semibold text-text-primary">{v}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <button className={primaryButton} onClick={() => open("/city?view=3d")}>
                  <MapIcon />
                  Open Agent City
                </button>
                <button className={secondaryButton} onClick={() => open("/city?view=graph")}>
                  Graph view
                </button>
                <button className={secondaryButton} onClick={() => open("/changes/new")}>
                  Plan a change
                </button>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </PageShell>
  );
}
