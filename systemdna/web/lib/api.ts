// Data access. Two modes:
//  - demo: no NEXT_PUBLIC_API_URL. Uses a demo repo graph (DEMO_REPOS), runs the
//    impact engine in the browser, and simulates runs.
//  - live: NEXT_PUBLIC_API_URL points at the FastAPI server (PRD section 13).

import { computeImpact } from "@/lib/impact";
import marketplaceGraph from "@/lib/mock/marketplace-dashboard.graph.json";
import { shopflowGraph } from "@/lib/mock/shopflow";
import type { ChangeRequest, DataMode, Graph, ImpactReport, RunEvent } from "@/lib/types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "";
export const DATA_MODE: DataMode = API_URL ? "live" : "demo";

// The demo write token is typed in on the Settings page and kept in sessionStorage only.
// It must never come from NEXT_PUBLIC_* env vars: those are baked into the public bundle.
const TOKEN_KEY = "systemdna.demoToken";
const tokenListeners = new Set<() => void>();

export function subscribeDemoToken(onChange: () => void): () => void {
  tokenListeners.add(onChange);
  return () => tokenListeners.delete(onChange);
}

export function getDemoToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setDemoToken(token: string) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked (private mode): the token simply is not kept.
  }
  tokenListeners.forEach((l) => l());
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getDemoToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

export function demoRepo(id: string | undefined): DemoRepo {
  return DEMO_REPOS.find((r) => r.id === id) ?? DEMO_REPOS[0];
}

export async function fetchGraph(repoId?: string): Promise<Graph> {
  if (DATA_MODE === "demo") return demoRepo(repoId).graph;
  return http<Graph>("/graph");
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
