// SystemDNA rename agent (code side).
//
// Renames a field of a TypeScript interface or class everywhere it is used,
// using the TypeScript language service's own rename (the same engine as
// "Rename symbol" in VS Code). It then checks that no new type errors appear.
//
// Usage:
//   node ts-rename.mjs <repo-dir> --field Type.field --to newName [--apply] [--max-files 2500]
//
// Output: one JSON object on stdout:
//   { ok, field, to, locations, files: [{ file, count }], docs: [{ file, count }],
//     newErrors: [{ file, line, message }], applied }
//
// It never runs code from the repo. It only reads files, and with --apply writes the edits.

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const [, , repoArg, ...rest] = process.argv;
const arg = (name) => (rest.indexOf(name) >= 0 ? rest[rest.indexOf(name) + 1] : undefined);
const fieldArg = arg("--field");
const to = arg("--to");
const apply = rest.includes("--apply");
const maxFiles = Number(arg("--max-files") ?? 2500);

function fail(message) {
  process.stdout.write(JSON.stringify({ ok: false, error: message }) + "\n");
  process.exit(2);
}

if (!repoArg || !fieldArg || !to) fail("Usage: node ts-rename.mjs <repo-dir> --field Type.field --to newName [--apply]");
if (!/^[A-Za-z_$][\w$]*$/.test(to)) fail(`"${to}" is not a valid identifier`);
const [typeName, fieldName] = fieldArg.split(".");
if (!typeName || !fieldName) fail("--field must look like Type.field");

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
const allFiles = walk(root);
const isScannable = (r) => CODE_EXT.test(r) && !r.endsWith(".d.ts") && r !== "next-env.d.ts" && !r.split("/").some((p) => p.startsWith("."));

// Same project setup as ts-scan.mjs.
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
if (files.length === 0) files = allFiles.filter((f) => isScannable(rel(f)));
files = files.sort().slice(0, maxFiles);

// In-memory file contents, so we can check the edited code before writing anything.
const contents = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const versions = new Map(files.map((f) => [f, 0]));
const host = {
  getScriptFileNames: () => files,
  getScriptVersion: (f) => String(versions.get(f) ?? 0),
  getScriptSnapshot: (f) => {
    const text = contents.get(f) ?? (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : undefined);
    return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
  },
  getCurrentDirectory: () => root,
  getCompilationSettings: () => ({ ...parsed.options, noEmit: true }),
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: ts.sys.fileExists,
  readFile: (f) => contents.get(f) ?? ts.sys.readFile(f),
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
};
const ls = ts.createLanguageService(host, ts.createDocumentRegistry());

// 1. Find the field's declaration.
let decl = null;
for (const f of files) {
  const sf = ls.getProgram().getSourceFile(f);
  if (!sf) continue;
  for (const stmt of sf.statements) {
    const isType = (ts.isInterfaceDeclaration(stmt) || ts.isClassDeclaration(stmt)) && stmt.name?.text === typeName;
    if (!isType) continue;
    for (const m of stmt.members) {
      if (m.name && ts.isIdentifier(m.name) && m.name.text === fieldName) decl = { file: f, pos: m.name.getStart(sf) };
    }
  }
  if (decl) break;
}
if (!decl) fail(`Could not find ${typeName}.${fieldName} in the repo`);

// Type errors per file, as "code:message" keys, so we can spot new ones after the edit.
function errorKeys(fileList) {
  const keys = new Map();
  for (const f of fileList) {
    const diags = [...ls.getSyntacticDiagnostics(f), ...ls.getSemanticDiagnostics(f)];
    for (const d of diags) {
      const msg = ts.flattenDiagnosticMessageText(d.messageText, " ");
      const line = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 0;
      const key = `${rel(f)}|${d.code}|${msg}`;
      keys.set(key, [...(keys.get(key) ?? []), { file: rel(f), line, message: msg }]);
    }
  }
  return keys;
}

// 2. Ask the compiler where the rename must happen.
const locations = (ls.findRenameLocations(decl.file, decl.pos, false, false, { providePrefixAndSuffixTextForRename: true }) ?? [])
  .filter((l) => contents.has(l.fileName));
if (locations.length === 0) fail("The compiler found nothing to rename");

