// Benchmark and sanity check for the impact engine.
//
//   node scripts/bench-impact.mjs
//
// Runs computeImpact for many changes on every graph we have (the sample, the
// repos in .data/repos) and on a large generated graph, then prints timings and
// how much each analysis found. Nothing is written.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadLib, WEB } from "./load-ts.mjs";

const { computeImpact } = await loadLib("impact");

function graphs() {
  const list = [["sample: marketplace-dashboard", path.join(WEB, "lib/mock/marketplace-dashboard.graph.json")]];
  const dir = path.join(WEB, ".data/repos");
  if (existsSync(dir)) {
    for (const d of readdirSync(dir)) {
      const f = path.join(dir, d, "graph.json");
      if (existsSync(f)) list.push([d, f]);
    }
  }
  return list.map(([name, f]) => [name, JSON.parse(readFileSync(f, "utf8"))]);
}

/** A big layered graph with cycles, like a large monorepo. */
function synthetic(nodes = 6000, edgesPer = 5) {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const layers = ["types", "data", "logic", "api", "components", "pages", "quality"].map((id, i) => ({ id, label: id, column: id === "quality" ? -1 : i }));
  const types = { types: "TSType", data: "Function", logic: "Function", api: "Endpoint", components: "Component", pages: "Page", quality: "Test" };
  const ns = [];
  const es = [];
  for (let i = 0; i < nodes; i++) {
    const layer = layers[Math.min(layers.length - 1, Math.floor((i / nodes) * layers.length))];
    const file = `src/${layer.id}/f${Math.floor(i / 6)}.ts`;
    const isField = layer.id === "types" && i % 4 !== 0;
    ns.push({
      id: `n${i}`,
      type: isField ? "TSField" : types[layer.id],
      layer: layer.id,
      name: isField ? `T${Math.floor(i / 4)}.f${i}` : `sym${i}`,
      file,
      parent: isField ? `n${i - (i % 4)}` : undefined,
      pii: rand() < 0.03,
      criticality: rand() < 0.1 ? "high" : rand() < 0.4 ? "medium" : "low",
      tested: rand() < 0.6,
    });
  }
  const rules = ["rename_ref", "rename_ref", "rename_ref", "update_type", "keep_alias", "passthrough"];
  for (let i = 0; i < nodes; i++) {
    for (let k = 0; k < edgesPer; k++) {
      // Mostly downstream, sometimes back up (cycles).
      const j = rand() < 0.9 ? Math.min(nodes - 1, i + 1 + Math.floor(rand() * 400)) : Math.floor(rand() * nodes);
      if (j === i) continue;
      const to = ns[j];
      es.push({
        id: `e${es.length}`,
        from: `n${i}`,
        to: to.id,
        type: to.type === "Test" ? "TESTS" : rand() < 0.5 ? "READS" : "CALLS",
        source: rand() < 0.1 ? "bob" : "parser",
        confidence: rand() < 0.1 ? "low" : rand() < 0.3 ? "medium" : "high",
        evidence: "",
        rule: to.type === "Test" ? "update_doc" : rules[Math.floor(rand() * rules.length)],
      });
    }
  }
  return { repo: "synthetic", scannedAt: "", layers, nodes: ns, edges: es };
}

const CHANGEABLE = new Set(["TSField", "Column", "Field", "Table", "TSType", "Function", "Constant", "Dataset", "Component"]);

function bench(name, graph, maxChanges = 60) {
  const picks = graph.nodes.filter((n) => CHANGEABLE.has(n.type)).slice(0, maxChanges);
  const kinds = ["rename", "type_change", "delete"];
  let total = 0;
  let worst = 0;
  let affected = 0;
  let runs = 0;
  for (const n of picks) {
    for (const change of kinds) {
      const t = performance.now();
      const r = computeImpact(graph, { node: n.id, change, to: change === "delete" ? "" : "x2" });
      const ms = performance.now() - t;
      total += ms;
      worst = Math.max(worst, ms);
      affected += r.items.filter((i) => i.severity !== "safe").length;
      runs++;
    }
  }
  console.log(
    `${name.padEnd(46)} ${String(graph.nodes.length).padStart(5)} nodes ${String(graph.edges.length).padStart(6)} edges | ${String(runs).padStart(3)} runs | avg ${(total / runs).toFixed(2).padStart(8)} ms | worst ${worst.toFixed(1).padStart(8)} ms | avg affected ${(affected / runs).toFixed(1)}`,
  );
}

for (const [name, g] of graphs()) bench(name, g);
bench("synthetic 6000 nodes", synthetic(), 15);
