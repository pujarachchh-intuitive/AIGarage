// SystemDNA TypeScript scanner.
//
// Builds a graph.json (PRD section 7) for a TypeScript or JavaScript repo.
// It uses the TypeScript language service, so links come from the compiler's
// own "find references", not from text search. That is why it can tell two
// different fields with the same name apart.
//
// Usage:
//   node ts-scan.mjs <repo-dir> <out-file.json> [--repo-name name] [--progress] [--max-files 2500]
//
//   --progress   print one JSON line per step on stdout (used by the upload screen)
//
// It never runs code from the repo: no install, no build, no scripts. It only reads files.
//
// Layers (districts on the city map), found from common folder names:
//   types       types.ts, types/, models/, entities/, schemas/   shared type contracts
//   data        data/, seed, fixtures, mocks                      data files
//   logic       lib/, utils/, services/, hooks/, and the rest     functions and derived types
//   api         app/**/route.ts, api/, routes/, controllers/      request handlers
//   components  components/, other .tsx files                     React components
//   pages       app/**/page.tsx, layout.tsx, pages/**             routes
//   business    README route table                               what each page is used for
//   quality     tests and *.md docs                               tests and docs

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const [, , repoArg, outArg, ...rest] = process.argv;
if (!repoArg || !outArg) {
  console.error("Usage: node ts-scan.mjs <repo-dir> <out-file.json> [--repo-name name]");
  process.exit(1);
}
const root = path.resolve(repoArg);
const flag = (name) => rest.indexOf(name);
const repoName = flag("--repo-name") >= 0 ? rest[flag("--repo-name") + 1] : path.basename(root);
const showProgress = flag("--progress") >= 0;
const maxFiles = flag("--max-files") >= 0 ? Number(rest[flag("--max-files") + 1]) : 2500;
const rel = (f) => path.relative(root, f).split(path.sep).join("/");
const started = Date.now();

/** One JSON line per step, read by the upload screen. */
function progress(step, detail, extra = {}) {
  if (showProgress) process.stdout.write(JSON.stringify({ step, detail, ms: Date.now() - started, ...extra }) + "\n");
}

// Folders that never hold source we should read.
const IGNORED_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "out", "coverage", ".turbo", ".vercel", "vendor", "target", "__pycache__", ".venv", "venv", ".cache", "storybook-static"]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(e.name) || e.isSymbolicLink()) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const CODE_EXT = /\.(tsx?|jsx?|mjs|cjs)$/;
const isScannable = (r) =>
  CODE_EXT.test(r) && !r.endsWith(".d.ts") && r !== "next-env.d.ts" && !r.split("/").some((part) => part.startsWith(".") || IGNORED_DIRS.has(part));

progress("files", "Listing files");
const allFiles = walk(root);

// ---------------------------------------------------------------------------
// Language service over the repo's own tsconfig (or sensible defaults).
// ---------------------------------------------------------------------------
const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json") ?? ts.findConfigFile(root, ts.sys.fileExists, "jsconfig.json");
const insideRoot = configPath && !path.relative(root, configPath).startsWith("..");
const parsed = insideRoot
  ? ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, path.dirname(configPath))
  : {
      options: {
        allowJs: true,
        jsx: ts.JsxEmit.Preserve,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        baseUrl: root,
        paths: { "@/*": ["./*", "./src/*"], "~/*": ["./*", "./src/*"] },
      },
      fileNames: [],
    };
parsed.options.allowJs = true;
// Some tsconfigs include nothing (for example a root config with project references): fall back to every code file.
let codeFiles = parsed.fileNames.filter((f) => isScannable(rel(f)));
if (codeFiles.length === 0) codeFiles = allFiles.filter((f) => isScannable(rel(f)));
const truncated = codeFiles.length > maxFiles;
const files = codeFiles.sort().slice(0, maxFiles);
progress("files", `${files.length} code files${truncated ? ` (capped at ${maxFiles})` : ""}, ${allFiles.length} files in total`, { codeFiles: files.length, totalFiles: allFiles.length, truncated });

const host = {
  getScriptFileNames: () => files,
  getScriptVersion: () => "1",
  getScriptSnapshot: (f) => (fs.existsSync(f) ? ts.ScriptSnapshot.fromString(fs.readFileSync(f, "utf8")) : undefined),
  getCurrentDirectory: () => root,
  getCompilationSettings: () => ({ ...parsed.options, noEmit: true }),
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
};
const ls = ts.createLanguageService(host, ts.createDocumentRegistry());
const program = ls.getProgram();
const checker = program.getTypeChecker();

