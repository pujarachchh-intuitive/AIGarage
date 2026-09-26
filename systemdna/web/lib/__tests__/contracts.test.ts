// Contract tests for the demo data and the engines that the dashboard runs on.
// Ported from the B1 fixture checks (bob_sessions/fde4/fe-01-contracts-mock-data),
// now run against the demo repo graph (marketplace-dashboard, scanned from real code).

import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_REPOS } from "@/lib/api";
import { computeImpact } from "@/lib/impact";
import { deriveRun } from "@/lib/run-state";
import { approveSimulation, startSimulation } from "@/lib/simulator";
import type { Change, Graph, RunEvent } from "@/lib/types";

// The change the New change form starts with on the demo repo.
const demo = DEMO_REPOS[0];
const demoGraph = demo.graph;
const ORIGIN = demo.defaultChange.node; // field:Deployment.successRate
const RENAME = { node: ORIGIN, change: "rename" as const, to: demo.defaultChange.to };

describe.each(DEMO_REPOS.map((r) => [r.id, r.graph] as [string, Graph]))("graph %s", (_id, graph) => {
  const ids = new Set(graph.nodes.map((n) => n.id));

  it("has unique node and edge ids", () => {
    expect(ids.size).toBe(graph.nodes.length);
    expect(new Set(graph.edges.map((e) => e.id)).size).toBe(graph.edges.length);
  });

  it("every edge endpoint exists", () => {
    const missing = graph.edges.filter((e) => !ids.has(e.from) || !ids.has(e.to)).map((e) => e.id);
    expect(missing).toEqual([]);
  });

  it("every parent exists", () => {
    expect(graph.nodes.filter((n) => n.parent && !ids.has(n.parent)).map((n) => n.id)).toEqual([]);
  });

  it("every node sits in a declared layer", () => {
    const layers = new Set(graph.layers.map((l) => l.id));
    expect(graph.nodes.filter((n) => !layers.has(n.layer)).map((n) => n.id)).toEqual([]);
  });
});

describe("demo repo contracts", () => {
  const edge = (from: string, to: string) => demoGraph.edges.find((e) => e.from === from && e.to === to);

  it("the default change points at a real node", () => {
    expect(demoGraph.nodes.find((n) => n.id === ORIGIN)?.type).toBe("TSField");
  });

  it("direct reads and writes of the field are rename references", () => {
    expect(edge(ORIGIN, "data:deployments")?.rule).toBe("rename_ref");
    expect(edge(ORIGIN, "fn:getProductRows")).toMatchObject({ type: "READS", rule: "rename_ref" });
  });

  it("doc mentions are medium-confidence edges", () => {
    expect(edge(ORIGIN, "doc:docs/PRD.md")).toMatchObject({ type: "DOCUMENTS", confidence: "medium" });
  });

  it("types flow into fields through TYPED_AS edges", () => {
    expect(edge("type:Status", "field:Deployment.status")).toMatchObject({ type: "TYPED_AS", rule: "update_type" });
  });
});

describe("impact of renaming Deployment.successRate", () => {
  const report = computeImpact(demoGraph, RENAME);
  const item = (id: string) => report.items.find((i) => i.nodeId === id);
  const unit = (file: string) => report.fixUnits.find((u) => u.file === file);

  it("answers in under a second", () => {
    expect(report.computedMs).toBeLessThan(1000);
  });

  it("does not confuse a same-named field on another type: ProductRow.successRate is safe", () => {
    expect(item("fn:getProductRows")?.severity).toBe("breaking");
    expect(item("field:ProductRow.successRate")?.severity).toBe("safe");
    expect(unit("components/ProductTable.tsx")).toBeUndefined();
  });

  it("flags the medium-confidence doc links for an update", () => {
    expect(item("doc:docs/PRD.md")).toMatchObject({ severity: "update", confidence: "medium" });
  });

  it("walks across layers into the pages", () => {
    expect(item("page:/products/[id]")?.severity).toBe("breaking");
  });

  it("needs approval for the shared types file", () => {
    expect(unit("lib/types.ts")?.needsApproval).toBe(true);
    expect(unit("lib/data.ts")?.needsApproval).toBe(false);
  });

  it("lists Product detail as an affected business process", () => {
    expect(report.business.map((b) => b.name)).toContain("Product detail");
  });

  it("gives every file to exactly one agent", () => {
    const files = report.fixUnits.map((u) => u.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it("orders waves upstream first", () => {
    const waveOfNode = new Map<string, number>();
    for (const u of report.fixUnits) for (const n of u.nodes) waveOfNode.set(n, u.wave);
    const violations = demoGraph.edges.filter((e) => {
      const from = waveOfNode.get(e.from);
      const to = waveOfNode.get(e.to);
      return from !== undefined && to !== undefined && from > to;
    });
    expect(violations.map((e) => e.id)).toEqual([]);
  });

  it("shows grep matching files that do not need a change", () => {
    expect(report.grep.falsePositives).toContain("components/ProductTable.tsx");
    expect(report.grep.falsePositives.some((f) => report.fixUnits.some((u) => u.file === f))).toBe(false);
    expect(report.grep.missed.every((f) => report.fixUnits.some((u) => u.file === f))).toBe(true);
  });
});

describe("simulated run", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("plays the PRD story: approvals, one block, one retry, green finish", async () => {
    vi.useFakeTimers();
    const report = computeImpact(demoGraph, RENAME);
    const change: Change = {
      id: "chg-test",
      title: "Rename Deployment.successRate",
      request: RENAME,
      report,
      createdAt: new Date(0).toISOString(),
      mode: "demo",
      events: [],
    };
    const events: RunEvent[] = [];
    startSimulation(change, (ev) => events.push(ev), { speed: 50 });

    await vi.advanceTimersByTimeAsync(10);
    const approvals = report.fixUnits.filter((u) => u.needsApproval).length;
    expect(events.filter((e) => e.event === "awaiting_approval")).toHaveLength(approvals);

    approveSimulation(change.id);
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    const kinds = events.map((e) => e.event);
    expect(kinds.at(-1)).toBe("change_completed");
    expect(kinds.filter((k) => k === "approved")).toHaveLength(approvals);

    const blocked = events.filter((e) => e.event === "blocked");
    expect(blocked).toHaveLength(1);
    // The blocked agent reaches for a file grep would have changed.
    expect(blocked[0].file).toBe(report.grep.falsePositives.find((f) => !f.endsWith(".md")));

    const failed = events.filter((e) => e.event === "check_failed");
    expect(failed).toHaveLength(1);
    const retry = events.findIndex((e) => e.event === "retrying");
    expect(retry).toBeGreaterThan(kinds.indexOf("check_failed"));
    expect(events[retry].agent_id).toBe(failed[0].agent_id);

    expect(events.find((e) => e.event === "rescan")?.data?.after).toBe(0);

    const view = deriveRun({ ...change, events }, Date.now());
    expect(view.status).toBe("completed");
    expect(view.agents.every((a) => a.state === "done")).toBe(true);
    expect(view.danglingAfter).toBe(0);
  });
});
