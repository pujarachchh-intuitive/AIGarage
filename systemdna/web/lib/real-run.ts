// Real change runs in the browser: start, follow and stop the server's run
// (app/api/changes/run). The server does the work in a fresh clone with the
// TypeScript compiler or IBM Bob Fixer agents; this turns its stream into the
// change's events (for the map, trace and agents table) and its run result
// (diff, review, patch). One run per change at a time.

import { DEMO_REPOS, runChangeStream } from "@/lib/api";
import { useApp } from "@/lib/store";
import type { Change, ChangeRunRequest, ConnectedRepo, Graph, RunEvent } from "@/lib/types";

const running = new Map<string, AbortController>();

export function isRealRunning(changeId: string) {
  return running.has(changeId);
}

export function stopRealRun(changeId: string) {
  running.get(changeId)?.abort();
  running.delete(changeId);
}

/** The github.com repo a change can run against, or null (samples without code, other hosts). */
export function realRunTarget(change: Change, graph: Graph | null, repos: ConnectedRepo[]): { url: string; ref?: string } | null {
  if (change.mode !== "demo" || !graph?.nodes.some((n) => n.id === change.request.node)) return null;
  const connected = repos.find((r) => r.name === change.repo && r.source === "git" && r.url?.startsWith("https://github.com/"));
  if (connected) return { url: connected.url!, ref: connected.ref };
  const sample = DEMO_REPOS.find((r) => r.graph.repo === change.repo && r.gitUrl?.startsWith("https://github.com/"));
  return sample ? { url: sample.gitUrl! } : null;
}

/** Why each planned file is affected: the evidence of the link that reached it. */
function unitContext(change: Change, graph: Graph): Record<string, string[]> {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const edges = new Map(graph.edges.map((e) => [e.id, e]));
  const unitOf = new Map(change.report.fixUnits.flatMap((u) => u.nodes.map((id) => [id, u.file] as const)));
  const out: Record<string, string[]> = {};
  for (const item of change.report.items) {
    const file = unitOf.get(item.nodeId);
    const n = nodes.get(item.nodeId);
    if (!file || !n) continue;
    const e = item.viaEdge ? edges.get(item.viaEdge) : undefined;
    const from = e ? nodes.get(e.from) : undefined;
    (out[file] ??= []).push(
      e && from
        ? `${n.type} \`${n.name}\` ${item.severity.replace("_", " ")}: it ${e.type.toLowerCase().replace("_", " ")} \`${from.name}\` (${e.evidence})`
        : `${n.type} \`${n.name}\` is the changed component (${n.file}${n.line ? `:${n.line}` : ""})`,
    );
  }
  return out;
}

/** Starts the real run. Resolves when it ends. */
export async function startRealRun(change: Change, graph: Graph, target: { url: string; ref?: string }) {
  if (running.has(change.id)) return;
  const store = useApp.getState();
  const origin = graph.nodes.find((n) => n.id === change.request.node);
  if (!origin) return;
  const controller = new AbortController();
  running.set(change.id, controller);
  store.setRun(change.id, undefined);
  store.setRun(change.id, { status: "running", step: "Starting" });

  let completed = false;
  let failure: string | undefined;
  const req: ChangeRunRequest = {
    url: target.url,
    ref: target.ref,
    change: { id: change.id, title: change.title, request: change.request, report: change.report },
    origin,
    context: unitContext(change, graph),
  };
  await runChangeStream(
    req,
    (line) => {
      switch (line.type) {
        case "event":
          if (line.event.event === "change_completed") completed = true;
          store.appendEvent(line.event);
          break;
        case "status":
          store.setRun(change.id, { step: line.step, ...(line.strategy ? { strategy: line.strategy } : {}) });
          break;
        case "review":
          store.setRun(change.id, { review: line.review });
          break;
        case "preview":
          store.setRun(change.id, {
            status: "done",
            step: undefined,
            files: line.files,
            diff: line.diff,
            diffTruncated: line.diffTruncated,
            patchId: line.patchId,
            remainingErrors: line.remainingErrors,
          });
          break;
        case "error":
          failure = line.message;
          store.setRun(change.id, { error: line.message });
          break;
      }
    },
    controller.signal,
  );
  running.delete(change.id);
  if (controller.signal.aborted) return;
  // Never leave the page on "Running": close the run if the server did not.
  if (!completed) {
    const ev: RunEvent = { ts: new Date().toISOString(), change_id: change.id, event: "change_completed", detail: `Failed: ${failure ?? "the connection closed early"}` };
    store.appendEvent(ev);
  }
  const run = useApp.getState().changes.find((c) => c.id === change.id)?.run;
  if (run?.status === "running") store.setRun(change.id, { status: "failed", step: undefined, error: failure ?? "The run ended without a result." });
}
