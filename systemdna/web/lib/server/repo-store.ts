// repo-store.ts — kept for backward compatibility.
// All new code should import graph functions from "@/lib/server/graph-store" directly.
// Patches from real change runs live here (see below).

import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

export {
  listRepos,
  getRepo,
  getRepoDetail,
  getNode,
  getEdges,
  saveRepo,
  deleteRepo,
  makeRepoId,
  getGraphSummary,
  type RepoEntry,
  type RepoStats,
  type ScanRecord,
  type RepoDetail,
} from "@/lib/server/graph-store";

// ---------------------------------------------------------------------------
// Patches from real change runs. The PR is opened from the stored patch, so it
// is exactly the diff the user previewed, and no agent runs twice.
// Local: web/.data/patches/<id>.json (git-ignored). AWS: an S3 prefix.
// ---------------------------------------------------------------------------

const DATA_DIR = process.env.SYSTEMDNA_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), ".data");
const PATCH_DIR = path.join(DATA_DIR, "patches");
const PATCH_ID = /^[a-z0-9-]{8,80}$/;

export interface StoredPatch {
  url: string;
  ref?: string;
  changeId: string;
  title: string;
  summary: string;
  patch: string;
  createdAt: string;
}

export async function savePatch(p: StoredPatch): Promise<string> {
  await fs.mkdir(PATCH_DIR, { recursive: true });
  const id = `${p.changeId.toLowerCase().replace(/[^a-z0-9-]/g, "")}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
  await fs.writeFile(path.join(PATCH_DIR, `${id}.json`), JSON.stringify(p));
  return id;
}

export async function loadPatch(id: string): Promise<StoredPatch | null> {
  if (!PATCH_ID.test(id)) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(PATCH_DIR, `${id}.json`), "utf8")) as StoredPatch;
  } catch {
    return null;
  }
}
