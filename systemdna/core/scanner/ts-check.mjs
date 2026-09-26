// SystemDNA type check: the TypeScript errors in some files of a repo.
//
// The change agent runs it before any edit (baseline) and after each agent's
// edit, and counts only errors that are new. Missing packages (no
// node_modules in a fresh clone) show up in both runs, so they cancel out.
//
// Usage:
//   node ts-check.mjs <repo-dir> --files a.ts,b.tsx [--max-files 2500]
//
// Output: one JSON object on stdout:
//   { ok: true, errors: [{ file, line, code, message }] }
//
// It never runs code from the repo. It only reads files.

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const [, , repoArg, ...rest] = process.argv;
const arg = (name) => (rest.indexOf(name) >= 0 ? rest[rest.indexOf(name) + 1] : undefined);
const wanted = (arg("--files") ?? "").split(",").filter(Boolean);
const maxFiles = Number(arg("--max-files") ?? 2500);

if (!repoArg) {
  process.stdout.write(JSON.stringify({ ok: false, error: "Usage: node ts-check.mjs <repo-dir> --files a.ts,b.tsx" }) + "\n");
  process.exit(2);
}

const root = path.resolve(repoArg);
const rel = (f) => path.relative(root, f).split(path.sep).join("/");
const IGNORED_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "out", "coverage", ".turbo", ".vercel", "vendor", "target", ".cache"]);
const CODE_EXT = /\.(tsx?|jsx?|mjs|cjs)$/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(e.name) || e.isSymbolicLink()) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const isScannable = (r) => CODE_EXT.test(r) && !r.endsWith(".d.ts") && r !== "next-env.d.ts" && !r.split("/").some((p) => p.startsWith("."));

// Same project setup as ts-scan.mjs and ts-rename.mjs.
const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json") ?? ts.findConfigFile(root, ts.sys.fileExists, "jsconfig.json");
const insideRoot = configPath && !path.relative(root, configPath).startsWith("..");
const parsed = insideRoot
  ? ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, path.dirname(configPath))
  : {
      options: { allowJs: true, jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, baseUrl: root, paths: { "@/*": ["./*", "./src/*"] } },
      fileNames: [],
    };
parsed.options.allowJs = true;
let files = parsed.fileNames.filter((f) => isScannable(rel(f)));
if (files.length === 0) files = walk(root).filter((f) => isScannable(rel(f)));
files = files.sort().slice(0, maxFiles);

const program = ts.createProgram(files, { ...parsed.options, noEmit: true });
const targets = wanted.length ? files.filter((f) => wanted.includes(rel(f))) : files;
const errors = [];
for (const f of targets) {
  const sf = program.getSourceFile(f);
  if (!sf) continue;
  for (const d of [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)]) {
    const line = d.start !== undefined ? sf.getLineAndCharacterOfPosition(d.start).line + 1 : 0;
    errors.push({ file: rel(f), line, code: d.code, message: ts.flattenDiagnosticMessageText(d.messageText, " ") });
  }
}
process.stdout.write(JSON.stringify({ ok: true, errors }) + "\n");
