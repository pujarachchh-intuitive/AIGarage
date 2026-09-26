// Change agent: makes any planned change in a fresh clone of the repo, wave by
// wave, one agent per file, and streams real run events to the change page.
//
//   1. Clone       a fresh shallow copy (never a user's working copy)
//   2. Baseline    TypeScript errors in the planned files before any edit
//   3. Fix         compiler: renames of TypeScript symbols (ts-rename.mjs)
//                  bob:      everything else. One IBM Bob Fixer per file, in wave
//                            order, each with a permit for its own file only
//   4. Guard       edits outside the permit are reverted and reported as blocked;
//                  each edit is type-checked; a failing agent gets one retry with
//                  the errors, then its file is rolled back (quarantined)
//   5. Verify      type check of every touched file, then the IBM Bob Inspector
//   6. Preview     the diff is stored as a patch; the PR is opened from it later
//
// Nothing is pushed here. Opening the draft PR is a separate, confirmed step.

import "server-only";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { extractJson, runBob, scrubBob } from "@/lib/server/bob";
import { cloneRepo, inspectWithBob, MAX_DIFF, pushAndOpenPr, scannerTool, scrub, type AgentEvent } from "@/lib/server/github-agent";
import { LIMITS, run, validateGitInput, withWorkspace } from "@/lib/server/ingest";
import { loadPatch, savePatch } from "@/lib/server/repo-store";
import { changeSentence, symbolName } from "@/lib/changes";
import type { ChangeRunRequest, ChangeStreamLine, FixUnit, RunEvent, RunStrategy } from "@/lib/types";

type Send = (line: ChangeStreamLine) => void;
type TypeError = { file: string; line: number; message: string };

const TS_FILE = /\.(tsx?|jsx?|mjs|cjs)$/;
const TS_SYMBOLS = new Set(["TSField", "TSType", "Function", "Constant", "Dataset", "Component"]);
const MIGRATION_DIR = /(^|\/)migrations?\//i;
/** Bobcoins for one change run (every Fixer plus the Inspector). */
const RUN_BUDGET = Number(process.env.BOB_RUN_MAX_COST) || 5;

export function validateRunRequest(req: ChangeRunRequest): string | null {
  const bad = validateGitInput(req.url, req.ref);
  if (bad) return bad;
  if (!req.url.startsWith("https://github.com/")) return "Real runs work with github.com repositories today.";
  if (!req.change?.id || !req.change.request || !req.change.report?.fixUnits) return "change is incomplete";
  if (!req.origin?.id || req.origin.id !== req.change.request.node) return "origin must be the changed node";
  if (req.change.report.fixUnits.length === 0) return "The plan has no files to change.";
  for (const u of req.change.report.fixUnits) {
    if (!u.file || u.file.startsWith("/") || u.file.split("/").includes("..")) return `Refused an unsafe file path: ${u.file}`;
  }
  return null;
}

export function pickStrategy(req: ChangeRunRequest): RunStrategy {
  const { request } = req.change;
  return request.change === "rename" && TS_SYMBOLS.has(req.origin.type) && TS_FILE.test(req.origin.file) ? "compiler" : "bob";
}

/**
 * Runs the change. Never throws: failures end the stream with an error line.
 * `clone` replaces the GitHub clone (tests use a local repo; the route never sets it).
 */