// 2b. String keys typed as `keyof Type` (e.g. key: "totalMau"). Rename does not
// return these, but they break just the same, so we add them ourselves.
const program = ls.getProgram();
const checker = program.getTypeChecker();
const typeFields = (() => {
  const sf = program.getSourceFile(decl.file);
  for (const stmt of sf.statements) {
    if ((ts.isInterfaceDeclaration(stmt) || ts.isClassDeclaration(stmt)) && stmt.name?.text === typeName) {
      return new Set(stmt.members.filter((m) => m.name && ts.isIdentifier(m.name)).map((m) => m.name.text));
    }
  }
  return new Set();
})();
let stringKeys = 0;
for (const f of files) {
  const sf = program.getSourceFile(f);
  if (!sf || !contents.get(f).includes(fieldName)) continue;
  const visit = (node) => {
    if (ts.isStringLiteral(node) && node.text === fieldName) {
      const ctx = checker.getContextualType(node);
      const members = ctx && ctx.isUnion() ? ctx.types : ctx ? [ctx] : [];
      const literals = members.filter((t) => t.isStringLiteral()).map((t) => t.value);
      if (literals.length > 1 && literals.every((v) => typeFields.has(v))) {
        locations.push({ fileName: f, textSpan: { start: node.getStart(sf) + 1, length: fieldName.length } });
        stringKeys += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// Check every file that mentions the old name, not only the ones we edit.
const touched = [...new Set([...locations.map((l) => l.fileName), ...files.filter((f) => contents.get(f).includes(fieldName))])];
const before = errorKeys(touched);

// 3. Apply the edits in memory, last position first so offsets stay valid.
const byFile = new Map();
for (const l of locations) byFile.set(l.fileName, [...(byFile.get(l.fileName) ?? []), l]);
for (const [f, locs] of byFile) {
  let text = contents.get(f);
  for (const l of [...locs].sort((a, b) => b.textSpan.start - a.textSpan.start)) {
    const replacement = `${l.prefixText ?? ""}${to}${l.suffixText ?? ""}`;
    text = text.slice(0, l.textSpan.start) + replacement + text.slice(l.textSpan.start + l.textSpan.length);
  }
  contents.set(f, text);
  versions.set(f, (versions.get(f) ?? 0) + 1);
}

// 4. Check: the same files must not gain new type errors.
const after = errorKeys(touched);
const newErrors = [];
for (const [key, list] of after) {
  const had = before.get(key)?.length ?? 0;
  if (list.length > had) newErrors.push(...list.slice(had));
}

// 5. Docs: a markdown line that names both the type and the field (same rule as the scanner).
const docEdits = [];
const wordRe = new RegExp(`\\b${fieldName}\\b`, "g");
for (const f of allFiles.filter((x) => /\.mdx?$/.test(x) && !/(^|\/)(AGENTS|CLAUDE)\.md$/.test(rel(x)))) {
  const lines = fs.readFileSync(f, "utf8").split(/(\r?\n)/);
  let count = 0;
  for (let i = 0; i < lines.length; i += 2) {
    if (lines[i].includes(typeName) && wordRe.test(lines[i])) {
      wordRe.lastIndex = 0;
      count += (lines[i].match(wordRe) ?? []).length;
      lines[i] = lines[i].replace(wordRe, to);
    }
    wordRe.lastIndex = 0;
  }
  if (count > 0) docEdits.push({ file: f, count, text: lines.join("") });
}

// 6. Write only when asked, and only when the check passed.
const ok = newErrors.length === 0;
if (apply && ok) {
  for (const [f] of byFile) fs.writeFileSync(f, contents.get(f));
  for (const d of docEdits) fs.writeFileSync(d.file, d.text);
}

process.stdout.write(
  JSON.stringify({
    ok,
    field: `${typeName}.${fieldName}`,
    to,
    locations: locations.length,
    stringKeys,
    files: [...byFile].map(([f, l]) => ({ file: rel(f), count: l.length })).sort((a, b) => a.file.localeCompare(b.file)),
    docs: docEdits.map((d) => ({ file: rel(d.file), count: d.count })),
    newErrors: newErrors.slice(0, 50),
    applied: apply && ok,
  }) + "\n",
);
