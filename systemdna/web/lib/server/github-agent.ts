// GitHub agent: makes the change in a real repo and opens a draft pull request.
//
//   1. Clone     a fresh shallow copy of the repo (never a user's working copy)
//   2. Edit      core/scanner/ts-rename.mjs: the TypeScript compiler's own rename,
//                plus `keyof` string keys and docs that name the field
//   3. Check     no new type errors in any file that mentions the old name
//   4. Preview   git diff, returned to the browser (dry run stops here)
//   5. Push      a new branch systemdna/<change> (never the default branch)
//   6. PR        a DRAFT pull request with the impact report as its description
//
// The GitHub token comes only from the server environment (GITHUB_TOKEN). It is
// sent as an HTTP header, never put in a URL, a git remote or a log line.

import "server-only";
import path from "node:path";
import { existsSync } from "node:fs";
import { LIMITS, run, validateGitInput, withWorkspace } from "@/lib/server/ingest";

export type AgentEvent =
  | { type: "progress"; step: string; detail: string }
  | { type: "preview"; files: { file: string; count: number }[]; docs: { file: string; count: number }[]; locations: number; stringKeys: number; diff: string; diffTruncated: boolean }
  | { type: "done"; dryRun: true }
  | { type: "done"; dryRun: false; pr: { url: string; number: number; branch: string; base: string } }
  | { type: "error"; message: string; newErrors?: { file: string; line: number; message: string }[] };

type Emit = (e: AgentEvent) => void;

export interface PullRequestInput {
  url: string;
  ref?: string;
  /** "Type.field" */
  field: string;
  to: string;
  changeId: string;
  title: string;
  body: string;
  dryRun: boolean;
}

const MAX_DIFF = 200_000;

function token() {
  return process.env.GITHUB_TOKEN?.trim() || "";
}

/** git -c option that sends the token as a header for github.com only. */
function authConfig(): string[] {
  const t = token();
  if (!t) return [];
  const basic = Buffer.from(`x-access-token:${t}`).toString("base64");
  return ["-c", `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`];
}

/** Never let the token reach a message. */
function scrub(message: string) {
  const t = token();
  let out = message;
  if (t) out = out.split(t).join("***");
  return out.replace(/AUTHORIZATION: basic [A-Za-z0-9+/=]+/gi, "AUTHORIZATION: ***");
}

function ownerRepo(url: string) {
  const m = url.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(\.git)?\/?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

async function github<T>(pathname: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.github.com${pathname}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token()}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "SystemDNA-agent",
      ...init?.headers,
    },
  });
  const body = (await res.json().catch(() => ({}))) as T & { message?: string; errors?: { message?: string }[] };
  if (!res.ok) {
    const detail = body.errors?.map((e) => e.message).filter(Boolean).join("; ");
    throw new Error(`GitHub ${res.status}: ${body.message ?? "request failed"}${detail ? ` (${detail})` : ""}`);
  }
  return body;
}

/** Is a token configured, and whose is it? Never returns the token. */
export async function githubStatus(): Promise<{ configured: boolean; login?: string; error?: string }> {
  if (!token()) return { configured: false };
  try {
    const me = await github<{ login: string }>("/user");
    return { configured: true, login: me.login };
  } catch (err) {
    return { configured: true, error: err instanceof Error ? scrub(err.message) : "Token check failed" };
  }
}

function renamePath() {
  const scanner = process.env.SYSTEMDNA_SCANNER ?? path.resolve(/*turbopackIgnore: true*/ process.cwd(), "../core/scanner/ts-scan.mjs");
  return path.join(/*turbopackIgnore: true*/ path.dirname(scanner), "ts-rename.mjs");
}