export async function runChange(req: ChangeRunRequest, send: Send, isAborted: () => boolean, clone: (dir: string) => Promise<void> = (dir) => cloneRepo(dir, req.url, req.ref)) {
  const { change, origin } = req;
  const report = change.report;
  const ev = (e: Omit<RunEvent, "ts" | "change_id">) => send({ type: "event", event: { ts: new Date().toISOString(), change_id: change.id, ...e } });
  const agentId = (file: string) => `fix-${file.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(-48)}`;
  const sentence = changeSentence(origin, change.request);
  const budget = { spent: 0, left: () => RUN_BUDGET - budget.spent };

  try {
    await withWorkspace(async (dir) => {
      const git = (args: string[], onChunk?: (t: string) => void) =>
        run("git", ["-C", dir, ...args], { timeoutMs: LIMITS.cloneMs, env: { GIT_TERMINAL_PROMPT: "0" }, onChunk });
      const gitOut = async (args: string[]) => {
        let out = "";
        await git(args, (t) => (out += t));
        return out;
      };

      // 1. Clone.
      send({ type: "status", step: "Cloning a fresh copy of the repository" });
      await clone(dir);

      // 2. Baseline type errors of the planned code files.
      const unitFiles = report.fixUnits.map((u) => u.file);
      send({ type: "status", step: "Type-checking the planned files before any edit" });
      const baseline = await typeErrors(dir, unitFiles.filter((f) => TS_FILE.test(f)));

      // 3 and 4. Fix.
      let strategy = pickStrategy(req);
      let outcome: { quarantined: number; stopped?: string } = { quarantined: 0 };
      if (strategy === "compiler") {
        send({ type: "status", step: "Renaming with the TypeScript compiler", strategy });
        const done = await compilerFix();
        if (done === "fallback") strategy = "bob";
        else if (done === "failed") return;
      }
      if (strategy === "bob") {
        send({ type: "status", step: "IBM Bob Fixer agents are working, one per file", strategy });
        outcome = await bobFix();
      }

      // 5. Verify: type check every touched code file, then the Inspector.
      await git(["add", "-A"]);
      const touched = (await gitOut(["diff", "--cached", "--name-only", "HEAD"])).split("\n").map((s) => s.trim()).filter(Boolean);
      send({ type: "status", step: "Final type check", strategy });
      const checkFiles = [...new Set([...unitFiles, ...touched])].filter((f) => TS_FILE.test(f) && existsSync(path.join(/*turbopackIgnore: true*/ dir, f)));
      const remaining = newErrors(await typeErrors(dir, checkFiles), baseline);

      if (touched.length > 0 && budget.left() >= 0.3) {
        send({ type: "status", step: "IBM Bob Inspector is reviewing the diff", strategy });
        const review = await inspectWithBob(
          dir,
          `${sentence} It was made ${strategy === "compiler" ? "by the TypeScript compiler's rename" : "by IBM Bob Fixer agents, one per file"}.`,
          "Check that the diff makes the change completely and correctly. Look for places it should have reached but did not (string literals, dynamic access, JSON, config, SQL, tests, docs), and for edits that change behaviour beyond the change. Ignore unrelated symbols with the same name.",
          { maxCost: Math.min(1, budget.left()) },
        );
        if (review.status === "done") budget.spent += review.bobcoins ?? 0;
        send({ type: "review", review });
        ev(
          review.status === "done"
            ? { event: "inspector", data: { verdict: review.verdict, issues: review.issues.length }, detail: review.summary, bobcoins: review.bobcoins }
            : { event: "inspector", data: { verdict: "skipped", issues: 0 }, detail: `Inspector skipped: ${review.reason}` },
        );
      } else {
        const reason = touched.length === 0 ? "nothing was changed" : `the ${RUN_BUDGET} Bobcoin budget is used up`;
        send({ type: "review", review: { status: "skipped", reason } });
        ev({ event: "inspector", data: { verdict: "skipped", issues: 0 }, detail: `Inspector skipped: ${reason}` });
      }

      ev({
        event: "rescan",
        data: { before: report.danglingRefs, after: remaining.length + outcome.quarantined },
        detail: `Type check after the change: ${remaining.length} new type errors, ${outcome.quarantined} files rolled back`,
      });

      // 6. Preview: store the patch so the PR is exactly this diff.
      await git(["add", "-A"]);
      const patch = await gitOut(["diff", "--cached", "--binary", "--no-color", "HEAD"]);
      const files = (await gitOut(["diff", "--cached", "--name-only", "HEAD"])).split("\n").map((s) => s.trim()).filter(Boolean);
      const patchId = patch.trim()
        ? await savePatch({
            url: req.url,
            ref: req.ref,
            changeId: change.id,
            title: change.title,
            summary: `${sentence}\nMade by SystemDNA (${strategy === "compiler" ? "TypeScript compiler rename" : "IBM Bob Fixer agents"}) across ${files.length} files.`,
            patch,
            createdAt: new Date().toISOString(),
          })
        : undefined;
      send({ type: "preview", files, diff: patch.slice(0, MAX_DIFF), diffTruncated: patch.length > MAX_DIFF, patchId, remainingErrors: remaining.slice(0, 50) });
      ev({
        event: "change_completed",
        detail: outcome.stopped
          ? `Stopped early: ${outcome.stopped}`
          : remaining.length || outcome.quarantined
            ? `Finished with ${remaining.length} new type errors and ${outcome.quarantined} files that need a human`
            : `Finished: ${files.length} files changed, no new type errors`,
      });
      if (outcome.stopped) send({ type: "error", message: `Stopped early: ${outcome.stopped}` });

      // ---------------------------------------------------------------------
      // Compiler strategy: one pass by ts-rename.mjs, reported per planned file.
      // ---------------------------------------------------------------------
      async function compilerFix(): Promise<"ok" | "failed" | "fallback"> {
        const args = origin.type === "TSField" ? ["--field", origin.name] : ["--symbol", symbolName(origin), "--file", origin.file, "--line", String(origin.line ?? 0)];
        let line = "";
        await run(process.execPath, [scannerTool("ts-rename.mjs"), dir, ...args, "--to", change.request.to, "--apply"], {
          timeoutMs: LIMITS.scanMs,
          env: { NODE_OPTIONS: "--max-old-space-size=2048" },
          onLine: (l) => (line = l),
        }).catch((e: Error) => {
          if (!line) throw e;
        });
        const result = JSON.parse(line || "{}") as { ok: boolean; error?: string; files?: { file: string; count: number }[]; docs?: { file: string; count: number }[]; newErrors?: TypeError[] };
        // A component whose function is not named like its file: let Bob do it.
        if (result.error && /Could not find/.test(result.error)) return "fallback";
        if (result.error) throw new Error(result.error);
        if (!result.ok) {
          const errs = result.newErrors ?? [];
          send({ type: "error", message: `The rename would add ${errs.length} type errors (for example ${errs[0]?.file}:${errs[0]?.line} ${errs[0]?.message}), so nothing was changed.` });
          ev({ event: "change_completed", detail: "Refused: the rename would add type errors" });
          return "failed";
        }
        const edited = new Map([...(result.files ?? []), ...(result.docs ?? [])].map((f) => [f.file, f.count]));
        const extra = [...edited.keys()].filter((f) => !unitFiles.includes(f));
        for (let wave = 1; wave <= report.waveCount; wave++) {
          const units = report.fixUnits.filter((u) => u.wave === wave);
          const extras = wave === report.waveCount ? extra : [];
          ev({ event: "wave_started", wave, data: { agents: units.length + extras.length } });
          for (const file of [...units.map((u) => u.file), ...extras]) {
            const id = agentId(file);
            const planned = unitFiles.includes(file);
            ev({ event: "agent_started", agent_id: id, wave, node: file, file, detail: planned ? "TypeScript compiler rename" : "Found by the compiler, not in the plan" });
            if (edited.has(file)) {
              ev({ event: "tool_call", agent_id: id, wave, node: file, tool: "write_to_file", file, permit_ok: true, detail: `${edited.get(file)} edits` });
              ev({ event: "check_passed", agent_id: id, wave, node: file, file, detail: TS_FILE.test(file) ? `${edited.get(file)} edits; no new type errors` : `${edited.get(file)} doc edits` });
              ev({ event: "done", agent_id: id, wave, node: file, file });
            } else {
              ev({ event: "check_passed", agent_id: id, wave, node: file, file, detail: "No edit needed: the compiler found no reference here" });
              ev({ event: "done", agent_id: id, wave, node: file, file, detail: "No edit needed" });
            }
          }
          ev({ event: "wave_completed", wave });
        }
        return "ok";
      }

      // ---------------------------------------------------------------------
      // Bob strategy: one Fixer per file, in wave order, each inside a permit.
      // ---------------------------------------------------------------------
      async function bobFix(): Promise<{ quarantined: number; stopped?: string }> {
        let quarantined = 0;
        for (let wave = 1; wave <= report.waveCount; wave++) {
          const units = report.fixUnits.filter((u) => u.wave === wave);
          ev({ event: "wave_started", wave, data: { agents: units.length } });
          for (const unit of units) {
            if (isAborted()) return { quarantined, stopped: "the browser closed the run" };
            if (budget.left() < 0.3) return { quarantined, stopped: `the ${RUN_BUDGET} Bobcoin budget for this run is used up` };
            const id = agentId(unit.file);
            const db = unit.layer === "database";
            ev({ event: "agent_started", agent_id: id, wave, node: unit.id, file: unit.file, detail: `Permit: ${unit.file}${db ? " + new migration files" : ""}` });
            ev({ event: "tool_call", agent_id: id, wave, node: unit.id, tool: "read_file", file: unit.file, permit_ok: true });

            // Snapshot: everything accepted so far is staged; reverts go back to it.
            await git(["add", "-A"]);
            const upstream = (await gitOut(["diff", "--cached", "--no-color", "HEAD"])).slice(0, 30_000);
            let attempt = await fixerAttempt(unit, id, wave, upstream, []);
            if (attempt === "failed") {
              quarantined += 1;
              continue;
            }
            if (attempt.wrote.length === 0) {
              ev({ event: "check_passed", agent_id: id, wave, node: unit.id, file: unit.file, detail: `No edit needed: ${attempt.summary}` });
              ev({ event: "done", agent_id: id, wave, node: unit.id, file: unit.file });
              continue;
            }
            if (!TS_FILE.test(unit.file)) {
              ev({ event: "check_passed", agent_id: id, wave, node: unit.id, file: unit.file, detail: `${attempt.summary} (no type checker for ${path.extname(unit.file) || "this file"}; the Inspector reviews it)` });
              ev({ event: "done", agent_id: id, wave, node: unit.id, file: unit.file });
              continue;
            }
            // Type check this file against the baseline; one retry with the errors.
            let errs = newErrors(await typeErrors(dir, [unit.file]), baseline);
            if (errs.length > 0 && budget.left() >= 0.3) {
              ev({ event: "check_failed", agent_id: id, wave, node: unit.id, file: unit.file, detail: `${errs.length} new type errors, e.g. line ${errs[0].line}: ${errs[0].message}` });
              ev({ event: "retrying", agent_id: id, wave, node: unit.id, file: unit.file });
              attempt = await fixerAttempt(unit, id, wave, upstream, errs);
              if (attempt === "failed") {
                quarantined += 1;
                continue;
              }
              errs = newErrors(await typeErrors(dir, [unit.file]), baseline);
            }
            if (errs.length > 0) {
              await revertUnit(unit);
              quarantined += 1;
              ev({ event: "check_failed", agent_id: id, wave, node: unit.id, file: unit.file, detail: `${errs.length} new type errors, e.g. line ${errs[0].line}: ${errs[0].message}` });
              ev({ event: "quarantined", agent_id: id, wave, node: unit.id, file: unit.file, detail: "Still failing after a retry; its edit was rolled back for a human" });
              continue;
            }
            ev({ event: "check_passed", agent_id: id, wave, node: unit.id, file: unit.file, detail: `${attempt.summary} (no new type errors)` });
            ev({ event: "done", agent_id: id, wave, node: unit.id, file: unit.file });
          }
          ev({ event: "wave_completed", wave });
        }
        return { quarantined };
      }

      /** One Bob run for a unit, with the permit enforced afterwards. */
      async function fixerAttempt(unit: FixUnit, id: string, wave: number, upstream: string, errors: TypeError[]): Promise<{ wrote: string[]; summary: string } | "failed"> {
        const result = await runBob(dir, fixerTask(unit, upstream, errors), { maxCost: Math.min(1.5, budget.left()) });
        budget.spent += result.bobcoins ?? 0;
        if (!result.ok) {
          await revertUnit(unit);
          ev({ event: "check_failed", agent_id: id, wave, node: unit.id, file: unit.file, detail: `Bob did not finish: ${result.error ?? "unknown error"}`, bobcoins: result.bobcoins });
          ev({ event: "quarantined", agent_id: id, wave, node: unit.id, file: unit.file, detail: "The agent failed; nothing was changed in this file" });
          return "failed";
        }
        const wrote: string[] = [];
        for (const p of await changedPaths()) {
          if (p === unit.file || (unit.layer === "database" && MIGRATION_DIR.test(p) && !(await tracked(p)))) {
            wrote.push(p);
            continue;
          }
          await revertPath(p);
          if (p.startsWith(".bob/")) continue; // Bob's own workspace files, not an edit.
          ev({ event: "tool_call", agent_id: id, wave, node: unit.id, tool: "write_to_file", file: p, permit_ok: false });
          ev({ event: "blocked", agent_id: id, wave, node: unit.id, file: p, permit_ok: false, detail: `Edited ${p}, which is outside its permit; the edit was reverted` });
        }
        const parsed = extractJson<{ status?: string; summary?: string }>(result.lastMessage);
        const summary = scrubBob(String(parsed?.summary ?? (wrote.length ? "Edited" : "No change needed"))).slice(0, 240);
        for (const p of wrote) ev({ event: "tool_call", agent_id: id, wave, node: unit.id, tool: "write_to_file", file: p, permit_ok: true, detail: summary });
        if (result.bobcoins) ev({ event: "tool_call", agent_id: id, wave, node: unit.id, tool: "bob_run", file: unit.file, permit_ok: true, bobcoins: result.bobcoins, detail: `${result.toolCalls ?? 0} tool calls` });
        return { wrote, summary };
      }

      function fixerTask(unit: FixUnit, upstream: string, errors: TypeError[]) {
        const why = (req.context[unit.file] ?? []).slice(0, 20).map((l) => `- ${l}`).join("\n") || "- It depends on the changed component.";
        // The file that defines the changed table or column also ships the migration.
        // A real timestamp keeps it ordered after every existing migration.
        const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
        const migration =
          unit.layer === "database" && unit.file === origin.file
            ? `\n## Migration\nThis changes the database schema. Besides editing \`${unit.file}\`, you MUST add a NEW migration that applies the change to an existing database (for example ALTER TABLE ... RENAME COLUMN for a rename), so no data is lost. Put it in the repository's existing migrations folder, following its naming pattern; use the timestamp ${stamp} where the pattern has one (for Prisma: prisma/migrations/${stamp}_<short_name>/migration.sql). Never edit an existing migration. If the repository has no migrations folder, do not create one and say so in your summary.\n`
            : "";
        return `# SystemDNA Fixer task

You are a Fixer agent of SystemDNA. One change is being made across this repository, one file per agent, in dependency order.

## The change
${sentence}

## Your permit
You may edit ONLY this file: \`${unit.file}\`
${unit.layer === "database" ? "You may also create NEW migration files inside an existing migrations folder. Never edit an existing migration.\n" : ""}Any edit to another file is reverted and reported as blocked.

## Why this file is affected
${why}

## Already changed by earlier agents
${upstream.trim() ? `\`\`\`diff\n${upstream}\n\`\`\`` : "Nothing yet: you are in the first wave."}
${migration}${errors.length ? `\n## Your last edit left these new type errors in ${unit.file}. Fix them.\n${errors.slice(0, 15).map((e) => `- line ${e.line}: ${e.message}`).join("\n")}\n` : ""}
## Rules
- Make the smallest edit that keeps \`${unit.file}\` correct after the change. Keep all other behaviour the same.
- If this file needs no edit, change nothing.
- Do not install packages, build, or run project code. Do not edit ${"`.systemdna-bob-task.md`"}.

Reply with ONLY this JSON, no other text:
{"status": "edited" | "no_change", "summary": "one short sentence"}
`;
      }

      async function changedPaths(): Promise<string[]> {
        const modified = (await gitOut(["diff", "--name-only"])).split("\n");
        const created = (await gitOut(["ls-files", "--others", "--exclude-standard"])).split("\n");
        return [...new Set([...modified, ...created].map((s) => s.trim()).filter(Boolean))];
      }
      async function tracked(p: string) {
        return (await gitOut(["ls-files", "--", p])).trim().length > 0;
      }
      async function revertPath(p: string) {
        if (await tracked(p)) await git(["checkout", "--", p]).catch(() => {});
        else await fs.rm(path.join(/*turbopackIgnore: true*/ dir, p), { force: true, recursive: true }).catch(() => {});
      }
      async function revertUnit(unit: FixUnit) {
        for (const p of await changedPaths()) if (p === unit.file || MIGRATION_DIR.test(p) || p.startsWith(".bob/")) await revertPath(p);
      }
    });
  } catch (err) {
    const message = scrub(scrubBob(err instanceof Error ? err.message : "Something went wrong"));
    send({ type: "error", message });
    ev({ event: "change_completed", detail: `Failed: ${message}` });
  }
}

