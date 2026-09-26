// Impact engine (PRD section 8). In demo mode it runs in the browser.
// With a backend connected, the server returns the same ImpactReport shape.

import { layerDef, SEVERITY_RANK } from "@/lib/layers";
import type {
  ChangeRequest,
  FixUnit,
  Graph,
  GraphEdge,
  GraphNode,
  ImpactItem,
  ImpactReport,
  Severity,
} from "@/lib/types";

const RULE_SEVERITY: Record<GraphEdge["rule"], Severity> = {
  rename_ref: "breaking",
  update_type: "breaking",
  keep_alias: "needs_update",
  update_doc: "update",
  passthrough: "safe",
};

const MAX_DEPTH = 40;

// Edges that describe coverage of an asset, not data flow.
const COVERAGE_EDGES = new Set<GraphEdge["type"]>(["TESTS", "DOCUMENTS"]);

/** Nodes that hold one value (their users read or write it by name). */
const VALUE_NODES = new Set<GraphNode["type"]>(["TSField", "Column", "Field"]);

/**
 * How badly a change reaches `e.to`, given how badly it reached `e.from`.
 *
 * rename       fields and columns follow the edge rules; for any other symbol
 *              (function, type, constant, component) every direct reference breaks
 * type_change  users of the value break; values passed on need a check
 * custom       like type_change (the agents decide what really needs an edit)
 * signature    callers break; nothing further
 * delete       direct users break; a field or column that mirrors the deleted one
 *              goes too, so its users break as well
 */
function severityFor(request: ChangeRequest, from: { severity: Severity; isOrigin: boolean; type: GraphNode["type"] }, e: GraphEdge): Severity {
  const coverage = COVERAGE_EDGES.has(e.type);
  const directUse = (): Severity => (e.type === "RETURNS" ? "safe" : coverage ? "update" : "breaking");
  switch (request.change) {
    case "rename":
      if (from.isOrigin && !VALUE_NODES.has(from.type)) return directUse();
      break;
    case "type_change":
    case "custom":
      if (from.severity === "breaking") {
        if (e.rule === "update_doc") return "update";
        if (e.rule === "passthrough") return e.type === "RETURNS" ? "safe" : "needs_update";
        return "breaking";
      }
      return from.severity === "needs_update" && coverage ? "update" : "safe";
    case "signature":
      if (from.isOrigin) return directUse();
      return from.severity === "breaking" && coverage ? "update" : "safe";
    case "delete":
      if (from.isOrigin || (from.severity === "breaking" && VALUE_NODES.has(from.type) && e.type !== "RETURNS")) return directUse();
      return from.severity === "breaking" && coverage ? "update" : "safe";
  }
  // Field and column renames: the edge rule decides.
  if (from.severity === "breaking") return RULE_SEVERITY[e.rule];
  // The asset still changes, so its tests and docs still need a look.
  if (from.severity === "needs_update" && coverage) return "update";
  // Behind an alias, a doc or a test: downstream is safe.
  return "safe";
}

export function assetOf(node: GraphNode): string {
  return node.parent ?? node.id;
}

/** Last part of a dotted name: "orders.cust_id" -> "cust_id". */
export function shortName(name: string): string {
  const parts = name.split(".");
  return parts[parts.length - 1];
}

export function indexGraph(graph: Graph) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const out = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();
  for (const e of graph.edges) {
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from)!.push(e);
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to)!.push(e);
  }
  return { byId, out, incoming };
}

/** Number of nodes reachable downstream of `id` in the whole graph. */
function fanOut(id: string, out: Map<string, GraphEdge[]>): number {
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const e of out.get(cur) ?? []) {
      if (!seen.has(e.to)) {
        seen.add(e.to);
        stack.push(e.to);
      }
    }
  }
  return seen.size;
}

