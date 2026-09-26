// Ingestion: get a repo's code, scan it, save the knowledge graph.
//
//   1. Fetch    git clone (public URL) or unzip (upload) into a temp folder
//   2. Check    size and file-count limits
//   3. Scan     run core/scanner/ts-scan.mjs in its own process (it only reads files)
//   4. Save     graph.json + index entry (repo-store)
//   5. Clean    delete the temp folder, always
//
// Safety rules:
//   - We never install packages or run any code from the repo.
//   - git runs without a shell, with a timeout, no prompts, no submodules, https only.
//   - Zip entries that try to escape the folder ("../") are refused.

import "server-only";
import { spawn } from "node:child_process";
import { promises as fs, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { makeRepoId, saveRepo, type RepoEntry, type RepoStats } from "@/lib/server/repo-store";
import type { IngestEvent } from "@/lib/types";

type Emit = (e: IngestEvent) => void;

export const LIMITS = {
  zipBytes: 50 * 1024 * 1024,
  repoBytes: 300 * 1024 * 1024,
  repoFiles: 40_000,
  cloneMs: 120_000,
  scanMs: 240_000,
  concurrent: 2,
};

const GIT_URL = /^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/[\w.-]+\/[\w.-]+?(\.git)?\/?$/;
const GIT_REF = /^(?!-)[\w./-]{1,100}$/;

let running = 0;

export function validateGitInput(url: string, ref?: string): string | null {
  if (!GIT_URL.test(url)) return "Use a public https URL from github.com, gitlab.com or bitbucket.org, like https://github.com/owner/repo.";
  if (ref && !GIT_REF.test(ref)) return "The branch name has characters we do not accept.";
  return null;
}

function scannerPath() {
  return process.env.SYSTEMDNA_SCANNER || path.resolve(/*turbopackIgnore: true*/ process.cwd(), "../core/scanner/ts-scan.mjs");
}

/** Runs a command without a shell. Rejects on non-zero exit or timeout. */
export function run(cmd: string, args: string[], opts: { cwd?: string; timeoutMs: number; onLine?: (line: string) => void; onChunk?: (text: string) => void; env?: Record<string, string> }) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, shell: false, windowsHide: true });
    let stderr = "";
    let buffer = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${path.basename(cmd)} took longer than ${Math.round(opts.timeoutMs / 1000)} seconds`));
    }, opts.timeoutMs);
    child.stdout.on("data", (d: Buffer) => {
      opts.onChunk?.(d.toString());
      buffer += d.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) opts.onLine?.(l);
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-4000);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (buffer.trim()) opts.onLine?.(buffer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().split("\n").filter((l) => !/NODE_TLS_REJECT_UNAUTHORIZED|trace-warnings/.test(l)).slice(-3).join(" ") || `${path.basename(cmd)} failed (exit ${code})`));
    });
  });
}

async function measure(dir: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  const walk = async (d: string) => {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      if (e.name === ".git" || e.name === "node_modules" || e.isSymbolicLink()) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else {
        files += 1;
        bytes += (await fs.stat(p)).size;
      }
      if (files > LIMITS.repoFiles || bytes > LIMITS.repoBytes) return;
    }
  };
  await walk(dir);
  return { files, bytes };
}

/** Unzips into dir. Drops a single top folder (GitHub zips have "repo-main/"). */
async function unzipTo(data: Uint8Array, dir: string) {
  const entries = unzipSync(data, {
    filter: (f) => !f.name.endsWith("/") && !f.name.split("/").includes("node_modules") && !f.name.split("/").includes(".git"),
  });
  const names = Object.keys(entries);
  if (names.length === 0) throw new Error("The zip file is empty.");
  if (names.length > LIMITS.repoFiles) throw new Error(`The zip has more than ${LIMITS.repoFiles} files.`);
  const first = names[0].split("/")[0];
  const strip = names.every((n) => n.startsWith(`${first}/`)) ? `${first}/` : "";
  const root = path.resolve(dir);
  for (const name of names) {
    const relName = name.slice(strip.length);
    if (!relName) continue;
    const target = path.resolve(root, relName);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`Refused an unsafe path in the zip: ${name}`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, entries[name]);
  }
}

async function scanAndSave(dir: string, meta: Omit<RepoEntry, "id" | "scannedAt" | "stats">, emit: Emit, existingId?: string) {
  const scanStart = Date.now();
  const size = await measure(dir);
  if (size.files > LIMITS.repoFiles) throw new Error(`The repo has more than ${LIMITS.repoFiles} files. Try a smaller repo or a sub-folder.`);
  if (size.bytes > LIMITS.repoBytes) throw new Error(`The repo is larger than ${LIMITS.repoBytes / 1024 / 1024} MB.`);
  emit({ type: "progress", step: "checked", detail: `${size.files} files, ${(size.bytes / 1024 / 1024).toFixed(1)} MB` });

  const scanner = scannerPath();
  if (!existsSync(scanner)) throw new Error(`Scanner not found at ${scanner}. Set SYSTEMDNA_SCANNER.`);
  if (!existsSync(path.join(/*turbopackIgnore: true*/ path.dirname(scanner), "node_modules", "typescript"))) {
    throw new Error("The scanner's packages are not installed. Run npm install in core/scanner.");
  }
  const out = path.join(/*turbopackIgnore: true*/ dir, "..", "graph.json");
  let stats: RepoStats | null = null;
  await run(process.execPath, [scanner, dir, out, "--repo-name", meta.name, "--progress"], {
    timeoutMs: LIMITS.scanMs,
    env: { NODE_OPTIONS: "--max-old-space-size=2048" },
    onLine: (line) => {
      try {
        const msg = JSON.parse(line) as { step: string; detail: string; ms?: number; stats?: RepoStats };
        if (msg.stats) stats = msg.stats;
        emit({ type: "progress", step: msg.step, detail: msg.detail, ms: msg.ms });
      } catch {
        // Not a progress line.
      }
    },
  });
  if (!stats) throw new Error("The scanner finished without a result.");
  const entry: RepoEntry = { ...meta, id: existingId ?? makeRepoId(meta.name), scannedAt: new Date().toISOString(), stats };
  await saveRepo(entry, out, Date.now() - scanStart);
  emit({ type: "progress", step: "saved", detail: "Saved the knowledge graph" });
  return entry;
}

export async function withWorkspace<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  if (running >= LIMITS.concurrent) throw new Error("Two repositories are already being scanned. Try again in a minute.");
  running += 1;
  const base = await fs.mkdtemp(path.join(/*turbopackIgnore: true*/ os.tmpdir(), "systemdna-"));
  try {
    const dir = path.join(base, "repo");
    await fs.mkdir(dir);
    return await fn(dir);
  } finally {
    running -= 1;
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
}

export async function ingestGit(url: string, ref: string | undefined, emit: Emit, existingId?: string) {
  const bad = validateGitInput(url, ref);
  if (bad) throw new Error(bad);
  const name = url.replace(/^https:\/\/[^/]+\//, "").replace(/\.git\/?$|\/$/g, "");
  return withWorkspace(async (dir) => {
    emit({ type: "progress", step: "fetch", detail: `Cloning ${name}${ref ? ` (${ref})` : ""}` });
    const args = ["-c", "protocol.file.allow=never", "-c", "core.symlinks=false", "clone", "--depth", "1", "--single-branch", "--no-tags", "--quiet"];
    if (ref) args.push("--branch", ref);
    args.push("--", url, dir);
    await run("git", args, { timeoutMs: LIMITS.cloneMs, env: { GIT_TERMINAL_PROMPT: "0", GIT_LFS_SKIP_SMUDGE: "1" } }).catch((err: Error) => {
      throw new Error(/not found|Repository not found|could not read Username/i.test(err.message) ? "We could not read that repository. Check the URL and that the repo is public." : err.message);
    });
    emit({ type: "progress", step: "fetched", detail: "Code downloaded" });
    return scanAndSave(dir, { name, source: "git", url, ref: ref || undefined }, emit, existingId);
  });
}

export async function ingestZip(file: File, emit: Emit) {
  if (file.size > LIMITS.zipBytes) throw new Error(`The zip is larger than ${LIMITS.zipBytes / 1024 / 1024} MB.`);
  const name = file.name.replace(/\.zip$/i, "").replace(/-(main|master)$/, "") || "upload";
  return withWorkspace(async (dir) => {
    emit({ type: "progress", step: "fetch", detail: `Unpacking ${file.name}` });
    await unzipTo(new Uint8Array(await file.arrayBuffer()), dir);
    emit({ type: "progress", step: "fetched", detail: "Files unpacked" });
    return scanAndSave(dir, { name, source: "zip" }, emit);
  });
}

/** Wraps an ingestion in a newline-delimited JSON stream for the browser. */
export function ndjsonStream(work: (emit: Emit) => Promise<RepoEntry>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: Emit = (e) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        const repo = await work(emit);
        emit({ type: "done", repo });
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : "Something went wrong" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
