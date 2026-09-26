// Impact engine (PRD section 8). In demo mode it runs in the browser.
// With a backend connected, the server returns the same ImpactReport shape.
//
// Three passes, each linear in the size of the affected part of the graph:
//
//   1. Ripple   walk the links from the changed node. The edge rules and the
//               change kind decide how badly each node is hit. A node's
//               confidence is its weakest link on the way.
//   2. Order    the fix order (depth) comes from the affected links. Nodes in a
//               loop must be fixed together, so a loop counts as one step
//               (strongly connected components, Tarjan's algorithm).
//   3. Risk     every affected node gets a 0-100 risk made of named factors
//               (dependents, public API, tests, personal data, business), and the
//               whole change gets a score, a level and recommendations.
//
// The scanner leaves some facts empty (no test links, criticality always
// "medium"), so the engine works them out from the graph: test coverage from
// the files tests import, importance from how many things depend on a node,
// the public API from pages, endpoints and a package's index file.

import { layerDef, layerLabel, SEVERITY_RANK } from "@/lib/layers";
import type {
  ChangeRequest,
  Confidence,
  FixUnit,
  Graph,
  GraphEdge,
  GraphNode,
  ImpactItem,
  ImpactReport,
  RiskAssessment,
  RiskFactor,
  RiskLevel,
  Severity,
} from "@/lib/types";

const RULE_SEVERITY: Record<GraphEdge["rule"], Severity> = {
  rename_ref: "breaking",
  update_type: "breaking",
  keep_alias: "needs_update",
  update_doc: "update",
  passthrough: "safe",
};

// Edges that describe coverage of an asset, not data flow.
const COVERAGE_EDGES = new Set<GraphEdge["type"]>(["TESTS", "DOCUMENTS"]);

/** Nodes that hold one value (their users read or write it by name). */
const VALUE_NODES = new Set<GraphNode["type"]>(["TSField", "Column", "Field"]);

const CONF_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

function weakest(a: Confidence, b: Confidence): Confidence {
  return CONF_RANK[a] <= CONF_RANK[b] ? a : b;
}

/**
 * How badly a change reaches `e.to`, given how badly it reached `e.from`.
 * Never stronger than `from` (except from the changed node itself), so the walk ends.
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

// ---------------------------------------------------------------------------
// Graph index. Built once per graph and reused by every analysis and by the UI.
// ---------------------------------------------------------------------------

interface GraphIndex {
  byId: Map<string, GraphNode>;
  /** Only edges whose two ends exist. */
  out: Map<string, GraphEdge[]>;
  incoming: Map<string, GraphEdge[]>;
  children: Map<string, GraphNode[]>;
  /** Test and doc edges leaving each asset. */
  coverageOut: Map<string, GraphEdge[]>;
  /** Capped downstream reach per node, filled on demand. */
  reach: Map<string, number>;
  tests?: TestInfo;
  publicFiles?: Set<string>;
  size: string;
}

const INDEX = new WeakMap<Graph, GraphIndex>();