/** New type errors per file, as "file|message" keys with counts. */
async function typeErrors(dir: string, files: string[]): Promise<Map<string, TypeError[]>> {
  const out = new Map<string, TypeError[]>();
  if (files.length === 0) return out;
  let line = "";
  await run(process.execPath, [scannerTool("ts-check.mjs"), dir, "--files", files.join(",")], {
    timeoutMs: LIMITS.scanMs,
    env: { NODE_OPTIONS: "--max-old-space-size=2048" },
    onLine: (l) => (line = l),
  }).catch(() => {});
  const parsed = JSON.parse(line || '{"errors":[]}') as { errors: (TypeError & { code: number })[] };
  for (const e of parsed.errors ?? []) {
    const key = `${e.file}|${e.code}|${e.message}`;
    out.set(key, [...(out.get(key) ?? []), { file: e.file, line: e.line, message: e.message }]);
  }
  return out;
}

function newErrors(after: Map<string, TypeError[]>, before: Map<string, TypeError[]>): TypeError[] {
  const out: TypeError[] = [];
  for (const [key, list] of after) out.push(...list.slice(before.get(key)?.length ?? 0));
  return out;
}

/** Streams a run as newline-delimited JSON. Stops Bob work if the browser leaves. */
export function changeRunStream(req: ChangeRunRequest): Response {
  const encoder = new TextEncoder();
  let aborted = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: Send = (line) => {
        if (aborted) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
        } catch {
          aborted = true;
        }
      };
      await runChange(req, send, () => aborted);
      if (!aborted) controller.close();
    },
    cancel() {
      aborted = true;
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

/** Opens a draft PR from a stored patch: fresh clone, apply, branch, push. */
export function pullRequestFromPatchStream(input: { patchId: string; title: string; body: string }): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        const stored = await loadPatch(input.patchId);
        if (!stored) throw new Error("That preview has expired. Run the change again.");
        await withWorkspace(async (dir) => {
          emit({ type: "progress", step: "clone", detail: "Cloning a fresh copy" });
          await cloneRepo(dir, stored.url, stored.ref);
          emit({ type: "progress", step: "apply", detail: "Applying the previewed diff" });
          const patchFile = path.join(/*turbopackIgnore: true*/ path.dirname(dir), "change.patch");
          await fs.writeFile(patchFile, stored.patch);
          await run("git", ["-C", dir, "apply", "--index", "--whitespace=nowarn", patchFile], { timeoutMs: 60_000 }).catch((e: Error) => {
            throw new Error(`The repository changed since the preview, so the diff no longer applies. Run the change again. (${e.message})`);
          });
          const pr = await pushAndOpenPr(dir, stored.url, {
            ref: stored.ref,
            branch: `systemdna/${stored.changeId}`,
            title: input.title || stored.title,
            commitBody: stored.summary,
            body: input.body,
          }, emit);
          emit({ type: "done", dryRun: false, pr });
        });
      } catch (err) {
        emit({ type: "error", message: scrub(err instanceof Error ? err.message : "Something went wrong") });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