export async function runPullRequest(input: PullRequestInput, emit: Emit) {
  const bad = validateGitInput(input.url, input.ref);
  if (bad) throw new Error(bad);
  const target = ownerRepo(input.url);
  if (!target) throw new Error("The GitHub agent works with github.com repositories today.");
  if (!/^[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(input.field)) throw new Error("Only renames of a TypeScript field (Type.field) are supported today.");
  if (!/^[A-Za-z_$][\w$]*$/.test(input.to)) throw new Error("The new name must be a valid identifier.");
  if (!input.dryRun && !token()) throw new Error("Set GITHUB_TOKEN on the server to open pull requests.");
  const renameScript = renamePath();
  if (!existsSync(renameScript)) throw new Error(`Rename agent not found at ${renameScript}.`);

  return withWorkspace(async (dir) => {
    // 1. Clone.
    emit({ type: "progress", step: "clone", detail: `Cloning ${target.owner}/${target.repo}` });
    const cloneArgs = [...authConfig(), "-c", "protocol.file.allow=never", "-c", "core.symlinks=false", "clone", "--depth", "1", "--single-branch", "--no-tags", "--quiet"];
    if (input.ref) cloneArgs.push("--branch", input.ref);
    cloneArgs.push("--", input.url, dir);
    await run("git", cloneArgs, { timeoutMs: LIMITS.cloneMs, env: { GIT_TERMINAL_PROMPT: "0", GIT_LFS_SKIP_SMUDGE: "1" } }).catch((e: Error) => {
      throw new Error(scrub(e.message));
    });

    // 2 and 3. Rename and check.
    emit({ type: "progress", step: "edit", detail: `Renaming ${input.field} to ${input.to} with the TypeScript compiler` });
    let resultLine = "";
    await run(process.execPath, [renameScript, dir, "--field", input.field, "--to", input.to, "--apply"], {
      timeoutMs: LIMITS.scanMs,
      env: { NODE_OPTIONS: "--max-old-space-size=2048" },
      onLine: (l) => {
        resultLine = l;
      },
    }).catch((e: Error) => {
      // Exit code 2 = the agent refused with a reason on stdout.
      if (!resultLine) throw e;
    });
    const result = JSON.parse(resultLine || "{}") as {
      ok: boolean;
      error?: string;
      locations: number;
      stringKeys: number;
      files: { file: string; count: number }[];
      docs: { file: string; count: number }[];
      newErrors: { file: string; line: number; message: string }[];
    };
    if (result.error) throw new Error(result.error);
    if (!result.ok) {
      emit({ type: "error", message: `The rename would add ${result.newErrors.length} type errors, so nothing was changed.`, newErrors: result.newErrors });
      throw Object.assign(new Error("__reported__"), { reported: true });
    }
    emit({ type: "progress", step: "check", detail: `${result.locations} edits in ${result.files.length} code files and ${result.docs.length} docs; no new type errors` });

    // 4. Preview.
    let diff = "";
    await run("git", ["-C", dir, "diff", "--no-color"], { timeoutMs: 60_000, onChunk: (t) => (diff += t) });
    emit({
      type: "preview",
      files: result.files,
      docs: result.docs,
      locations: result.locations,
      stringKeys: result.stringKeys,
      diff: diff.slice(0, MAX_DIFF),
      diffTruncated: diff.length > MAX_DIFF,
    });
    if (input.dryRun) {
      emit({ type: "done", dryRun: true });
      return;
    }

    // 5. Branch, commit, push. Never the default branch.
    const branch = `systemdna/${input.changeId}-${input.field.split(".")[1]}-to-${input.to}`.toLowerCase().replace(/[^a-z0-9/_-]+/g, "-").slice(0, 100);
    emit({ type: "progress", step: "push", detail: `Pushing branch ${branch}` });
    const repoInfo = await github<{ default_branch: string; permissions?: { push?: boolean } }>(`/repos/${target.owner}/${target.repo}`);
    if (repoInfo.permissions && !repoInfo.permissions.push) {
      throw new Error(`The token cannot push to ${target.owner}/${target.repo}. Give it Contents: write, or fork the repo and connect the fork.`);
    }
    const base = input.ref || repoInfo.default_branch;
    const git = (args: string[]) => run("git", ["-C", dir, ...args], { timeoutMs: LIMITS.cloneMs, env: { GIT_TERMINAL_PROMPT: "0" } }).catch((e: Error) => {
      throw new Error(scrub(e.message));
    });
    await git(["checkout", "-b", branch]);
    await git(["add", "-A"]);
    await git([
      "-c", "user.name=SystemDNA Agent",
      "-c", "user.email=agent@systemdna.dev",
      "commit", "--quiet", "--no-verify",
      "-m", input.title,
      "-m", `Rename ${input.field} to ${input.to} across ${result.files.length} code files and ${result.docs.length} docs.\nMade by the SystemDNA GitHub agent with the TypeScript compiler's rename. No new type errors.`,
    ]);
    await run("git", [...authConfig(), "-C", dir, "push", "--quiet", "origin", `HEAD:refs/heads/${branch}`], { timeoutMs: LIMITS.cloneMs, env: { GIT_TERMINAL_PROMPT: "0" } }).catch((e: Error) => {
      throw new Error(scrub(e.message));
    });

    // 6. Draft pull request.
    emit({ type: "progress", step: "pr", detail: "Opening a draft pull request" });
    const pr = await github<{ html_url: string; number: number }>(`/repos/${target.owner}/${target.repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({ title: input.title, head: branch, base, body: input.body.slice(0, 60_000), draft: true }),
    });
    emit({ type: "done", dryRun: false, pr: { url: pr.html_url, number: pr.number, branch, base } });
  });
}

/** Streams agent events as newline-delimited JSON. */
export function agentStream(input: PullRequestInput): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: Emit = (e) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runPullRequest(input, emit);
      } catch (err) {
        if (!(err as { reported?: boolean }).reported) emit({ type: "error", message: scrub(err instanceof Error ? err.message : "Something went wrong") });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
