// Where connected repositories and their graphs are kept.
//
// Local development: files under web/.data/repos (git-ignored).
// Production (PRD section 6): swap this module for S3 (graph.json) + DynamoDB (index).
// Everything else calls only these functions, so the swap stays in one file.

import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ConnectedRepo, Graph, RepoStats } from "@/lib/types";

export type RepoEntry = ConnectedRepo;
export type { RepoStats };

const DATA_DIR = process.env.SYSTEMDNA_DATA_DIR ?? path.join(process.cwd(), ".data");
const REPOS_DIR = path.join(DATA_DIR, "repos");
const INDEX = path.join(REPOS_DIR, "index.json");

/** Only ids we made ourselves are ever turned into paths. */
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,80}$/;

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

export async function listRepos(): Promise<RepoEntry[]> {
  return (await readIndex()).sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
}

export async function getRepo(id: string): Promise<{ entry: RepoEntry; graph: Graph } | null> {
  if (!SAFE_ID.test(id)) return null;
  const entry = (await readIndex()).find((e) => e.id === id);
  if (!entry) return null;
  try {
    const graph = JSON.parse(await fs.readFile(path.join(REPOS_DIR, id, "graph.json"), "utf8")) as Graph;
    return { entry, graph };
  } catch {
    return null;
  }
}

export async function saveRepo(entry: RepoEntry, graphFile: string) {
  if (!SAFE_ID.test(entry.id)) throw new Error("Bad repository id");
  const dir = path.join(REPOS_DIR, entry.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.copyFile(graphFile, path.join(dir, "graph.json"));
  const entries = (await readIndex()).filter((e) => e.id !== entry.id);
  await writeIndex([entry, ...entries]);
}

export async function deleteRepo(id: string): Promise<boolean> {
  if (!SAFE_ID.test(id)) return false;
  const entries = await readIndex();
  if (!entries.some((e) => e.id === id)) return false;
  await writeIndex(entries.filter((e) => e.id !== id));
  await fs.rm(path.join(REPOS_DIR, id), { recursive: true, force: true });
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