function fullIndex(graph: Graph): GraphIndex {
  // The size check guards against a graph object that was changed in place.
  const size = `${graph.nodes.length}:${graph.edges.length}`;
  const hit = INDEX.get(graph);
  if (hit && hit.size === size) return hit;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const out = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();
  const coverageOut = new Map<string, GraphEdge[]>();
  for (const e of graph.edges) {
    // A link to a node the scan dropped would crash the walk. Skip it.
    if (!byId.has(e.from) || !byId.has(e.to) || e.from === e.to) continue;
    push(out, e.from, e);
    push(incoming, e.to, e);
    if (COVERAGE_EDGES.has(e.type)) push(coverageOut, e.from, e);
  }
  const children = new Map<string, GraphNode[]>();
  for (const n of graph.nodes) if (n.parent) push(children, n.parent, n);
  const ix: GraphIndex = { byId, out, incoming, children, coverageOut, reach: new Map(), size };
  INDEX.set(graph, ix);
  return ix;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Node lookups and edge lists. Cached per graph, so calling it on every render is cheap. */
export function indexGraph(graph: Graph) {
  const { byId, out, incoming } = fullIndex(graph);
  return { byId, out, incoming };
}

const REACH_CAP = 400;

/** How many nodes depend on `id`, directly or not (tests and docs left out). Stops counting at REACH_CAP. */
function reachOf(ix: GraphIndex, id: string): number {
  const hit = ix.reach.get(id);
  if (hit !== undefined) return hit;
  const seen = new Set<string>([id]);
  const stack = [id];
  while (stack.length && seen.size <= REACH_CAP) {
    for (const e of ix.out.get(stack.pop()!) ?? []) {
      if (COVERAGE_EDGES.has(e.type) || seen.has(e.to)) continue;
      seen.add(e.to);
      stack.push(e.to);
    }
  }
  const n = Math.min(REACH_CAP, seen.size - 1);
  ix.reach.set(id, n);
  return n;
}

// ---------------------------------------------------------------------------
// Facts the scanner does not fill in: tests, public API, personal data.
// ---------------------------------------------------------------------------

const TEST_FILE = /(^|\/)(__tests__|tests?|spec|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$/i;
const ENTRY_FILE = /^((src|source|lib|packages\/[^/]+\/src)\/)?index\.[cm]?[jt]sx?$/i;
/** How many import hops a test is trusted to cover (tests often import a barrel file). */
const TEST_HOPS = 3;

interface TestInfo {
  /** Any sign of tests in the repo at all. */
  hasTests: boolean;
  /** File -> import hops from the nearest test (1 = the test imports it). */
  hops: Map<string, number>;
}

function testInfo(graph: Graph, ix: GraphIndex): TestInfo {
  if (ix.tests) return ix.tests;
  const hops = new Map<string, number>();
  const imports = new Map((graph.files ?? []).map((f) => [f.path, f.imports]));
  const testFiles = new Set<string>();
  for (const f of graph.files ?? []) if (TEST_FILE.test(f.path)) testFiles.add(f.path);
  for (const n of graph.nodes) {
    if (n.type === "Test") testFiles.add(n.file);
    if (n.tested) hops.set(n.file, 1);
  }
  // Explicit test links from the scanner or Bob.
  for (const e of graph.edges) {
    if (e.type !== "TESTS") continue;
    const target = ix.byId.get(e.to);
    if (target) hops.set(target.file, 1);
  }
  // Files a test imports, then what those import, up to TEST_HOPS.
  let frontier = [...testFiles];
  for (let hop = 1; hop <= TEST_HOPS && frontier.length; hop++) {
    const next: string[] = [];
    for (const file of frontier) {
      for (const dep of imports.get(file) ?? []) {
        if (testFiles.has(dep) || (hops.get(dep) ?? Infinity) <= hop) continue;
        hops.set(dep, hop);
        next.push(dep);
      }
    }
    frontier = next;
  }
  ix.tests = { hasTests: testFiles.size > 0 || hops.size > 0, hops };
  return ix.tests;
}

/** Files other code outside the repo can use: a package's index file and what it re-exports. */
function publicFiles(graph: Graph, ix: GraphIndex): Set<string> {
  if (ix.publicFiles) return ix.publicFiles;
  const files = new Set<string>();
  for (const f of graph.files ?? []) {
    if (!ENTRY_FILE.test(f.path) || TEST_FILE.test(f.path)) continue;
    files.add(f.path);
    for (const dep of f.imports) if (!TEST_FILE.test(dep)) files.add(dep);
  }
  ix.publicFiles = files;
  return files;
}

const PUBLIC_TYPES = new Set<GraphNode["type"]>(["Endpoint", "Page", "Dashboard"]);
const PUBLIC_LAYERS = new Set(["api", "pages"]);

function publicReason(node: GraphNode, graph: Graph, ix: GraphIndex): string | null {
  if (node.type === "Test" || node.type === "Doc" || node.layer === "business") return null;
  if (node.type === "Endpoint" || node.layer === "api") return "an API endpoint";
  if (PUBLIC_TYPES.has(node.type) || PUBLIC_LAYERS.has(node.layer)) return "a page users open";
  if (publicFiles(graph, ix).has(node.file)) return `exported from the package (${node.file})`;
  return null;
}

// Names that usually hold personal data. Long words match anywhere in the name,
// short ones only as a whole word, so "adobe" is not a date of birth.
const PII_WORDS = ["email", "phone", "mobile", "passport", "address", "birth", "firstname", "lastname", "fullname", "surname", "password", "creditcard", "cardnumber", "iban", "salary", "nationalid", "taxid", "socialsecurity"];
const PII_SHORT = /(^|[^a-z])(ssn|dob)([^a-z]|$)/i;

function looksPersonal(node: GraphNode): boolean {
  const short = shortName(node.name);
  const flat = short.toLowerCase().replace(/[^a-z]/g, "");
  return PII_WORDS.some((w) => flat.includes(w)) || PII_SHORT.test(short.replace(/([a-z])([A-Z])/g, "$1_$2"));
}

// ---------------------------------------------------------------------------
// The analysis.
// ---------------------------------------------------------------------------

interface Hit {
  severity: Severity;
  confidence: Confidence;
  via?: GraphEdge;
  parent?: string;
}

/** Tarjan's strongly connected components, without recursion. Returns a component id per node, in reverse topological order. */
function components(nodes: string[], next: Map<string, string[]>): Map<string, number> {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const comp = new Map<string, number>();
  let counter = 0;
  let compCount = 0;
  for (const root of nodes) {
    if (index.has(root)) continue;
    const work: { id: string; i: number }[] = [{ id: root, i: 0 }];
    index.set(root, counter);
    low.set(root, counter++);
    stack.push(root);
    onStack.add(root);
    while (work.length) {
      const top = work[work.length - 1];
      const nbrs = next.get(top.id) ?? [];
      if (top.i < nbrs.length) {
        const w = nbrs[top.i++];
        if (!index.has(w)) {
          index.set(w, counter);
          low.set(w, counter++);
          stack.push(w);
          onStack.add(w);
          work.push({ id: w, i: 0 });
        } else if (onStack.has(w)) {
          low.set(top.id, Math.min(low.get(top.id)!, index.get(w)!));
        }
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1].id;
        low.set(parent, Math.min(low.get(parent)!, low.get(top.id)!));
      }
      if (low.get(top.id) === index.get(top.id)) {
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          comp.set(w, compCount);
        } while (w !== top.id);
        compCount++;
      }
    }
  }
  return comp;
}