// ---------------------------------------------------------------------------
// Graph building helpers.
// ---------------------------------------------------------------------------
const nodes = new Map();
const edges = new Map();
/** For each source file: list of { start, end, id } top-level ranges. */
const ranges = new Map();

/** Path without a leading src/ (many repos keep everything in src/). */
const stripSrc = (r) => r.replace(/^src\//, "");

function layerOf(r) {
  const p = stripSrc(r);
  if (!CODE_EXT.test(p)) return "quality";
  if (/(^|\/)(__tests__|tests?|e2e|cypress)\/|\.(test|spec)\.[jt]sx?$/.test(p)) return "quality";
  if (/(^|\/)types?\.[jt]sx?$|(^|\/)(types|models|entities|schemas?)\//.test(p)) return "types";
  if (/^app\/(.*\/)?route\.[jt]sx?$|^pages\/api\/|(^|\/)(api|routes|controllers|handlers)\//.test(p)) return "api";
  if (/^app\/(.*\/)?(page|layout)\.[jt]sx?$|^pages\//.test(p)) return "pages";
  if (/^(data|seeds?|fixtures|mocks?)\/|(^|\/)(seed|fixtures?)\.[jt]sx?$/.test(p)) return "data";
  if (/(^|\/)(components?|ui|views|widgets)\//.test(p) || (/^app\//.test(p) && /\.[jt]sx$/.test(p))) return "components";
  if (/\.[jt]sx$/.test(p) && !/(^|\/)(lib|utils?|hooks|services|store)\//.test(p)) return "components";
  return "logic";
}

/** Layers where the whole file is one building (not split into functions). */
const FILE_LAYERS = new Set(["components", "pages", "api", "quality"]);

function lineOf(sf, pos) {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

function addNode(n) {
  if (!nodes.has(n.id)) {
    nodes.set(n.id, { pii: false, tested: false, criticality: "medium", ...n });
  }
  return nodes.get(n.id);
}

function addEdge(from, to, type, rule, evidence, confidence = "high") {
  if (!from || !to || from === to) return;
  const key = `${from}->${to}`;
  if (edges.has(key)) return;
  edges.set(key, { id: `e${edges.size + 1}`, from, to, type, rule, evidence, source: "parser", confidence });
}

function addRange(sf, node, id) {
  const r = rel(sf.fileName);
  if (!ranges.has(r)) ranges.set(r, []);
  ranges.get(r).push({ start: node.getStart(sf), end: node.getEnd(), id });
}

function routeOf(r) {
  const p = stripSrc(r);
  // App router: app/products/[id]/page.tsx -> /products/[id]; app/layout.tsx -> layout
  if (p.startsWith("app/")) {
    if (/^app\/layout\.[jt]sx?$/.test(p)) return "layout";
    const dir = path.posix.dirname(p).replace(/^app/, "").replace(/\/\([^)]*\)/g, "");
    const route = dir === "" ? "/" : dir;
    return /\/layout\.[jt]sx?$/.test(p) ? `${route} (layout)` : route;
  }
  // Pages router: pages/about.tsx -> /about; pages/index.tsx -> /; pages/_app.tsx -> layout
  if (/^pages\/_(app|document)\./.test(p)) return "layout";
  const route = "/" + p.replace(/^pages\//, "").replace(/\.[jt]sx?$/, "").replace(/(^|\/)index$/, "");
  return route.replace(/\/$/, "") || "/";
}

function fileAssetId(r, layer) {
  if (layer === "components") return `comp:${r}`;
  if (layer === "pages") return `page:${routeOf(r)}`;
  if (layer === "api") return `api:${r}`;
  return `test:${r}`;
}

/** The asset or field that owns a position in a file. */
function ownerAt(fileName, pos) {
  const r = rel(fileName);
  const layer = layerOf(r);
  if (FILE_LAYERS.has(layer)) return fileAssetId(r, layer);
  const list = ranges.get(r) ?? [];
  // Innermost range wins (a field inside its interface).
  let best = null;
  for (const x of list) {
    if (pos >= x.start && pos < x.end && (!best || x.end - x.start < best.end - best.start)) best = x;
  }
  return best?.id ?? null;
}

// ---------------------------------------------------------------------------
// Pass 1: declarations -> nodes.
// ---------------------------------------------------------------------------
const declared = []; // { id, sf, nameNode, kind }
const typeDecls = []; // interfaces, classes and type aliases: { id, sf, nameNode }

for (const f of files) {
  const sf = program.getSourceFile(f);
  if (!sf) continue;
  const r = rel(f);
  const layer = layerOf(r);

  const base = path.posix.basename(r).replace(/\.[jt]sx?$/, "");
  if (layer === "components") addNode({ id: `comp:${r}`, type: "Component", layer, name: base, file: r, line: 1 });
  if (layer === "api") addNode({ id: `api:${r}`, type: "Endpoint", layer, name: stripSrc(r), file: r, line: 1, criticality: "high" });
  if (layer === "quality") addNode({ id: `test:${r}`, type: "Test", layer, name: path.posix.basename(r), file: r, line: 1 });
  if (layer === "pages") {
    const route = routeOf(r);
    addNode({ id: `page:${route}`, type: "Page", layer, name: route === "layout" ? "Root layout" : route, file: r, line: 1 });
  }

  for (const stmt of sf.statements) {
    if (ts.isInterfaceDeclaration(stmt)) {
      const id = `type:${stmt.name.text}`;
      addNode({ id, type: "TSType", layer: layer === "types" ? "types" : layer, name: stmt.name.text, file: r, line: lineOf(sf, stmt.getStart(sf)), criticality: layer === "types" ? "high" : "medium" });
      addRange(sf, stmt, id);
      typeDecls.push({ id, sf, nameNode: stmt.name });
      for (const m of stmt.members) {
        if (!ts.isPropertySignature(m) || !m.name || !ts.isIdentifier(m.name)) continue;
        const fid = `field:${stmt.name.text}.${m.name.text}`;
        addNode({ id: fid, type: "TSField", layer: nodes.get(id).layer, name: `${stmt.name.text}.${m.name.text}`, file: r, line: lineOf(sf, m.getStart(sf)), parent: id });
        addRange(sf, m, fid);
        declared.push({ id: fid, sf, nameNode: m.name, kind: "field" });
        // Field typed with a named alias (e.g. status: Status).
        if (m.type && ts.isTypeReferenceNode(m.type) && ts.isIdentifier(m.type.typeName)) {
          declared.push({ id: fid, sf, typeRef: m.type.typeName.text, kind: "typed" });
        }
      }
    } else if (ts.isClassDeclaration(stmt) && stmt.name && !FILE_LAYERS.has(layer)) {
      const id = `type:${stmt.name.text}`;
      addNode({ id, type: "TSType", layer, name: stmt.name.text, file: r, line: lineOf(sf, stmt.getStart(sf)), criticality: layer === "types" ? "high" : "medium" });
      addRange(sf, stmt, id);
      typeDecls.push({ id, sf, nameNode: stmt.name });
      for (const m of stmt.members) {
        if (!ts.isPropertyDeclaration(m) || !m.name || !ts.isIdentifier(m.name)) continue;
        const fid = `field:${stmt.name.text}.${m.name.text}`;
        addNode({ id: fid, type: "TSField", layer, name: `${stmt.name.text}.${m.name.text}`, file: r, line: lineOf(sf, m.getStart(sf)), parent: id });
        addRange(sf, m, fid);
        declared.push({ id: fid, sf, nameNode: m.name, kind: "field" });
      }
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      const id = `type:${stmt.name.text}`;
      addNode({ id, type: "TSType", layer, name: stmt.name.text, file: r, line: lineOf(sf, stmt.getStart(sf)), criticality: layer === "types" ? "high" : "medium" });
      addRange(sf, stmt, id);
      typeDecls.push({ id, sf, nameNode: stmt.name });
    } else if (ts.isFunctionDeclaration(stmt) && stmt.name && (layer === "logic" || layer === "types")) {
      const id = `fn:${stmt.name.text}`;
      addNode({ id, type: "Function", layer, name: `${stmt.name.text}()`, file: r, line: lineOf(sf, stmt.getStart(sf)) });
      addRange(sf, stmt, id);
      declared.push({ id, sf, nameNode: stmt.name, kind: "symbol", decl: stmt });
    } else if (ts.isVariableStatement(stmt) && (layer === "data" || layer === "logic" || layer === "types")) {
      for (const d of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const id = layer === "data" ? `data:${d.name.text}` : `const:${d.name.text}`;
        addNode({ id, type: layer === "data" ? "Dataset" : "Constant", layer, name: d.name.text, file: r, line: lineOf(sf, d.getStart(sf)) });
        addRange(sf, stmt, id);
        declared.push({ id, sf, nameNode: d.name, kind: "symbol" });
      }
    }
  }

  // Exported components: link their names so usages point back to the file.
  if (FILE_LAYERS.has(layer) && layer !== "quality") {
    const owner = fileAssetId(r, layer);
    for (const stmt of sf.statements) {
      if ((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) && stmt.name) declared.push({ id: owner, sf, nameNode: stmt.name, kind: "symbol" });
      if (ts.isVariableStatement(stmt) && stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        for (const d of stmt.declarationList.declarations) if (ts.isIdentifier(d.name)) declared.push({ id: owner, sf, nameNode: d.name, kind: "symbol" });
      }
    }
  }
}
progress("parse", `Read ${nodes.size} declarations`, { nodes: nodes.size });

// ---------------------------------------------------------------------------
// Pass 2: references -> edges.
// ---------------------------------------------------------------------------
function referencesOf(sf, nameNode) {
  const found = ls.findReferences(sf.fileName, nameNode.getStart(sf)) ?? [];
  const out = [];
  for (const group of found) {
    for (const ref of group.references) {
      if (ref.isDefinition) continue;
      const refSf = program.getSourceFile(ref.fileName);
      if (!refSf || !files.includes(ref.fileName)) continue;
      out.push({ fileName: ref.fileName, pos: ref.textSpan.start, line: lineOf(refSf, ref.textSpan.start) });
    }
  }
  return out;
}

function isInsideImport(sf, pos) {
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && pos >= stmt.getStart(sf) && pos < stmt.getEnd()) return true;
  }
  return false;
}

/** Interfaces a function returns (unwraps arrays, undefined, Map values). */
function returnedInterfaces(decl) {
  const sig = checker.getSignatureFromDeclaration(decl);
  if (!sig) return [];
  const names = new Set();
  const visit = (t, depth = 0) => {
    if (!t || depth > 3) return;
    if (t.isUnion()) return t.types.forEach((x) => visit(x, depth + 1));
    const sym = t.getSymbol() ?? t.aliasSymbol;
    if (sym && nodes.has(`type:${sym.getName()}`)) names.add(sym.getName());
    if (checker.isArrayType?.(t)) visit(checker.getTypeArguments(t)[0], depth + 1);
    const args = t.aliasTypeArguments ?? (t.target ? checker.getTypeArguments(t) : []);
    for (const a of args ?? []) visit(a, depth + 1);
  };
  visit(checker.getReturnTypeOfSignature(sig));
  return [...names];
}

let refDone = 0;
for (const d of declared) {
  if (++refDone % 100 === 0) progress("references", `Linked ${refDone} of ${declared.length} declarations`, { done: refDone, total: declared.length });
  if (d.kind === "typed") {
    if (nodes.has(`type:${d.typeRef}`)) addEdge(`type:${d.typeRef}`, d.id, "TYPED_AS", "update_type", `${rel(d.sf.fileName)}:${nodes.get(d.id).line}`);
    continue;
  }
  for (const ref of referencesOf(d.sf, d.nameNode)) {
    const refSf = program.getSourceFile(ref.fileName);
    if (isInsideImport(refSf, ref.pos)) continue;
    const owner = ownerAt(ref.fileName, ref.pos);
    if (!owner || !nodes.has(owner)) continue;
    const evidence = `${rel(ref.fileName)}:${ref.line}`;
    if (d.kind === "field") {
      // A direct use of the field: that code must change when the field is renamed.
      const type = layerOf(rel(ref.fileName)) === "data" ? "WRITES" : "READS";
      addEdge(d.id, owner, type, "rename_ref", evidence);
    } else {
      // Calling a function or rendering a component does not break when its insides change.
      const target = nodes.get(owner);
      const type = target.type === "Component" || target.type === "Page" ? "IMPORTS" : "CALLS";
      addEdge(d.id, owner, type, "passthrough", evidence);
    }
  }
  // A function "produces" the fields of the interfaces it returns.
  if (d.decl && ts.isFunctionDeclaration(d.decl)) {
    for (const name of returnedInterfaces(d.decl)) {
      for (const n of nodes.values()) {
        if (n.parent === `type:${name}`) addEdge(d.id, n.id, "RETURNS", "passthrough", `${rel(d.sf.fileName)}:${nodes.get(d.id).line}`);
      }
    }
  }
}

// Uses of a type (annotations, generics, implements). After the pass above, so a
// field typed with an alias keeps its TYPED_AS link. Using a type does not break
// when the type changes inside, so these are passthrough links.
for (const d of typeDecls) {
  for (const ref of referencesOf(d.sf, d.nameNode)) {
    const refSf = program.getSourceFile(ref.fileName);
    if (isInsideImport(refSf, ref.pos)) continue;
    const owner = ownerAt(ref.fileName, ref.pos);
    if (owner && nodes.has(owner)) addEdge(d.id, owner, "CONSUMES", "passthrough", `${rel(ref.fileName)}:${ref.line}`);
  }
}

progress("references", `Found ${edges.size} links`, { edges: edges.size });

// String keys typed as `keyof SomeInterface` (e.g. key: "totalMau").
// Find-references does not return these, but they break just the same.
const propNames = new Map(); // "a|b|c" -> interface name
for (const n of nodes.values()) {
  if (n.type !== "TSType") continue;
  const names = [...nodes.values()].filter((x) => x.parent === n.id).map((x) => x.name.split(".")[1]).sort();
  if (names.length > 1) propNames.set(names.join("|"), n.name);
}
for (const f of files) {
  const sf = program.getSourceFile(f);
  if (!sf) continue;
  const visit = (node) => {
    if (ts.isStringLiteral(node)) {
      const ctx = checker.getContextualType(node);
      if (ctx && ctx.isUnion() && ctx.types.every((t) => t.isStringLiteral())) {
        const key = ctx.types.map((t) => t.value).sort().join("|");
        const iface = propNames.get(key);
        const fid = iface ? `field:${iface}.${node.text}` : null;
        const owner = ownerAt(f, node.getStart(sf));
        if (fid && nodes.has(fid) && owner) addEdge(fid, owner, "READS", "rename_ref", `${rel(f)}:${lineOf(sf, node.getStart(sf))} (string key)`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// ---------------------------------------------------------------------------
// Pass 3: docs and business use (from markdown).
// ---------------------------------------------------------------------------
progress("docs", "Reading docs");
const docFiles = allFiles.filter((f) => f.endsWith(".md") && !["AGENTS.md", "CLAUDE.md"].includes(path.basename(f)));
const fields = [...nodes.values()].filter((n) => n.type === "TSField");

for (const f of docFiles) {
  const r = rel(f);
  const text = fs.readFileSync(f, "utf8");
  const lines = text.split(/\r?\n/);
  const docId = `doc:${r}`;
  addNode({ id: docId, type: "Doc", layer: "quality", name: path.posix.basename(r), file: r, line: 1 });
  // A doc describes a field when one line names both the type and the field.
  for (const fld of fields) {
    const [typeName, fieldName] = fld.name.split(".");
    const re = new RegExp(`\\b${fieldName}\\b`);
    const i = lines.findIndex((l) => l.includes(typeName) && re.test(l));
    if (i >= 0) addEdge(fld.id, docId, "DOCUMENTS", "update_doc", `${r}:${i + 1}`, "medium");
  }
}

// ---------------------------------------------------------------------------
// Pass 4: database schema (Prisma schemas and SQL files).
// Tables and columns become nodes in the "database" district. A column links to
// the code that uses it: TS files that name both the column and its table or
// model, SQL files that are not migrations, TS fields with the same name on a
// type of the same name, and docs. Old migrations are history: never linked.
// ---------------------------------------------------------------------------
progress("docs", "Reading database schemas");
const PII_NAME = /(^|_)(e?mail|phone|mobile|address|street|zip|postcode|first_?name|last_?name|full_?name|ssn|dob|birth|passport|password|ip_?address)(_|$)/i;
const GENERIC_COLUMN = /^(id|uuid|name|type|status|state|kind|value|data|created_?at|updated_?at|deleted_?at|createdAt|updatedAt|deletedAt)$/;
const isMigration = (r) => /(^|\/)migrations?\//i.test(r);
const words = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
/** Names code may use for a table or model: users, user, Users, User. */
function tableAliases(name) {
  const base = words(name).replace(/^.*\./, "");
  const singular = base.replace(/ies$/, "y").replace(/s$/, "");
  const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return [...new Set([base, singular, `${singular}s`, camel(base), camel(singular)])].filter((a) => a.length > 1);
}
const tables = new Map(); // table id -> { name, aliases }
function addTable(name, file, line) {
  const id = `db:table:${name}`;
  if (!tables.has(id)) {
    addNode({ id, type: "Table", layer: "database", name, file, line, criticality: "high" });
    tables.set(id, { name, aliases: tableAliases(name) });
  }
  return id;
}
function addColumn(table, column, file, line) {
  const id = `db:column:${table}.${column}`;
  addNode({ id, type: "Column", layer: "database", name: `${table}.${column}`, file, line, parent: `db:table:${table}`, criticality: "high", pii: PII_NAME.test(words(column)) });
  return id;
}

// Prisma: model Name { field Type ... }. Relation fields (another model's type) are skipped.
const PRISMA_SCALARS = new Set(["String", "Int", "BigInt", "Float", "Decimal", "Boolean", "DateTime", "Json", "Bytes"]);
for (const f of allFiles.filter((x) => x.endsWith(".prisma"))) {
  const r = rel(f);
  const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
  const enums = new Set(lines.map((l) => l.match(/^\s*enum\s+(\w+)/)?.[1]).filter(Boolean));
  let model = null;
  lines.forEach((l, i) => {
    const m = l.match(/^\s*model\s+(\w+)\s*\{/);
    if (m) {
      model = m[1];
      addTable(model, r, i + 1);
      return;
    }
    if (/^\s*\}/.test(l)) model = null;
    if (!model) return;
    const fld = l.match(/^\s*(\w+)\s+(\w+)(\[\])?\??/);
    if (fld && (PRISMA_SCALARS.has(fld[2]) || enums.has(fld[2])) && !fld[3]) addColumn(model, fld[1], r, i + 1);
  });
}

// SQL: CREATE TABLE name (...) and ALTER TABLE name ADD [COLUMN] col.
const sqlFiles = allFiles.filter((x) => x.endsWith(".sql") && fs.statSync(x).size < 1_000_000);
const SQL_NOT_COLUMN = /^(primary|foreign|constraint|unique|check|key|index|exclude|like)$/i;
const ident = (s) => s.replace(/["`[\]]/g, "").split(".").pop();
for (const f of sqlFiles) {
  const r = rel(f);
  const text = fs.readFileSync(f, "utf8");
  const lineAt = (pos) => text.slice(0, pos).split("\n").length;
  for (const m of text.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."`[\]]+)\s*\(/gi)) {
    const table = ident(m[1]);
    addTable(table, r, lineAt(m.index));
    // Column list: up to the matching close paren.
    let depth = 1;
    let i = m.index + m[0].length;
    const startBody = i;
    while (i < text.length && depth > 0) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")") depth--;
      i++;
    }
    let offset = startBody;
    for (const part of text.slice(startBody, i - 1).split(/,(?![^(]*\))/)) {
      const col = part.trim().match(/^([\w"`[\]]+)\s+\w/);
      if (col && !SQL_NOT_COLUMN.test(ident(col[1]))) addColumn(table, ident(col[1]), r, lineAt(offset + part.indexOf(col[1])));
      offset += part.length + 1;
    }
  }
  for (const m of text.matchAll(/alter\s+table\s+(?:only\s+)?([\w."`[\]]+)\s+add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?([\w"`[\]]+)/gi)) {
    const table = ident(m[1]);
    if (SQL_NOT_COLUMN.test(ident(m[2]))) continue;
    addTable(table, r, lineAt(m.index));
    addColumn(table, ident(m[2]), r, lineAt(m.index));
  }
}

const columns = [...nodes.values()].filter((n) => n.type === "Column" && n.layer === "database").slice(0, 600);
if (columns.length > 0) {
  const wordIn = (w) => new RegExp(`\\b${w.replace(/[$]/g, "\\$")}\\b`);
  const aliasRe = (aliases) => new RegExp(`\\b(${aliases.join("|")})\\b`, "i");
  const tsTexts = files.map((f) => [f, rel(f), fs.readFileSync(f, "utf8")]);
  const tsFields = [...nodes.values()].filter((n) => n.type === "TSField");
  for (const col of columns) {
    const [table, column] = [col.name.slice(0, col.name.lastIndexOf(".")), col.name.slice(col.name.lastIndexOf(".") + 1)];
    const t = tables.get(`db:table:${table}`);
    const colRe = wordIn(column);
    const camel = column.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const tRe = aliasRe(t.aliases.map((a) => a.replace(/[$]/g, "\\$")));
    // A TS field with the same name on a type named like the table (User.email <-> users.email).
    for (const fld of tsFields) {
      const [typeName, fieldName] = fld.name.split(".");
      if ((fieldName === column || fieldName === camel) && t.aliases.some((a) => a.toLowerCase() === typeName.toLowerCase())) {
        addEdge(col.id, fld.id, "MAPS_TO", "rename_ref", `${fld.file}:${fld.line} (${typeName}.${fieldName} maps ${table}.${column})`, "medium");
      }
    }
    // TS code that names the column with the table or model nearby: within 5
    // lines, or on the same line for common names like "id". Fields of types are
    // covered by MAPS_TO above.
    const window = GENERIC_COLUMN.test(column) ? 0 : 5;
    for (const [f, r, text] of tsTexts) {
      if (!tRe.test(text)) continue;
      const lines = text.split("\n");
      for (const name of new Set([column, camel])) {
        const re = new RegExp(`\\b${name}\\b`, "g");
        for (const hit of text.matchAll(re)) {
          const line = text.slice(0, hit.index).split("\n").length;
          if (!tRe.test(lines.slice(Math.max(0, line - 1 - window), line + window).join("\n"))) continue;
          const owner = ownerAt(f, hit.index) ?? [...nodes.values()].find((n) => n.file === r && n.type !== "TSField")?.id;
          if (!owner || owner === col.id || nodes.get(owner)?.type === "TSField" || nodes.get(owner)?.type === "TSType") continue;
          addEdge(col.id, owner, "READS", "rename_ref", `${r}:${line} (column ${column})`, "medium");
        }
      }
    }
    // SQL that is not a migration and not the file that defines the column.
    for (const f of sqlFiles) {
      const r = rel(f);
      if (r === col.file || isMigration(r)) continue;
      const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
      const i = lines.findIndex((l) => colRe.test(l));
      if (i < 0 || !tRe.test(lines.join("\n"))) continue;
      const sqlId = `sql:${r}`;
      addNode({ id: sqlId, type: "SQLModel", layer: "database", name: path.posix.basename(r), file: r, line: 1 });
      addEdge(col.id, sqlId, "READS", "rename_ref", `${r}:${i + 1}`, "medium");
    }
    // Docs that name the table and the column on one line.
    for (const f of docFiles) {
      const r = rel(f);
      const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
      const i = lines.findIndex((l) => colRe.test(l) && tRe.test(l));
      if (i >= 0) addEdge(col.id, `doc:${r}`, "DOCUMENTS", "update_doc", `${r}:${i + 1}`, "medium");
    }
  }
  progress("docs", `${tables.size} tables and ${columns.length} columns`);
}

// Business use: the README route table says what each page is for.
const readme = allFiles.find((f) => rel(f) === "README.md");
if (readme) {
  const lines = fs.readFileSync(readme, "utf8").split(/\r?\n/);
  lines.forEach((l, i) => {
    const m = l.match(/^\|\s*`(\/[^`]*)`\s*\|\s*(.+?)\s*\|\s*$/);
    if (!m) return;
    const [, route, purpose] = m;
    const pageId = `page:${route}`;
    if (!nodes.has(pageId)) return;
    const bizId = `biz:${route}`;
    addNode({ id: bizId, type: "BusinessProcess", layer: "business", name: purpose, file: "README.md", line: i + 1, criticality: route === "/" || route === "/reports" ? "high" : "medium" });
    addEdge(pageId, bizId, "SUPPORTS", "rename_ref", `README.md:${i + 1}`);
  });
}

// ---------------------------------------------------------------------------
// Grep index: which files contain each field name as plain text.
// ---------------------------------------------------------------------------
const textFiles = allFiles.filter((f) => /\.(tsx?|jsx?|mjs|cjs|mdx?|json|ya?ml|css|sql|prisma)$/.test(f) && !/(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(f) && fs.statSync(f).size < 1_000_000);
const texts = textFiles.map((f) => [rel(f), fs.readFileSync(f, "utf8")]);
const textIndex = {};
// Every name a change can target: fields, columns, functions, types, constants.
const shortNames = [...nodes.values()]
  .filter((n) => ["TSField", "Column", "Function", "TSType", "Constant", "Dataset", "Component"].includes(n.type))
  .map((n) => n.name.replace(/\(\)$/, "").split(".").pop());
for (const word of new Set(shortNames)) {
  const re = new RegExp(`\\b${word}\\b`);
  textIndex[word] = texts.filter(([, t]) => re.test(t)).map(([r]) => r);
}

// ---------------------------------------------------------------------------
// Pass 5: files for the 3D city (one building per file).
// Lines of code, language, top-level folder, and resolved local imports.
// ---------------------------------------------------------------------------
progress("imports", "Mapping files and imports for the 3D city");
const LANGUAGE = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", md: "markdown", mdx: "markdown", json: "json", css: "css", yml: "yaml", yaml: "yaml", sql: "sql", prisma: "prisma" };
const cityFiles = allFiles
  .map((f) => ({ f, r: rel(f), ext: path.extname(f).slice(1).toLowerCase() }))
  .filter(({ f, r, ext }) => LANGUAGE[ext] && !r.split("/").some((p) => p.startsWith(".")) && !/(^|\/)(package-lock\.json|pnpm-lock\.yaml)$/.test(r) && r !== "next-env.d.ts" && !r.startsWith("public/") && fs.statSync(f).size < 1_000_000)
  .slice(0, maxFiles * 2)
  .map(({ f, r, ext }) => {
    const text = fs.readFileSync(f, "utf8");
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "").length;
    const imports = new Set();
    if (["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(ext)) {
      for (const imp of ts.preProcessFile(text, true, true).importedFiles) {
        const res = ts.resolveModuleName(imp.fileName, f, parsed.options, ts.sys).resolvedModule;
        if (!res || res.isExternalLibraryImport) continue;
        const target = rel(res.resolvedFileName);
        if (!target.startsWith("..") && !target.includes("node_modules")) imports.add(target);
      }
    }
    return { path: r, dir: r.includes("/") ? r.split("/")[0] : "root", lines, language: LANGUAGE[ext], imports: [...imports] };
  });
const knownPaths = new Set(cityFiles.map((x) => x.path));
for (const x of cityFiles) x.imports = x.imports.filter((p) => knownPaths.has(p));

// ---------------------------------------------------------------------------
// Output.
// ---------------------------------------------------------------------------
// Only the layers this repo actually uses, in data-flow order.
const LAYER_DEFS = [
  { id: "database", label: "Database", requiresApproval: true, check: "Schema edited; new migration added, old ones untouched" },
  { id: "types", label: "Types", requiresApproval: true, check: "tsc passed" },
  { id: "data", label: "Data", check: "tsc passed; data matches the type" },
  { id: "logic", label: "Logic", check: "tsc passed" },
  { id: "api", label: "API", check: "tsc passed; route tests pass" },
  { id: "components", label: "Components", check: "tsc and eslint passed" },
  { id: "pages", label: "Pages", check: "build passed" },
  { id: "business", label: "Business use", check: "Read-only" },
];
const usedLayers = new Set([...nodes.values()].map((n) => n.layer));
let column = 0;
const layers = [
  ...LAYER_DEFS.filter((l) => usedLayers.has(l.id)).map((l) => ({ ...l, column: column++ })),
  { id: "quality", label: "Tests and docs", column: -1, check: "Tests pass; doc links resolve" },
];

progress("write", "Saving the graph");
const graph = {
  repo: repoName,
  scannedAt: new Date().toISOString(),
  layers,
  nodes: [...nodes.values()],
  edges: [...edges.values()],
  textIndex,
  files: cityFiles,
};

fs.mkdirSync(path.dirname(path.resolve(outArg)), { recursive: true });
fs.writeFileSync(outArg, JSON.stringify(graph, null, 2) + "\n");

const count = (t) => graph.nodes.filter((n) => n.type === t).length;
progress("done", "Knowledge graph ready", {
  stats: {
    codeFiles: files.length,
    files: cityFiles.length,
    lines: cityFiles.reduce((n, x) => n + x.lines, 0),
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    imports: cityFiles.reduce((n, x) => n + x.imports.length, 0),
    layers: layers.length,
    truncated,
    ms: Date.now() - started,
  },
});
if (!showProgress) console.log(
  `Scanned ${files.length} files in ${repoName}: ${graph.nodes.length} nodes ` +
    `(${count("TSType")} types, ${count("TSField")} fields, ${count("Function")} functions, ` +
    `${count("Component")} components, ${count("Page")} pages, ${count("Doc")} docs, ` +
    `${count("BusinessProcess")} business uses), ${graph.edges.length} edges, ` +
    `${cityFiles.length} files, ${cityFiles.reduce((n, x) => n + x.imports.length, 0)} imports -> ${outArg}`,
);