export function computeImpact(graph: Graph, request: ChangeRequest): ImpactReport {
  const started = performance.now();
  const { byId, out } = indexGraph(graph);
  const origin = byId.get(request.node);
  if (!origin) throw new Error(`Unknown node ${request.node}`);

  // A table or type changed as a whole (not renamed) carries its columns' and
  // fields' links: code that uses a column of a deleted table breaks too. A
  // renamed table does too, since code names the model to reach its columns.
  const children = new Map<string, GraphNode[]>();
  for (const n of graph.nodes) if (n.parent) children.set(n.parent, [...(children.get(n.parent) ?? []), n]);
  const wholeAsset = (origin.type === "Table" && request.change !== "type_change") || (origin.type === "TSType" && request.change !== "rename");

  // Edges leaving a node: its own, plus coverage edges of its asset.
  const edgesFrom = (n: GraphNode): GraphEdge[] => {
    const own = out.get(n.id) ?? [];
    if (n.id === origin.id && wholeAsset) return [...own, ...(children.get(n.id) ?? []).flatMap((c) => out.get(c.id) ?? [])];
    if (!n.parent) return own;
    const coverage = (out.get(n.parent) ?? []).filter((e) => COVERAGE_EDGES.has(e.type));
    return [...own, ...coverage];
  };

  const items = new Map<string, ImpactItem>();
  const setItem = (id: string, severity: Severity, depth: number, edge?: GraphEdge) => {
    const prev = items.get(id);
    const stronger = !prev || SEVERITY_RANK[severity] > SEVERITY_RANK[prev.severity];
    // Real code has cycles (a function reads fields of the type it returns).
    // Only non-safe links may push a node deeper, and depth is capped, so the walk always ends.
    const deeper = !prev || (severity !== "safe" && depth > prev.depth && depth <= MAX_DEPTH);
    if (!stronger && !deeper) return false;
    items.set(id, {
      nodeId: id,
      severity: stronger ? severity : prev!.severity,
      depth: Math.max(depth, prev?.depth ?? 0),
      risk: 0,
      viaEdge: stronger ? edge?.id : prev?.viaEdge,
      confidence: stronger ? (edge?.confidence ?? "high") : prev!.confidence,
      needsApproval: false,
    });
    return true;
  };

  setItem(origin.id, "breaking", 0);
  const queue: string[] = [origin.id];
  while (queue.length) {
    const id = queue.shift()!;
    const item = items.get(id)!;
    const n = byId.get(id)!;
    for (const e of edgesFrom(n)) {
      const severity = severityFor(request, { severity: item.severity, isOrigin: id === origin.id, type: n.type }, e);
      if (setItem(e.to, severity, item.depth + 1, e)) queue.push(e.to);
    }
  }

  // Risk score: 35 fan-out + 30 criticality + 20 PII + 15 untested.
  const fan = new Map(graph.nodes.map((n) => [n.id, fanOut(n.id, out)]));
  const maxFan = Math.max(1, ...fan.values());
  const crit = { low: 0, medium: 0.5, high: 1 } as const;
  for (const item of items.values()) {
    const n = byId.get(item.nodeId)!;
    const asset = byId.get(assetOf(n)) ?? n;
    item.risk = Math.round(
      35 * ((fan.get(n.id) ?? 0) / maxFan) +
        30 * crit[asset.criticality] +
        20 * (n.pii || asset.pii ? 1 : 0) +
        15 * (asset.tested ? 0 : 1),
    );
    item.needsApproval =
      item.severity !== "safe" && (Boolean(layerDef(graph, n.layer)?.requiresApproval) || n.pii || asset.pii);
  }

  // Group everything that needs an edit into one fix unit per file.
  // One agent owns one file, so two agents never edit the same file.
  const unitMap = new Map<string, FixUnit>();
  for (const item of items.values()) {
    if (item.severity === "safe") continue;
    const n = byId.get(item.nodeId)!;
    if (n.layer === "business") continue; // Business processes are read-only.
    const assetId = assetOf(n);
    const asset = byId.get(assetId) ?? n;
    const unit = unitMap.get(asset.file) ?? {
      id: asset.file,
      assetName: asset.file.split("/").pop() ?? asset.file,
      file: asset.file,
      layer: asset.layer,
      assets: [],
      nodes: [],
      wave: 0,
      needsApproval: false,
    };
    unit.nodes.push(n.id);
    if (!unit.assets.includes(assetId)) unit.assets.push(assetId);
    unit.wave = Math.max(unit.wave, item.depth);
    if (item.needsApproval) {
      unit.needsApproval = true;
      const def = layerDef(graph, n.layer);
      unit.approvalReason = def?.requiresApproval ? `${def.label} change` : "Personal data";
    }
    unitMap.set(asset.file, unit);
  }

  // Waves: renumber depths 1..n so upstream files go first.
  const depths = [...new Set([...unitMap.values()].map((u) => u.wave))].sort((a, b) => a - b);
  const fixUnits = [...unitMap.values()]
    .map((u) => ({ ...u, wave: depths.indexOf(u.wave) + 1 }))
    .sort((a, b) => a.wave - b.wave || a.file.localeCompare(b.file));

  const business = [...items.values()]
    .filter((i) => byId.get(i.nodeId)?.layer === "business")
    .map((i) => {
      const n = byId.get(i.nodeId)!;
      return { nodeId: n.id, name: n.name, owner: n.owner, severity: i.severity };
    });

  // Grep comparison, by file: which files contain the old name as plain text?
  const oldName = shortName(origin.name.replace(/\(\)$/, ""));
  const found = graph.textIndex?.[oldName] ?? [
    ...new Set(graph.nodes.filter((n) => n.tokens?.includes(oldName)).map((n) => n.file)),
  ];
  const unitFiles = new Set(fixUnits.map((u) => u.file));
  const grep = {
    found,
    missed: [...unitFiles].filter((f) => !found.includes(f)),
    falsePositives: found.filter((f) => !unitFiles.has(f)),
  };

  const levels: string[][] = [];
  for (const item of items.values()) {
    (levels[item.depth] ??= []).push(item.nodeId);
  }

  const danglingRefs = [...items.values()].filter(
    (i) => i.severity === "breaking" || i.severity === "needs_update",
  ).length;

  return {
    request,
    oldName,
    items: [...items.values()].sort((a, b) => a.depth - b.depth || b.risk - a.risk),
    fixUnits,
    waveCount: depths.length,
    business,
    grep,
    levels: levels.map((l) => l ?? []),
    danglingRefs,
    computedMs: Math.max(1, Math.round(performance.now() - started)),
  };
}
