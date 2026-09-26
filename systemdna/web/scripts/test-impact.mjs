// Tests for the impact engine (lib/impact.ts).
//
//   npm test
//
// Small hand-made graphs, one behaviour per test, plus a speed budget on a big
// generated graph. Uses Node's built-in test runner: no extra packages.

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadLib } from "./load-ts.mjs";

const { computeImpact, indexGraph } = await loadLib("impact");

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

const LAYERS = [
  { id: "types", label: "Types", column: 0, requiresApproval: true },
  { id: "logic", label: "Logic", column: 1 },
  { id: "pages", label: "Pages", column: 2 },
  { id: "business", label: "Business", column: 3 },
  { id: "quality", label: "Tests and docs", column: -1 },
];

function node(id, extra = {}) {
  return { id, type: "Function", layer: "logic", name: id, file: `src/${id}.ts`, pii: false, criticality: "medium", tested: false, ...extra };
}

let edgeId = 0;
function edge(from, to, extra = {}) {
  return { id: `e${edgeId++}`, from, to, type: "READS", source: "parser", confidence: "high", evidence: "", rule: "rename_ref", ...extra };
}

function graph(nodes, edges, extra = {}) {
  return { repo: "test", scannedAt: "", layers: LAYERS, nodes, edges, ...extra };
}

const sev = (report, id) => report.items.find((i) => i.nodeId === id)?.severity;
const item = (report, id) => report.items.find((i) => i.nodeId === id);

// A type with one field, used by a function, shown on a page.
function basic(opts = {}) {
  return graph(
    [
      node("type:Order", { type: "TSType", layer: "types", name: "Order", file: "src/types.ts" }),
      node("field:Order.total", { type: "TSField", layer: "types", name: "Order.total", file: "src/types.ts", parent: "type:Order" }),
      node("fn:sum", { file: "src/sum.ts" }),
      node("page:orders", { type: "Page", layer: "pages", file: "app/orders/page.tsx" }),
      node("biz:billing", { type: "BusinessProcess", layer: "business", name: "Billing", owner: "Finance" }),
      ...(opts.nodes ?? []),
    ],
    [
      edge("field:Order.total", "fn:sum"),
      edge("fn:sum", "page:orders", { rule: opts.alias ? "keep_alias" : "rename_ref" }),
      edge("fn:sum", "biz:billing", { type: "SUPPORTS" }),
      ...(opts.edges ?? []),
    ],
    opts.graph,
  );
}

// ---------------------------------------------------------------------------
// Ripple
// ---------------------------------------------------------------------------

test("rename follows rename_ref links and breaks every user", () => {
  const r = computeImpact(basic(), { node: "field:Order.total", change: "rename", to: "grandTotal" });
  assert.equal(sev(r, "field:Order.total"), "breaking");
  assert.equal(sev(r, "fn:sum"), "breaking");
  assert.equal(sev(r, "page:orders"), "breaking");
  assert.deepEqual(r.fixUnits.map((u) => u.file), ["src/types.ts", "src/sum.ts", "app/orders/page.tsx"]);
});

test("an alias stops the ripple: the next node needs a check, not an edit", () => {
  const r = computeImpact(basic({ alias: true }), { node: "field:Order.total", change: "rename", to: "grandTotal" });
  assert.equal(sev(r, "page:orders"), "needs_update");
});

test("the ripple stops at safe nodes", () => {
  const g = basic({
    nodes: [node("fn:far", { file: "src/far.ts" })],
    edges: [edge("page:orders", "fn:far", { rule: "passthrough" }), edge("fn:far", "fn:sum")],
  });
  const r = computeImpact(g, { node: "field:Order.total", change: "rename", to: "x" });
  assert.equal(sev(r, "fn:far"), "safe");
  assert.ok(!r.fixUnits.some((u) => u.file === "src/far.ts"));
});

test("delete breaks direct users; signature breaks only callers", () => {
  const g = graph([node("fn:a"), node("fn:b"), node("fn:c")], [edge("fn:a", "fn:b", { type: "CALLS", rule: "passthrough" }), edge("fn:b", "fn:c", { type: "CALLS", rule: "passthrough" })]);
  const del = computeImpact(g, { node: "fn:a", change: "delete", to: "" });
  assert.equal(sev(del, "fn:b"), "breaking");
  assert.notEqual(sev(del, "fn:c"), "breaking");
  const sig = computeImpact(g, { node: "fn:a", change: "signature", to: "a(x: number)" });
  assert.equal(sev(sig, "fn:b"), "breaking");
  assert.notEqual(sev(sig, "fn:c"), "breaking");
});

test("business processes are listed but never get an agent", () => {
  const r = computeImpact(basic(), { node: "field:Order.total", change: "type_change", to: "bigint" });
  assert.deepEqual(r.business.map((b) => b.name), ["Billing"]);
  assert.ok(!r.fixUnits.some((u) => u.layer === "business"));
});