export function computeImpact(graph: Graph, request: ChangeRequest): ImpactReport {
  const started = performance.now();
  const ix = fullIndex(graph);
  const { byId, out, children, coverageOut } = ix;
  const origin = byId.get(request.node);
  if (!origin) throw new Error(`Unknown node ${request.node}`);

  // A table or type changed as a whole (not renamed) carries its columns' and
  // fields' links: code that uses a column of a deleted table breaks too. A
  // renamed table does too, since code names the model to reach its columns.
  const wholeAsset = (origin.type === "Table" && request.change !== "type_change") || (origin.type === "TSType" && request.change !== "rename");

  // Edges leaving a node: its own, plus coverage edges of its asset.
  const edgesFrom = (n: GraphNode): GraphEdge[] => {
    const own = out.get(n.id) ?? [];
    if (n.id === origin.id && wholeAsset) return [...own, ...(children.get(n.id) ?? []).flatMap((c) => out.get(c.id) ?? [])];
    if (!n.parent) return own;
    const coverage = coverageOut.get(n.parent);
    return coverage ? [...own, ...coverage] : own;
  };

  // ---- 1. Ripple -----------------------------------------------------------
  // A node is updated only when it gets hit harder, or equally hard with more
  // certainty. Both only go up, so each node is updated at most 12 times.
  const hits = new Map<string, Hit>([[origin.id, { severity: "breaking", confidence: "high" }]]);
  const queue: string[] = [origin.id];
  const queued = new Set(queue);
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    queued.delete(id);
    const hit = hits.get(id)!;
    // Safe never leads to anything worse than safe: the ripple stops here.
    if (hit.severity === "safe") continue;
    const n = byId.get(id)!;
    for (const e of edgesFrom(n)) {
      if (e.to === origin.id) continue;
      const severity = severityFor(request, { severity: hit.severity, isOrigin: id === origin.id, type: n.type }, e);
      const confidence = weakest(hit.confidence, e.confidence);
      const prev = hits.get(e.to);
      const better =
        !prev ||
        SEVERITY_RANK[severity] > SEVERITY_RANK[prev.severity] ||
        (severity === prev.severity && CONF_RANK[confidence] > CONF_RANK[prev.confidence]);
      if (!better) continue;
      hits.set(e.to, { severity, confidence, via: e, parent: id });
      if (!queued.has(e.to)) {
        queued.add(e.to);
        queue.push(e.to);
      }
    }
  }

  // ---- 2. Order --------------------------------------------------------------
  // Affected links: from an affected node to an affected node, still not safe
  // with the final severities. A node waits for everything that reaches it.
  const affectedIds = [...hits.keys()].filter((id) => hits.get(id)!.severity !== "safe");
  const next = new Map<string, string[]>();
  const links = new Map<string, number>();
  for (const id of affectedIds) {
    const hit = hits.get(id)!;
    const n = byId.get(id)!;
    const seen = new Set<string>();
    for (const e of edgesFrom(n)) {
      const to = hits.get(e.to);
      if (!to || to.severity === "safe" || e.to === origin.id || seen.has(e.to)) continue;
      if (severityFor(request, { severity: hit.severity, isOrigin: id === origin.id, type: n.type }, e) === "safe") continue;
      seen.add(e.to);
      push(next, id, e.to);
      links.set(e.to, (links.get(e.to) ?? 0) + 1);
    }
  }
  const comp = components(affectedIds, next);
  // Tarjan numbers components sinks first; walk them sources first.
  const members = new Map<number, string[]>();
  for (const [id, c] of comp) push(members, c, id);
  const compDepth = new Map<number, number>([[comp.get(origin.id)!, 0]]);
  for (let c = members.size - 1; c >= 0; c--) {
    const d = compDepth.get(c) ?? 0;
    for (const id of members.get(c) ?? []) {
      for (const to of next.get(id) ?? []) {
        const tc = comp.get(to)!;
        if (tc !== c && (compDepth.get(tc) ?? -1) < d + 1) compDepth.set(tc, d + 1);
      }
    }
  }
  const depthOf = new Map<string, number>();
  for (const id of affectedIds) depthOf.set(id, compDepth.get(comp.get(id)!) ?? 0);
  // Safe nodes sit one step after the node that proved them safe.
  for (const [id, hit] of hits) if (hit.severity === "safe") depthOf.set(id, (depthOf.get(hit.parent!) ?? 0) + 1);

  const pathTo = (id: string): string[] => {
    const path: string[] = [];
    const seen = new Set<string>();
    for (let cur: string | undefined = id; cur && !seen.has(cur) && path.length < 60; cur = hits.get(cur)?.parent) {
      seen.add(cur);
      path.push(cur);
    }
    return path.reverse();
  };

  // ---- 3. Risk ---------------------------------------------------------------
  const tests = testInfo(graph, ix);
  const businessOf = (n: GraphNode): GraphNode[] => {
    const found: GraphNode[] = [];
    for (const id of new Set([n.id, assetOf(n)])) {
      for (const e of out.get(id) ?? []) {
        const t = byId.get(e.to);
        if (t && (e.type === "SUPPORTS" || t.layer === "business") && !found.includes(t)) found.push(t);
      }
    }
    return found;
  };

  const items = new Map<string, ImpactItem>();
  for (const [id, hit] of hits) {
    const n = byId.get(id)!;
    const asset = byId.get(assetOf(n)) ?? n;
    const severity = hit.severity;
    const factors: RiskFactor[] = [];
    const add = (label: string, points: number, detail: string) => {
      if (points > 0 || label === "Less certain") factors.push({ label, points: Math.round(points), detail });
    };
    const def = layerDef(graph, n.layer);
    const personal = n.pii || asset.pii;
    if (severity !== "safe") {
      const scale = { high: 1, medium: 0.8, low: 0.55 }[hit.confidence];
      if (n.layer === "business") add("Business impact", 24 * scale, "This business process runs on code the change touches. Agents do not edit it.");
      else if (severity === "breaking") add("Breaks", 32 * scale, id === origin.id ? "This is the part being changed." : "It stops compiling or gives wrong results unless it is edited.");
      else if (severity === "needs_update") add("Needs a check", 20 * scale, "It keeps working behind an alias or a pass-through, but should be checked.");
      else if (severity === "update") add("Tests or docs", 8 * scale, "A test or a doc names it and should be updated.");

      const reach = reachOf(ix, id);
      if (reach > 0) {
        const pts = (20 * Math.log2(1 + reach)) / Math.log2(1 + REACH_CAP);
        add("Many dependents", pts, reach === 1 ? "1 other component depends on it." : `${reach >= REACH_CAP ? `${REACH_CAP}+` : reach} other components depend on it, directly or not.`);
      }
      if (asset.criticality === "high") add("Marked critical", 12, `${asset.name} is marked as critical.`);
      const pub = publicReason(n, graph, ix);
      if (pub && severity !== "update") add("Public API", 12, `It is ${pub}, so code or people outside this repo may rely on it.`);
      if (personal) add("Personal data", 10, "It holds personal data.");
      else if (looksPersonal(n)) add("Personal data", 6, `The name "${shortName(n.name)}" suggests personal data.`);
      if (severity !== "update" && n.type !== "Test" && n.type !== "Doc" && n.layer !== "business") {
        const hop = tests.hops.get(asset.file);
        if (!tests.hasTests) add("No tests", 8, "The repo has no tests, so nothing will catch a mistake here.");
        else if (hop === undefined) add("No tests", 12, `No test reaches ${asset.file}, so a mistake here will not be caught.`);
        else if (hop > 1) add("Weak tests", 4, `Tests reach ${asset.file} only through ${hop} imports.`);
      }
      const biz = n.layer === "business" ? [n] : businessOf(n);
      if (biz.length) add("Business process", 8, `It supports ${biz.map((b) => b.name).join(", ")}.`);
      if (def?.requiresApproval) add("Shared contract", 6, `${def.label} is protected, so edits need approval.`);
      const l = links.get(id) ?? 0;
      if (l >= 3) add("Many links", 4, `${l} affected links reach it, so it can break in more than one place.`);
      if (hit.confidence !== "high") {
        add("Less certain", 0, hit.via?.source === "bob" ? "Found through a link IBM Bob inferred. Check it by hand." : `Found through a ${hit.confidence}-confidence link. Check it by hand.`);
      }
    }
    factors.sort((a, b) => b.points - a.points);
    items.set(id, {
      nodeId: id,
      severity,
      depth: depthOf.get(id) ?? 0,
      risk: Math.min(100, factors.reduce((s, f) => s + f.points, 0)),
      viaEdge: hit.via?.id,
      confidence: hit.confidence,
      needsApproval: severity !== "safe" && (Boolean(def?.requiresApproval) || personal),
      factors,
      path: pathTo(id),
      links: links.get(id) ?? (hit.parent ? 1 : 0),
    });
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
  const foundSet = new Set(found);
  const unitFiles = new Set(fixUnits.map((u) => u.file));
  const grep = {
    found,
    missed: [...unitFiles].filter((f) => !foundSet.has(f)),
    falsePositives: found.filter((f) => !unitFiles.has(f)),
  };

  const sorted = [...items.values()].sort((a, b) => a.depth - b.depth || b.risk - a.risk || a.nodeId.localeCompare(b.nodeId));
  const levels: string[][] = [];
  for (const item of sorted) (levels[item.depth] ??= []).push(item.nodeId);

  const danglingRefs = sorted.filter((i) => i.severity === "breaking" || i.severity === "needs_update").length;

  const report: ImpactReport = {
    request,
    oldName,
    items: sorted,
    fixUnits,
    waveCount: depths.length,
    business,
    grep,
    levels: levels.map((l) => l ?? []),
    danglingRefs,
    computedMs: 0,
  };
  report.risk = assessRisk(graph, report, tests);
  report.computedMs = Math.max(1, Math.round(performance.now() - started));
  return report;
}

