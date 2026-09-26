// Data access. Two modes:
//  - demo: no NEXT_PUBLIC_API_URL. Uses a demo repo graph (DEMO_REPOS), runs the
//    impact engine in the browser, and simulates runs.
//  - live: NEXT_PUBLIC_API_URL points at the FastAPI server (PRD section 13).

import { computeImpact } from "@/lib/impact";
import marketplaceGraph from "@/lib/mock/marketplace-dashboard.graph.json";
import { shopflowGraph } from "@/lib/mock/shopflow";
import type { AgentEvent, BobStatus, ChangeRequest, ChangeRunRequest, ChangeStreamLine, ConnectedRepo, DataMode, Graph, ImpactReport, IngestEvent, RunEvent } from "@/lib/types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "";
export const DATA_MODE: DataMode = API_URL ? "live" : "demo";
const DEMO_TOKEN = process.env.NEXT_PUBLIC_DEMO_TOKEN || "";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(DEMO_TOKEN ? { Authorization: `Bearer ${DEMO_TOKEN}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface DemoRepo {
  id: string;
  label: string;
  description: string;
  graph: Graph;
  /** Where the real code lives, so the GitHub agent can open PRs. */
  gitUrl?: string;
  /** The change the New change form starts with. */
  defaultChange: { node: string; to: string };
}

// Demo repos. The marketplace graph is real: it was produced by
// core/scanner/ts-scan.mjs from github.com/krishil-agrawal-itp/marketplace-dashboard.
export const DEMO_REPOS: DemoRepo[] = [
  {
    id: "marketplace-dashboard",
    label: "marketplace-dashboard",
    description: "Next.js + TypeScript. Scanned with the TypeScript compiler.",
    graph: marketplaceGraph as Graph,
    gitUrl: "https://github.com/krishil-agrawal-itp/marketplace-dashboard",
    defaultChange: { node: "field:Deployment.successRate", to: "deploySuccessRate" },
  },
  {
    id: "shopflow",
    label: "samples/shopflow",
    description: "Hand-made 7-layer sample from the PRD (SQL, PySpark, API, React).",
    graph: shopflowGraph,
    defaultChange: { node: "db:column:orders.cust_id", to: "customer_id" },
  },
];

export function demoRepo(id: string | undefined): DemoRepo | undefined {
  return DEMO_REPOS.find((r) => r.id === id);
}

/**
 * The graph for a repo id: a sample, a repo the user connected (ingestion API
 * inside this app), or, in live mode with no repo picked, the backend's graph.
 */
export async function fetchGraph(repoId?: string): Promise<Graph> {
  const sample = demoRepo(repoId);
  if (sample) return sample.graph;
  if (repoId) {
    const res = await fetch(`/api/repos/${encodeURIComponent(repoId)}`, { cache: "no-store" });
    if (res.ok) return ((await res.json()) as { graph: Graph }).graph;
  }
  if (DATA_MODE === "live") return http<Graph>("/graph");
  return DEMO_REPOS[0].graph;
}

// ---------------------------------------------------------------------------
// Connected repositories (ingestion API: app/api/repos).
// ---------------------------------------------------------------------------

export async function listConnectedRepos(): Promise<ConnectedRepo[]> {
  const res = await fetch("/api/repos", { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not list repositories (${res.status})`);
  return res.json() as Promise<ConnectedRepo[]>;
}

/** Reads a newline-delimited JSON stream. Resolves with the last event. */
async function readNdjson<E extends { type: string }>(res: Response, onEvent: (e: E) => void): Promise<E> {
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    const e = { type: "error", message: body?.error ?? `Request failed (${res.status})` } as unknown as E;
    onEvent(e);
    return e;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let last = { type: "error", message: "The connection closed early" } as unknown as E;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      last = JSON.parse(line) as E;
      onEvent(last);
    }
  }
  return last;
}

