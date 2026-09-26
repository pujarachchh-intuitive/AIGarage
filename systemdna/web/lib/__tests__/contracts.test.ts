// Contract tests for the demo data and the engines that the dashboard runs on.
// Ported from the B1 fixture checks (bob_sessions/fde4/fe-01-contracts-mock-data).

import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_REPOS } from "@/lib/api";
import { computeImpact } from "@/lib/impact";
import { shopflowGraph } from "@/lib/mock/shopflow";
import { deriveRun } from "@/lib/run-state";
import { approveSimulation, startSimulation } from "@/lib/simulator";
import type { Change, Graph, RunEvent } from "@/lib/types";

const RENAME = { node: "db:column:orders.cust_id", change: "rename" as const, to: "customer_id" };

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

describe("ShopFlow traps (PRD section 15)", () => {
  const edge = (from: string, to: string) => shopflowGraph.edges.find((e) => e.from === from && e.to === to);

  it("alias chain: stg_orders.customer_key keeps its alias", () => {
    expect(edge("db:column:orders.cust_id", "pipe:column:stg_orders.customer_key")?.rule).toBe("keep_alias");
  });

  it("dynamic SQL: export_job is a medium-confidence edge found by Bob", () => {
    expect(edge("db:column:orders.cust_id", "pipe:sparkjob:export_job")).toMatchObject({
      source: "bob",
      confidence: "medium",
    });
  });

  it("cross-language: the TS field is typed from the Python API", () => {
    expect(edge("api:endpoint:get_orders", "fe:tsfield:Order.cust_id")?.type).toBe("TYPED_AS");
  });
});

describe("impact of renaming orders.cust_id", () => {
  const report = computeImpact(shopflowGraph, RENAME);
  const item = (id: string) => report.items.find((i) => i.nodeId === id);
  const unit = (file: string) => report.fixUnits.find((u) => u.file === file);

  it("answers in under a second", () => {
    expect(report.computedMs).toBeLessThan(1000);
  });

  it("stops at the alias: stg_orders needs an update, fct_revenue is safe", () => {
    expect(item("pipe:column:stg_orders.customer_key")?.severity).toBe("needs_update");
    expect(item("pipe:sqlmodel:fct_revenue")?.severity).toBe("safe");
    expect(unit("transforms/fct_revenue.sql")).toBeUndefined();
  });

  it("flags the Bob-found export_job link for a check", () => {
    expect(item("pipe:sparkjob:export_job")).toMatchObject({ severity: "breaking", confidence: "medium" });
  });

  it("walks across languages into the frontend", () => {
    expect(item("fe:component:OrdersTable")?.severity).toBe("breaking");
  });

  it("needs approval for the database change and the PII model", () => {
    expect(unit("db/schema.sql")?.needsApproval).toBe(true);
    expect(unit("transforms/dim_customer.sql")?.needsApproval).toBe(true);
  });

  it("lists Monthly Revenue Close as an affected business process", () => {
    expect(report.business.map((b) => b.name)).toContain("Monthly Revenue Close");
  });

  it("gives every file to exactly one agent", () => {
    const files = report.fixUnits.map((u) => u.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it("orders waves upstream first", () => {
    const waveOfNode = new Map<string, number>();
    for (const u of report.fixUnits) for (const n of u.nodes) waveOfNode.set(n, u.wave);
    const violations = shopflowGraph.edges.filter((e) => {
      const from = waveOfNode.get(e.from);
      const to = waveOfNode.get(e.to);
      return from !== undefined && to !== undefined && from > to;
    });
    expect(violations.map((e) => e.id)).toEqual([]);
  });

  it("shows grep missing files that SystemDNA finds", () => {
    expect(report.grep.missed).toContain("pipelines/export_job.py");
    expect(report.grep.missed.every((f) => report.fixUnits.some((u) => u.file === f))).toBe(true);
  });
});

describe("simulated run", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("plays the PRD story: approvals, one block, one retry, green finish", async () => {
    vi.useFakeTimers();
    const report = computeImpact(shopflowGraph, RENAME);
    const change: Change = {
      id: "chg-test",
      title: "Rename orders.cust_id",
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
    expect(blocked[0].node).toBe("pipelines/export_job.py");

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