// ---------------------------------------------------------------------------
// Reliability
// ---------------------------------------------------------------------------

test("loops end, and nodes in one loop share a step", () => {
  const g = graph(
    [node("fn:a"), node("fn:b"), node("fn:c"), node("fn:d")],
    [edge("fn:a", "fn:b"), edge("fn:b", "fn:c"), edge("fn:c", "fn:b"), edge("fn:c", "fn:d"), edge("fn:d", "fn:a")],
  );
  const r = computeImpact(g, { node: "fn:a", change: "rename", to: "x" });
  assert.equal(item(r, "fn:a").depth, 0, "the changed node stays at step 0 even when a loop leads back to it");
  assert.equal(item(r, "fn:b").depth, item(r, "fn:c").depth, "b and c are one loop");
  assert.ok(item(r, "fn:d").depth > item(r, "fn:c").depth, "d comes after the loop");
});

test("links to missing nodes and self links are ignored, not a crash", () => {
  const g = graph([node("fn:a"), node("fn:b")], [edge("fn:a", "fn:b"), edge("fn:a", "ghost"), edge("ghost", "fn:b"), edge("fn:b", "fn:b")]);
  const r = computeImpact(g, { node: "fn:a", change: "rename", to: "x" });
  assert.equal(sev(r, "fn:b"), "breaking");
  assert.equal(r.items.length, 2);
});

test("an unknown node gives a clear error", () => {
  assert.throws(() => computeImpact(basic(), { node: "nope", change: "rename", to: "x" }), /Unknown node nope/);
});

test("the same input always gives the same report", () => {
  const g = basic();
  const req = { node: "field:Order.total", change: "rename", to: "x" };
  const strip = (r) => JSON.stringify({ ...r, computedMs: 0 });
  assert.equal(strip(computeImpact(g, req)), strip(computeImpact(g, req)));
});

test("confidence is the weakest link on the path", () => {
  const g = graph([node("fn:a"), node("fn:b"), node("fn:c")], [edge("fn:a", "fn:b", { confidence: "low", source: "bob" }), edge("fn:b", "fn:c")]);
  const r = computeImpact(g, { node: "fn:a", change: "rename", to: "x" });
  assert.equal(item(r, "fn:c").confidence, "low");
  assert.ok(item(r, "fn:c").factors.some((f) => f.label === "Less certain"));
});

test("a sure path wins over an unsure one", () => {
  const g = graph(
    [node("fn:a"), node("fn:b"), node("fn:c")],
    [edge("fn:a", "fn:c", { confidence: "low" }), edge("fn:a", "fn:b"), edge("fn:b", "fn:c")],
  );
  const r = computeImpact(g, { node: "fn:a", change: "rename", to: "x" });
  assert.equal(item(r, "fn:c").confidence, "high");
  assert.deepEqual(item(r, "fn:c").path, ["fn:a", "fn:b", "fn:c"]);
});

test("every affected node has a path back to the change", () => {
  const r = computeImpact(basic(), { node: "field:Order.total", change: "rename", to: "x" });
  for (const i of r.items) {
    assert.equal(i.path[0], "field:Order.total");
    assert.equal(i.path.at(-1), i.nodeId);
  }
});

test("indexGraph is cached per graph", () => {
  const g = basic();
  assert.equal(indexGraph(g).byId, indexGraph(g).byId);
});

// ---------------------------------------------------------------------------
// Risk
// ---------------------------------------------------------------------------

test("safe nodes carry no risk", () => {
  const g = basic({ nodes: [node("fn:far")], edges: [edge("page:orders", "fn:far", { rule: "passthrough" })] });
  const r = computeImpact(g, { node: "field:Order.total", change: "rename", to: "x" });
  assert.equal(item(r, "fn:far").risk, 0);
});

test("a file no test reaches scores higher than a tested one", () => {
  const files = [
    { path: "src/sum.ts", dir: "src", lines: 10, language: "typescript", imports: [] },
    { path: "src/other.ts", dir: "src", lines: 10, language: "typescript", imports: [] },
    { path: "tests/sum.test.ts", dir: "tests", lines: 10, language: "typescript", imports: ["src/sum.ts"] },
  ];
  const g = graph([node("fn:a"), node("fn:sum", { file: "src/sum.ts" }), node("fn:other", { file: "src/other.ts" })], [edge("fn:a", "fn:sum"), edge("fn:a", "fn:other")], { files });
  const r = computeImpact(g, { node: "fn:a", change: "rename", to: "x" });
  assert.ok(item(r, "fn:other").risk > item(r, "fn:sum").risk);
  assert.ok(item(r, "fn:other").factors.some((f) => f.label === "No tests"));
  assert.ok(!item(r, "fn:sum").factors.some((f) => f.label === "No tests"));
  assert.deepEqual(r.risk.coverage, { tested: 1, untested: 2, known: true });
});

