// Knowledge graph store.
//
// Local: JSON files under web/.data/repos/<id>/
//   index.json          — list of all connected repos (RepoEntry[])
//   <id>/graph.json     — the knowledge graph produced by ts-scan.mjs
//   <id>/history.json   — scan history (ScanRecord[])
//
// AWS swap (PRD section 6, F60):
//   Replace the three read/write helpers at the bottom of this file with:
//     readIndex   → DynamoDB: GetItem pk="index" / Scan table
//     writeIndex  → DynamoDB: PutItem pk="index"
//     readGraph   → S3: GetObject  key="repos/<id>/graph.json"
//     writeGraph  → S3: PutObject  key="repos/<id>/graph.json" (versioning on)
//   Everything else stays identical.
//
// All callers import only the named functions below. Nothing else leaks.

import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ConnectedRepo, Graph, RepoStats } from "@/lib/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type RepoEntry = ConnectedRepo;
export type { RepoStats };

/** One entry in a repo's scan history. */
export interface ScanRecord {
  scannedAt: string;
  stats: RepoStats;
  /** "git" clone or "zip" upload. */
  source: "git" | "zip";
  /** ms the scan took end-to-end. */
  durationMs: number;
}

/** Full metadata for one repo, including its scan history. */
export interface RepoDetail extends RepoEntry {
  history: ScanRecord[];
}

// ---------------------------------------------------------------------------
// Storage paths (local)
// ---------------------------------------------------------------------------

const DATA_DIR = process.env.SYSTEMDNA_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), ".data");
const REPOS_DIR = path.join(DATA_DIR, "repos");
const INDEX = path.join(REPOS_DIR, "index.json");

/** Only ids we made ourselves are ever turned into file paths. */
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,80}$/;

function repoDir(id: string) {
  return path.join(REPOS_DIR, id);
}

function graphPath(id: string) {
  return path.join(repoDir(id), "graph.json");
}

function historyPath(id: string) {
  return path.join(repoDir(id), "history.json");
}

// ---------------------------------------------------------------------------
// Low-level read / write  (swap these for DynamoDB + S3 for AWS)
// ---------------------------------------------------------------------------

async function readIndex(): Promise<RepoEntry[]> {
  try {
    return JSON.parse(await fs.readFile(INDEX, "utf8")) as RepoEntry[];
  } catch {
    return [];
  }
}

async function writeIndex(entries: RepoEntry[]) {
  await fs.mkdir(REPOS_DIR, { recursive: true });
  const tmp = `${INDEX}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(entries, null, 2));
  await fs.rename(tmp, INDEX);
}

async function readGraph(id: string): Promise<Graph | null> {
  try {
    return JSON.parse(await fs.readFile(graphPath(id), "utf8")) as Graph;
  } catch {
    return null;
  }
}

async function writeGraph(id: string, graphFile: string) {
  await fs.mkdir(repoDir(id), { recursive: true });
  await fs.copyFile(graphFile, graphPath(id));
}

async function readHistory(id: string): Promise<ScanRecord[]> {
  try {
    return JSON.parse(await fs.readFile(historyPath(id), "utf8")) as ScanRecord[];
  } catch {
    return [];
  }
}

async function appendHistory(id: string, record: ScanRecord) {
  const history = await readHistory(id);
  // Keep last 20 scan records.
  const next = [record, ...history].slice(0, 20);
  await fs.writeFile(historyPath(id), JSON.stringify(next, null, 2));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** All connected repos, newest first. */
export async function listRepos(): Promise<RepoEntry[]> {
  return (await readIndex()).sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
}

/** One repo entry + its graph, or null if not found. */
export async function getRepo(id: string): Promise<{ entry: RepoEntry; graph: Graph } | null> {
  if (!SAFE_ID.test(id)) return null;
  const entry = (await readIndex()).find((e) => e.id === id);
  if (!entry) return null;
  const graph = await readGraph(id);
  if (!graph) return null;
  return { entry, graph };
}

/** One repo entry + its graph + its scan history. */
export async function getRepoDetail(id: string): Promise<RepoDetail | null> {
  if (!SAFE_ID.test(id)) return null;
  const entry = (await readIndex()).find((e) => e.id === id);
  if (!entry) return null;
  return { ...entry, history: await readHistory(id) };
}

/**
 * Look up a single node across the graph by its id.
 * Returns null if the repo or node is not found.
 */
export async function getNode(repoId: string, nodeId: string) {
  const result = await getRepo(repoId);
  if (!result) return null;
  return result.graph.nodes.find((n) => n.id === nodeId) ?? null;
}

/**
 * All edges that point to or from a given node id.
 * direction = "out" → edges where from === nodeId (downstream)
 * direction = "in"  → edges where to   === nodeId (upstream)
 * direction = "all" → both
 */
export async function getEdges(
  repoId: string,
  nodeId: string,
  direction: "in" | "out" | "all" = "all",
) {
  const result = await getRepo(repoId);
  if (!result) return null;
  const { edges } = result.graph;
  if (direction === "out") return edges.filter((e) => e.from === nodeId);
  if (direction === "in") return edges.filter((e) => e.to === nodeId);
  return edges.filter((e) => e.from === nodeId || e.to === nodeId);
}

/**
 * Save a freshly-scanned graph.
 * Writes the graph file, updates the index, and appends a scan history record.
 */
export async function saveRepo(
  entry: RepoEntry,
  graphFile: string,
  durationMs = 0,
) {
  if (!SAFE_ID.test(entry.id)) throw new Error("Bad repository id");
  await writeGraph(entry.id, graphFile);
  const entries = (await readIndex()).filter((e) => e.id !== entry.id);
  await writeIndex([entry, ...entries]);
  await appendHistory(entry.id, {
    scannedAt: entry.scannedAt,
    stats: entry.stats,
    source: entry.source,
    durationMs,
  });
}

/** Remove a repo and all its data. Returns false if it did not exist. */
export async function deleteRepo(id: string): Promise<boolean> {
  if (!SAFE_ID.test(id)) return false;
  const entries = await readIndex();
  if (!entries.some((e) => e.id === id)) return false;
  await writeIndex(entries.filter((e) => e.id !== id));
  await fs.rm(repoDir(id), { recursive: true, force: true });
  return true;
}

/** A readable, unique id: "owner-repo-3f9a". */
export function makeRepoId(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "repo";
  return `${slug}-${Math.random().toString(16).slice(2, 6)}`;
}

/**
 * Graph summary — lightweight stats without loading every node.
 * Safe to call in list views.
 */
export async function getGraphSummary(id: string): Promise<{
  nodeCount: number;
  edgeCount: number;
  layerIds: string[];
  bobEdges: number;
  piiNodes: number;
} | null> {
  const result = await getRepo(id);
  if (!result) return null;
  const { graph } = result;
  return {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    layerIds: graph.layers.map((l) => l.id),
    bobEdges: graph.edges.filter((e) => e.source === "bob").length,
    piiNodes: graph.nodes.filter((n) => n.pii).length,
  };
}