export async function connectRepo(
  input: ({ url: string; ref?: string } | { file: File }) & { bob?: boolean },
  onEvent: (e: IngestEvent) => void,
): Promise<IngestEvent> {
  let res: Response;
  if ("file" in input) {
    const form = new FormData();
    form.append("file", input.file);
    if (input.bob) form.append("bob", "true");
    res = await fetch("/api/repos", { method: "POST", body: form });
  } else {
    res = await fetch("/api/repos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  }
  return readNdjson<IngestEvent>(res, onEvent);
}

export async function rescanRepo(id: string, onEvent: (e: IngestEvent) => void): Promise<IngestEvent> {
  const res = await fetch(`/api/repos/${encodeURIComponent(id)}/rescan`, { method: "POST" });
  return readNdjson<IngestEvent>(res, onEvent);
}

export async function removeRepo(id: string) {
  const res = await fetch(`/api/repos/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`Could not remove the repository (${res.status})`);
}

/** Works out the impact. In live mode the server also creates the change. */
export async function analyseChange(
  graph: Graph,
  request: ChangeRequest,
): Promise<{ report: ImpactReport; changeId?: string }> {
  if (DATA_MODE === "demo") return { report: computeImpact(graph, request) };
  const res = await http<{ change_id: string; report: ImpactReport }>("/changes", {
    method: "POST",
    body: JSON.stringify(request),
  });
  return { report: res.report, changeId: res.change_id };
}

export async function runChange(changeId: string) {
  await http(`/changes/${encodeURIComponent(changeId)}/run`, { method: "POST" });
}

export async function approveChange(changeId: string) {
  await http(`/changes/${encodeURIComponent(changeId)}/approve`, { method: "POST" });
}

/** Opens the live event feed. Returns a function that closes it. */
export function subscribeEvents(
  onEvent: (ev: RunEvent) => void,
  onStatus: (s: "open" | "closed") => void,
): () => void {
  if (DATA_MODE === "demo") return () => {};
  const wsUrl = API_URL.replace(/^http/, "ws") + "/ws";
  let ws: WebSocket | null = null;
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const connect = () => {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => onStatus("open");
    ws.onmessage = (msg) => {
      try {
        onEvent(JSON.parse(msg.data) as RunEvent);
      } catch {
        // Ignore messages that are not events.
      }
    };
    ws.onclose = () => {
      onStatus("closed");
      if (!stopped) retry = setTimeout(connect, 2000);
    };
  };
  connect();
  return () => {
    stopped = true;
    clearTimeout(retry);
    ws?.close();
  };
}

// ---------------------------------------------------------------------------
// GitHub agent (app/api/github).
// ---------------------------------------------------------------------------

export async function fetchGithubStatus(): Promise<{ configured: boolean; login?: string; error?: string }> {
  const res = await fetch("/api/github/status", { cache: "no-store" });
  return res.ok ? res.json() : { configured: false, error: `Status check failed (${res.status})` };
}

export interface AgentRequest {
  url: string;
  ref?: string;
  field: string;
  to: string;
  changeId: string;
  title: string;
  body: string;
  dryRun: boolean;
}

// ---------------------------------------------------------------------------
// IBM Bob (app/api/bob). The key stays on the server.
// ---------------------------------------------------------------------------

export async function fetchBobStatus(): Promise<BobStatus> {
  const res = await fetch("/api/bob/status", { cache: "no-store" }).catch(() => null);
  return res?.ok ? res.json() : { configured: false, cli: false, ready: false, reason: `Status check failed${res ? ` (${res.status})` : ""}` };
}

export async function runGithubAgent(input: AgentRequest, onEvent: (e: AgentEvent) => void): Promise<AgentEvent> {
  const res = await fetch("/api/github/pull-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  return readNdjson<AgentEvent>(res, onEvent);
}

// ---------------------------------------------------------------------------
// Real change runs (app/api/changes). The compiler or IBM Bob Fixer agents make
// the change in a fresh clone; the PR is opened later from the stored patch.
// ---------------------------------------------------------------------------

/** Streams a real run. Resolves when the stream ends; `signal` stops it. */
export async function runChangeStream(req: ChangeRunRequest, onLine: (l: ChangeStreamLine) => void, signal?: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/changes/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req), signal });
  } catch (err) {
    if (!signal?.aborted) onLine({ type: "error", message: err instanceof Error ? err.message : "Could not reach the server" });
    return;
  }
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    onLine({ type: "error", message: body?.error ?? `The run could not start (${res.status})` });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          onLine(JSON.parse(line) as ChangeStreamLine);
        } catch {
          // Skip malformed lines.
        }
      }
    }
  } catch (err) {
    if (!signal?.aborted) onLine({ type: "error", message: err instanceof Error ? err.message : "The connection closed early" });
  }
}

/** Opens a draft PR from a real run's stored patch. */
export async function openPullRequestFromPatch(input: { patchId: string; title: string; body: string }, onEvent: (e: AgentEvent) => void): Promise<AgentEvent> {
  const res = await fetch("/api/changes/pull-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  return readNdjson<AgentEvent>(res, onEvent);
}