// ---------------------------------------------------------------------------
// The risk of the whole change.
// ---------------------------------------------------------------------------

const LEVELS: [number, RiskLevel][] = [
  [70, "critical"],
  [50, "high"],
  [25, "medium"],
  [0, "low"],
];

function list(names: string[], max = 3) {
  const shown = names.slice(0, max).map((n) => `\`${n}\``);
  return names.length > max ? `${shown.join(", ")} and ${names.length - max} more` : shown.join(", ");
}

function assessRisk(graph: Graph, report: ImpactReport, tests: TestInfo): RiskAssessment {
  const { byId } = fullIndex(graph);
  const affected = report.items.filter((i) => i.severity !== "safe");
  const name = (id: string) => byId.get(id)?.name ?? id;
  const byRisk = [...affected].sort((a, b) => b.risk - a.risk);

  // The worst few components, how widely the change spreads, and what it touches.
  const top = byRisk.slice(0, 3);
  const worst = top.length ? top.reduce((s, i) => s + i.risk, 0) / top.length : 0;
  const files = report.fixUnits.length;
  const breadth = Math.min(1, Math.log2(1 + files) / Math.log2(1 + 40));
  const codeUnits = report.fixUnits.filter((u) => {
    const n = byId.get(u.assets[0]);
    return n && n.type !== "Test" && n.type !== "Doc";
  });
  const untested = codeUnits.filter((u) => !tests.hops.has(u.file));
  const untestedShare = codeUnits.length ? untested.length / codeUnits.length : 0;
  const has = (label: string) => affected.filter((i) => i.factors?.some((f) => f.label === label));
  const publicHits = has("Public API").filter((i) => i.severity === "breaking");
  const personal = has("Personal data");
  const bizHit = report.business.filter((b) => b.severity !== "safe");
  const exposure = Math.min(15, (publicHits.length ? 7 : 0) + (personal.length ? 4 : 0) + (bizHit.length ? 4 : 0));
  const score = affected.length <= 1 && files <= 1 ? Math.round(Math.min(worst, 30) * 0.6) : Math.min(100, Math.round(0.55 * worst + 20 * breadth + (tests.hasTests ? 10 : 6) * untestedShare + exposure));
  const level = LEVELS.find(([min]) => score >= min)![1];

  // Drivers: every factor label across the affected components, strongest and most common first.
  const agg = new Map<string, { points: number; ids: string[] }>();
  for (const i of affected) {
    for (const f of i.factors ?? []) {
      if (f.points <= 0 || f.label === "Breaks" || f.label === "Needs a check" || f.label === "Tests or docs" || f.label === "Business impact") continue;
      const a = agg.get(f.label) ?? { points: 0, ids: [] };
      a.points = Math.max(a.points, f.points);
      a.ids.push(i.nodeId);
      agg.set(f.label, a);
    }
  }
  const drivers: RiskFactor[] = [
    {
      label: "Spread",
      points: Math.round(20 * breadth),
      detail: `${affected.length} components in ${files} ${files === 1 ? "file" : "files"}, fixed in ${report.waveCount} ${report.waveCount === 1 ? "wave" : "waves"}.`,
    },
    ...[...agg.entries()].map(([label, a]) => ({
      label,
      points: Math.round(a.points * Math.sqrt(a.ids.length)),
      detail: `${a.ids.length} affected ${a.ids.length === 1 ? "component" : "components"}: ${list(a.ids.map(name))}.`,
    })),
  ]
    .filter((d) => d.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 5);

  // Recommendations, most important first.
  const recs: string[] = [];
  const kind = report.request.change;
  const old = report.oldName;
  if (publicHits.length) {
    const who = list(publicHits.map((i) => name(i.nodeId)));
    if (kind === "rename") recs.push(`Keep \`${old}\` working as a deprecated alias for one release. It reaches the public API: ${who}.`);
    else if (kind === "delete") recs.push(`Deprecate first and remove in a later release. It reaches the public API: ${who}.`);
    else recs.push(`Support the old and the new shape side by side for a while, or version the API. It reaches the public API: ${who}.`);
  }
  if (tests.hasTests && untested.length) recs.push(`Add tests for ${list(untested.map((u) => u.file))} before merging. No test reaches ${untested.length === 1 ? "it" : "them"} today.`);
  else if (!tests.hasTests && codeUnits.length) recs.push(`This repo has no tests. Check the ${codeUnits.length} changed ${codeUnits.length === 1 ? "file" : "files"} by hand, or add a smoke test first.`);
  const approvals = report.fixUnits.filter((u) => u.needsApproval);
  if (approvals.length) {
    const layers = [...new Set(approvals.map((u) => layerLabel(graph, u.layer)))];
    recs.push(`Get sign-off from the owners of ${layers.join(", ")}: ${approvals.length} ${approvals.length === 1 ? "file needs" : "files need"} approval.`);
  }
  if (personal.length) recs.push(`Personal data is involved (${list(personal.map((i) => name(i.nodeId)))}). Ask for a privacy review.`);
  if (bizHit.length) recs.push(`Tell the owners of the business processes it touches: ${bizHit.map((b) => (b.owner ? `${b.name} (${b.owner})` : b.name)).join(", ")}.`);
  // Tests and docs found through a weak link are cheap to get wrong; code is not.
  const unsure = affected.filter((i) => i.confidence !== "high" && i.severity !== "update");
  if (unsure.length) recs.push(`${unsure.length} ${unsure.length === 1 ? "component was" : "components were"} found through less certain links: ${list(unsure.map((i) => name(i.nodeId)))}. Check ${unsure.length === 1 ? "it" : "them"} by hand.`);
  if (report.waveCount > 1) recs.push(`Ship it in ${report.waveCount} waves, upstream first, so the code compiles after every step.`);
  if (report.grep.missed.length || report.grep.falsePositives.length) {
    const parts = [
      report.grep.missed.length ? `miss ${report.grep.missed.length} ${report.grep.missed.length === 1 ? "file" : "files"}` : "",
      report.grep.falsePositives.length ? `wrongly edit ${report.grep.falsePositives.length} ${report.grep.falsePositives.length === 1 ? "file" : "files"}` : "",
    ].filter(Boolean);
    if (kind === "rename") recs.push(`Do not use find-and-replace: it would ${parts.join(" and ")}. Use the agent or the compiler's rename.`);
  }
  if (!recs.length) recs.push("Low risk: the change stays in a few well-covered files. Run the checks and ship it.");

  const confidence: Record<Confidence, number> = { high: 0, medium: 0, low: 0 };
  for (const i of affected) confidence[i.confidence]++;

  return {
    score,
    level,
    drivers,
    recommendations: recs,
    confidence,
    coverage: { tested: codeUnits.length - untested.length, untested: untested.length, known: tests.hasTests },
    hotspots: byRisk.slice(0, 5).map((i) => i.nodeId),
  };
}
