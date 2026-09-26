// IBM Bob Shell client: runs Bob headless (`bob run --format json`) for the
// server-side agents.
//
//   - Inspector    (github-agent.ts) reviews the compiler's rename diff
//   - Cartographer (ingest.ts)       adds links the parser cannot see
//
// The API key comes only from the server environment (BOB_API_KEY, or the older
// BOBSHELL_API_KEY). It is handed to the `bob` process through its environment,
// never put in an argument, a file or a log line, and scrubbed from errors.
//
// Every caller treats Bob as optional: if Bob is not installed, has no key, or
// fails, the caller reports "skipped" and carries on exactly as before.

import "server-only";
import { spawn } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import type { BobStatus } from "@/lib/types";

/** Written into the workspace; the prompt points Bob at it (no shell quoting of task text). */
export const TASK_FILE = ".systemdna-bob-task.md";
const PROMPT = `Read the file ${TASK_FILE} in the current folder and follow it exactly. Reply with only the JSON it asks for.`;

export const BOB_DEFAULTS = {
  timeoutMs: Number(process.env.BOB_TIMEOUT_MS) || 240_000,
  maxCost: Number(process.env.BOB_MAX_COST) || 3,
  maxTurns: Number(process.env.BOB_MAX_TURNS) || 20,
};

export function bobKey() {
  return (process.env.BOB_API_KEY || process.env.BOBSHELL_API_KEY || "").trim();
}

/** Never let the key reach a message. */
export function scrubBob(message: string) {
  const k = bobKey();
  return k ? message.split(k).join("***") : message;
}

/** BOB_CLI, or `bob` on the PATH. */
function findCli(): string | null {
  const explicit = process.env.BOB_CLI?.trim();
  if (explicit) return existsSync(explicit) ? explicit : null;
  const names = process.platform === "win32" ? ["bob.exe", "bob.cmd", "bob.bat"] : ["bob"];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    for (const n of names) {
      const p = path.join(/*turbopackIgnore: true*/ dir, n);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/**
 * Spawns Bob without a shell. On Windows a .cmd shim needs cmd.exe; every
 * argument we pass is a fixed string (the task text lives in TASK_FILE), so the
 * command line never contains user input.
 */
function spawnBob(cli: string, args: string[], opts: { cwd?: string; timeoutMs: number }) {
  return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    const env = { ...process.env, BOB_API_KEY: bobKey(), BOBSHELL_API_KEY: bobKey(), NO_COLOR: "1" };
    const isShim = process.platform === "win32" && /\.(cmd|bat)$/i.test(cli);
    // stdin must be closed: bob reads piped stdin as extra prompt and waits for EOF.
    const stdio: ["ignore", "pipe", "pipe"] = ["ignore", "pipe", "pipe"];
    const child = isShim
      ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `"${[cli, ...args].map((a) => `"${a}"`).join(" ")}"`], {
          cwd: opts.cwd,
          env,
          stdio,
          windowsHide: true,
          windowsVerbatimArguments: true,
        })
      : spawn(cli, args, { cwd: opts.cwd, env, stdio, shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      // On Windows, killing cmd.exe leaves bob running; kill the whole tree.
      if (process.platform === "win32" && child.pid) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
      else child.kill("SIGKILL");
      reject(new Error(`Bob took longer than ${Math.round(opts.timeoutMs / 1000)} seconds`));
    }, opts.timeoutMs);
    child.stdout.on("data", (d: Buffer) => {
      stdout = (stdout + d.toString()).slice(-2_000_000);
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-4000);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(scrubBob(err.message)));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: scrubBob(stderr), code });
    });
  });
}

let statusCache: { at: number; value: BobStatus } | null = null;

/** Is Bob usable on this server? Never returns the key. Cached for a minute. */
export async function bobStatus(): Promise<BobStatus> {
  if (statusCache && Date.now() - statusCache.at < 60_000) return statusCache.value;
  const configured = Boolean(bobKey());
  const cli = findCli();
  let value: BobStatus;
  if (!cli) {
    value = { configured, cli: false, ready: false, reason: "Bob Shell is not installed on the server (bob not on PATH; set BOB_CLI to its path)." };
  } else {
    let version: string | undefined;
    try {
      const out = await spawnBob(cli, ["--version"], { timeoutMs: 20_000 });
      // Prints "2.0.5" then "commit: <sha>".
      version = out.stdout.trim().split("\n")[0]?.trim() || undefined;
    } catch {
      // The CLI exists; a failed version check is not fatal.
    }
    value = configured
      ? { configured, cli: true, version, ready: true }
      : { configured, cli: true, version, ready: false, reason: "Set BOB_API_KEY on the server." };
  }
  statusCache = { at: Date.now(), value };
  return value;
}

export interface BobResult {
  ok: boolean;
  /** Bob's final answer. */
  lastMessage: string;
  bobcoins?: number;
  tokens?: number;
  durationMs?: number;
  toolCalls?: number;
  error?: string;
}

/**
 * Runs one headless Bob task in `cwd`. The task text is written to TASK_FILE in
 * that folder and removed afterwards. Never throws: failures come back as ok=false.
 */
export async function runBob(cwd: string, task: string, opts: Partial<typeof BOB_DEFAULTS> = {}): Promise<BobResult> {
  const status = await bobStatus();
  if (!status.ready) return { ok: false, lastMessage: "", error: status.reason };
  const cli = findCli()!;
  const { timeoutMs, maxCost, maxTurns } = { ...BOB_DEFAULTS, ...opts };
  const taskPath = path.join(/*turbopackIgnore: true*/ cwd, TASK_FILE);
  try {
    await fs.writeFile(taskPath, task);
    const out = await spawnBob(
      cli,
      ["run", "--format", "json", "--accept-license", "--trust", "--max-cost", String(maxCost), "--max-turns", String(maxTurns), PROMPT],
      { cwd, timeoutMs },
    );
    const result = parseResult(out.stdout);
    if (!result) {
      const why = out.stderr.trim().split("\n").slice(-3).join(" ") || `bob exited with code ${out.code}`;
      return { ok: false, lastMessage: "", error: scrubBob(why) };
    }
    const stats = result.stats ?? {};
    return {
      ok: result.status === "success",
      lastMessage: scrubBob(String(result.last_message ?? "")),
      bobcoins: typeof stats.session_costs === "number" ? stats.session_costs : undefined,
      tokens: typeof stats.total_tokens === "number" ? stats.total_tokens : undefined,
      durationMs: typeof stats.duration_ms === "number" ? stats.duration_ms : undefined,
      toolCalls: typeof stats.tool_calls === "number" ? stats.tool_calls : undefined,
      error: result.status === "success" ? undefined : scrubBob(String(result.last_message || "Bob reported an error")),
    };
  } catch (err) {
    return { ok: false, lastMessage: "", error: scrubBob(err instanceof Error ? err.message : "Bob failed") };
  } finally {
    await fs.rm(taskPath, { force: true }).catch(() => {});
  }
}

type RawResult = { type?: string; status?: string; last_message?: unknown; stats?: Record<string, unknown> };

/** `--format json` prints one result object; tolerate log lines around it. */
function parseResult(stdout: string): RawResult | null {
  const whole = tryJson<RawResult>(stdout.trim());
  if (whole?.type === "result") return whole;
  for (const line of stdout.split("\n").reverse()) {
    const r = tryJson<RawResult>(line.trim());
    if (r?.type === "result") return r;
  }
  return null;
}

function tryJson<T>(text: string): T | null {
  if (!text.startsWith("{")) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** The first JSON object in a model reply (bare, or inside a ``` fence). */
export function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
