// IBM Bob Cartographer (PRD section 7, pass 3): after the parser scan, Bob reads
// the repo and adds the links the TypeScript compiler cannot see, such as
// fetch("/api/...") calls to route handlers, string keys, config and docs. It
// also flags fields that hold personal data.
//
// Bob only proposes. Every link is checked: both ends must be nodes the parser
// already found, the edge type and rule must be known, and parser links win.
// Accepted links get source "bob" and medium or low confidence, which the city,
// graph and impact report already show as "Found by Bob".

import "server-only";
import { promises as fs } from "node:fs";
import { extractJson, runBob } from "@/lib/server/bob";
import type { EdgeRule, EdgeType, Graph, GraphEdge } from "@/lib/types";

const EDGE_TYPES: EdgeType[] = ["DERIVES_FROM", "READS", "WRITES", "MAPS_TO", "SERIALIZES", "RETURNS", "CONSUMES", "TYPED_AS", "IMPORTS", "CALLS", "TESTS", "DOCUMENTS", "SUPPORTS"];
const RULES: EdgeRule[] = ["rename_ref", "keep_alias", "update_type", "update_doc", "passthrough"];
const MAX_LINKS = 60;
const MAX_CATALOG = 2500;

export interface CartographerResult {
  status: "done" | "skipped";
  reason?: string;
  links: number;
  pii: number;
  bobcoins?: number;
}

/** Reads graphFile, asks Bob for extra links, writes the file back. Never throws. */
export async function enrichWithBob(repoDir: string, graphFile: string): Promise<CartographerResult> {
  let graph: Graph;
  try {
    graph = JSON.parse(await fs.readFile(graphFile, "utf8")) as Graph;
  } catch {
    return { status: "skipped", reason: "Could not read the graph", links: 0, pii: 0 };
  }

  // Business nodes are read-only and come from the README; keep them out.
  const candidates = graph.nodes.filter((n) => n.layer !== "business");
  const catalog = candidates.slice(0, MAX_CATALOG).map((n) => `${n.id} | ${n.type} | ${n.file}${n.line ? `:${n.line}` : ""}`);
  const task = `# SystemDNA Cartographer task

You are the Cartographer agent of SystemDNA. A parser already built a knowledge graph of this repository from the TypeScript compiler. Find the dependency links the parser CANNOT see.

Look for, for example:
- a component or page that calls an API route with fetch("/api/...") or axios, linked to that route's handler
- string keys, dynamic property access (obj[key]) or JSON/config files that use a field by name
- docs, tests or scripts that depend on a field or function without importing it
- environment variables or config values shared between files

Rules:
- Do NOT edit, create or delete any file. Only read.
- Use ONLY node ids from the catalog below, exactly as written.
- "from" is the upstream node; "to" depends on it (if "from" changes, "to" may break).
- Do not repeat links that a normal import or type reference already gives.
- Also list nodes that hold personal data (names, emails, phone numbers, addresses, IDs of people).
- At most ${MAX_LINKS} links. Evidence must be "path:line" plus a few words.

Reply with ONLY this JSON, no other text:
{"links": [{"from": "node id", "to": "node id", "type": "CALLS|READS|CONSUMES|DOCUMENTS|TESTS|SERIALIZES|MAPS_TO", "rule": "rename_ref|update_doc|passthrough", "confidence": "medium|low", "evidence": "path:line what you saw"}], "pii": [{"node": "node id", "reason": "short reason"}]}

## Node catalog (id | type | file)${candidates.length > MAX_CATALOG ? ` (first ${MAX_CATALOG} of ${candidates.length})` : ""}

${catalog.join("\n")}
`;

  const result = await runBob(repoDir, task);
  if (!result.ok) return { status: "skipped", reason: result.error ?? "Bob did not finish", links: 0, pii: 0 };
  const parsed = extractJson<{
    links?: { from?: string; to?: string; type?: string; rule?: string; confidence?: string; evidence?: string }[];
    pii?: { node?: string; reason?: string }[];
  }>(result.lastMessage);
  if (!parsed) return { status: "skipped", reason: "Bob's answer was not valid JSON", links: 0, pii: 0, bobcoins: result.bobcoins };

  const ids = new Set(candidates.map((n) => n.id));
  const existing = new Set(graph.edges.map((e) => `${e.from}->${e.to}`));
  const added: GraphEdge[] = [];
  for (const l of parsed.links ?? []) {
    if (added.length >= MAX_LINKS) break;
    const from = String(l?.from ?? "");
    const to = String(l?.to ?? "");
    if (!ids.has(from) || !ids.has(to) || from === to) continue;
    const key = `${from}->${to}`;
    if (existing.has(key)) continue;
    existing.add(key);
    added.push({
      id: `bob${added.length + 1}`,
      from,
      to,
      type: EDGE_TYPES.includes(l.type as EdgeType) ? (l.type as EdgeType) : "CONSUMES",
      rule: RULES.includes(l.rule as EdgeRule) ? (l.rule as EdgeRule) : "rename_ref",
      source: "bob",
      confidence: l.confidence === "low" ? "low" : "medium",
      evidence: String(l.evidence ?? "Found by Bob").slice(0, 200),
    });
  }

  let pii = 0;
  const piiIds = new Set((parsed.pii ?? []).map((p) => String(p?.node ?? "")).filter((id) => ids.has(id)));
  for (const n of graph.nodes) {
    if (piiIds.has(n.id) && !n.pii) {
      n.pii = true;
      pii += 1;
    }
  }

  graph.edges.push(...added);
  try {
    await fs.writeFile(graphFile, JSON.stringify(graph));
  } catch {
    return { status: "skipped", reason: "Could not save the enriched graph", links: 0, pii: 0, bobcoins: result.bobcoins };
  }
  return { status: "done", links: added.length, pii, bobcoins: result.bobcoins };
}
