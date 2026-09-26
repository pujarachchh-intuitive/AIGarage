// SystemDNA TypeScript scanner.
//
// Builds a graph.json (PRD section 7) for a TypeScript / Next.js repo.
// It uses the TypeScript language service, so links come from the compiler's
// own "find references", not from text search. That is why it can tell two
// different fields with the same name apart.
//
// Usage:
//   node ts-scan.mjs <repo-dir> <out-file.json> [--repo-name name]
//
// Layers (districts on the city map):
//   types       lib/types.ts                 shared type contracts
//   data        data/**                      seed data
//   logic       lib/** (not types.ts)        data layer functions and derived types
//   components  components/**                React components
//   pages       app/**/page.tsx, layout.tsx  routes
//   business    README route table           what each page is used for
//   quality     *.md docs                    docs that describe the types

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const [, , repoArg, outArg, ...rest] = process.argv;
if (!repoArg || !outArg) {
  console.error("Usage: node ts-scan.mjs <repo-dir> <out-file.json> [--repo-name name]");
  process.exit(1);
}
const root = path.resolve(repoArg);
const nameFlag = rest.indexOf("--repo-name");
const repoName = nameFlag >= 0 ? rest[nameFlag + 1] : path.basename(root);
const rel = (f) => path.relative(root, f).split(path.sep).join("/");

// ---------------------------------------------------------------------------
// Language service over the repo's own tsconfig.
// ---------------------------------------------------------------------------
const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
if (!configPath) throw new Error(`No tsconfig.json in ${root}`);
const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, root);
const files = parsed.fileNames.filter((f) => {
  const r = rel(f);
  return !r.startsWith("node_modules/") && !r.startsWith(".next/") && r !== "next-env.d.ts" && /^(app|components|lib|data)\//.test(r);
});

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

function layerOf(r) {
  if (r === "lib/types.ts") return "types";
  if (r.startsWith("data/")) return "data";
  if (r.startsWith("lib/")) return "logic";
  if (r.startsWith("components/")) return "components";
  if (r.startsWith("app/")) return "pages";
  return "quality";
}

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
  // app/products/[id]/page.tsx -> /products/[id]
  if (r === "app/layout.tsx") return "layout";
  const dir = path.posix.dirname(r).replace(/^app/, "");
  return dir === "" ? "/" : dir;
}

/** The asset or field that owns a position in a file. */
function ownerAt(fileName, pos) {
  const r = rel(fileName);
  const layer = layerOf(r);
  if (layer === "components") return `comp:${r}`;
  if (layer === "pages") return `page:${routeOf(r)}`;
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

for (const f of files) {
  const sf = program.getSourceFile(f);
  if (!sf) continue;
  const r = rel(f);
  const layer = layerOf(r);

  if (layer === "components") {
    const name = path.posix.basename(r).replace(/\.tsx?$/, "");
    addNode({ id: `comp:${r}`, type: "Component", layer, name, file: r, line: 1 });
  }
  if (layer === "pages") {
    if (!/\/(page|layout)\.tsx$/.test(r)) continue;
    const route = routeOf(r);
    addNode({ id: `page:${route}`, type: "Page", layer, name: route === "layout" ? "Root layout" : route, file: r, line: 1 });
  }

  for (const stmt of sf.statements) {
    if (ts.isInterfaceDeclaration(stmt)) {
      const id = `type:${stmt.name.text}`;
      addNode({ id, type: "TSType", layer: layer === "types" ? "types" : layer, name: stmt.name.text, file: r, line: lineOf(sf, stmt.getStart(sf)), criticality: layer === "types" ? "high" : "medium" });
      addRange(sf, stmt, id);
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
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      const id = `type:${stmt.name.text}`;
      addNode({ id, type: "TSType", layer, name: stmt.name.text, file: r, line: lineOf(sf, stmt.getStart(sf)), criticality: layer === "types" ? "high" : "medium" });
      addRange(sf, stmt, id);
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
  if (layer === "components") {
    for (const stmt of sf.statements) {
      if (ts.isFunctionDeclaration(stmt) && stmt.name) declared.push({ id: `comp:${r}`, sf, nameNode: stmt.name, kind: "symbol" });
    }
  }
}

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

for (const d of declared) {
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
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === ".next") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const allFiles = walk(root);
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
const textFiles = allFiles.filter((f) => /\.(tsx?|mdx?|json|ya?ml|css)$/.test(f) && !f.endsWith("package-lock.json"));
const texts = textFiles.map((f) => [rel(f), fs.readFileSync(f, "utf8")]);
const textIndex = {};
for (const word of new Set(fields.map((n) => n.name.split(".")[1]))) {
  const re = new RegExp(`\\b${word}\\b`);
  textIndex[word] = texts.filter(([, t]) => re.test(t)).map(([r]) => r);
}

// ---------------------------------------------------------------------------
// Pass 5: files for the 3D city (one building per file).
// Lines of code, language, top-level folder, and resolved local imports.
// ---------------------------------------------------------------------------
const LANGUAGE = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", md: "markdown", mdx: "markdown", json: "json", css: "css", yml: "yaml", yaml: "yaml" };
const cityFiles = allFiles
  .map((f) => ({ f, r: rel(f), ext: path.extname(f).slice(1).toLowerCase() }))
  .filter(({ r, ext }) => LANGUAGE[ext] && !r.split("/").some((p) => p.startsWith(".")) && !/(^|\/)package-lock\.json$/.test(r) && r !== "next-env.d.ts" && !r.startsWith("public/"))
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
const graph = {
  repo: repoName,
  scannedAt: new Date().toISOString(),
  layers: [
    { id: "types", label: "Types", column: 0, requiresApproval: true, check: "tsc passed" },
    { id: "data", label: "Seed data", column: 1, check: "tsc passed; seed rows match the type" },
    { id: "logic", label: "Data layer", column: 2, check: "tsc passed" },
    { id: "components", label: "Components", column: 3, check: "tsc and eslint passed" },
    { id: "pages", label: "Pages", column: 4, check: "next build passed" },
    { id: "business", label: "Business use", column: 5, check: "Read-only" },
    { id: "quality", label: "Docs", column: -1, check: "Doc links resolve" },
  ],
  nodes: [...nodes.values()],
  edges: [...edges.values()],
  textIndex,
  files: cityFiles,
};

fs.mkdirSync(path.dirname(path.resolve(outArg)), { recursive: true });
fs.writeFileSync(outArg, JSON.stringify(graph, null, 2) + "\n");

const count = (t) => graph.nodes.filter((n) => n.type === t).length;
console.log(
  `Scanned ${files.length} files in ${repoName}: ${graph.nodes.length} nodes ` +
    `(${count("TSType")} types, ${count("TSField")} fields, ${count("Function")} functions, ` +
    `${count("Component")} components, ${count("Page")} pages, ${count("Doc")} docs, ` +
    `${count("BusinessProcess")} business uses), ${graph.edges.length} edges, ` +
    `${cityFiles.length} files, ${cityFiles.reduce((n, x) => n + x.imports.length, 0)} imports -> ${outArg}`,
);