test("tests are found through a barrel file", () => {
  const files = [
    { path: "src/index.ts", dir: "src", lines: 1, language: "typescript", imports: ["src/core.ts"] },
    { path: "src/core.ts", dir: "src", lines: 10, language: "typescript", imports: [] },
    { path: "tests/core.test.ts", dir: "tests", lines: 10, language: "typescript", imports: ["src/index.ts"] },
  ];
  const g = graph([node("fn:a", { file: "src/x.ts" }), node("fn:core", { file: "src/core.ts" })], [edge("fn:a", "fn:core")], { files });
  const r = computeImpact(g, { node: "fn:a", change: "rename", to: "x" });
  const f = item(r, "fn:core").factors;
  assert.ok(f.some((x) => x.label === "Weak tests"), "reached through the index, so covered but weakly");
  assert.ok(f.some((x) => x.label === "Public API"), "re-exported from src/index.ts");
});

test("pages, personal data and business processes raise the risk", () => {
  const g = basic({ nodes: [node("field:User.email", { type: "TSField", layer: "types", file: "src/user.ts" })], edges: [edge("fn:sum", "field:User.email")] });
  const r = computeImpact(g, { node: "field:Order.total", change: "rename", to: "x" });
  assert.ok(item(r, "page:orders").factors.some((f) => f.label === "Public API"));
  assert.ok(item(r, "field:User.email").factors.some((f) => f.label === "Personal data"));
  assert.ok(item(r, "fn:sum").factors.some((f) => f.label === "Business process"));
});

test("personal-data names: real words match, look-alikes do not", () => {
  const g = graph(
    [node("fn:a"), node("f:dob", { name: "User.dob" }), node("f:adobe", { name: "Brand.adobeId" }), node("f:mail", { name: "User.contactEmail" })],
    [edge("fn:a", "f:dob"), edge("fn:a", "f:adobe"), edge("fn:a", "f:mail")],
  );
  const r = computeImpact(g, { node: "fn:a", change: "rename", to: "x" });
  const pii = (id) => item(r, id).factors.some((f) => f.label === "Personal data");
  assert.equal(pii("f:dob"), true);
  assert.equal(pii("f:mail"), true);
  assert.equal(pii("f:adobe"), false);
});

test("the change gets a score, a level, drivers and recommendations", () => {
  const r = computeImpact(basic(), { node: "field:Order.total", change: "rename", to: "grandTotal" });
  assert.ok(r.risk.score > 0 && r.risk.score <= 100);
  assert.ok(["low", "medium", "high", "critical"].includes(r.risk.level));
  assert.ok(r.risk.drivers.length > 0);
  assert.ok(r.risk.recommendations.some((t) => t.includes("deprecated alias")), "a renamed field on a page should keep an alias");
  assert.ok(r.risk.recommendations.some((t) => t.includes("Finance")), "the business owner is named");
  assert.equal(r.risk.hotspots[0], [...r.items].filter((i) => i.severity !== "safe").sort((a, b) => b.risk - a.risk)[0].nodeId);
});

test("a small, local, tested change is low risk", () => {
  const files = [
    { path: "src/a.ts", dir: "src", lines: 10, language: "typescript", imports: [] },
    { path: "tests/a.test.ts", dir: "tests", lines: 10, language: "typescript", imports: ["src/a.ts"] },
  ];
  const g = graph([node("c:limit", { type: "Constant", file: "src/a.ts" }), node("fn:a", { file: "src/a.ts" })], [edge("c:limit", "fn:a")], { files });
  const r = computeImpact(g, { node: "c:limit", change: "rename", to: "LIMIT" });
  assert.equal(r.risk.level, "low");
});

// ---------------------------------------------------------------------------
// Speed
// ---------------------------------------------------------------------------

test("6000 nodes and 30000 links: an analysis stays under one second", () => {
  let seed = 3;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const N = 6000;
  const nodes = Array.from({ length: N }, (_, i) => node(`n${i}`, { file: `src/f${Math.floor(i / 6)}.ts` }));
  const edges = [];
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 5; k++) {
      const j = rand() < 0.9 ? Math.min(N - 1, i + 1 + Math.floor(rand() * 400)) : Math.floor(rand() * N);
      if (j !== i) edges.push(edge(`n${i}`, `n${j}`, { rule: rand() < 0.8 ? "rename_ref" : "passthrough" }));
    }
  }
  const g = graph(nodes, edges);
  let worst = 0;
  for (const start of ["n0", "n10", "n2000", "n4000"]) {
    const t = performance.now();
    const r = computeImpact(g, { node: start, change: "rename", to: "x" });
    worst = Math.max(worst, performance.now() - t);
    assert.ok(r.items.length > 0);
  }
  assert.ok(worst < 1000, `worst analysis took ${worst.toFixed(0)} ms`);
});
