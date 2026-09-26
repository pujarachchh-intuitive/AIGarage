// Loads a few plain TypeScript modules from lib/ into Node, without a bundler
// or a new dependency. It compiles each file with the project's own TypeScript
// compiler into a temp folder, rewrites "@/lib/x" imports to the compiled
// copies, and imports the result.
//
// Used by the impact engine tests (scripts/test-impact.mjs) and benchmarks.
// Only works for modules that do not import React, Next.js or node_modules.

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Compiles lib/<name>.ts and every @/lib module it imports. Returns the module. */
export async function loadLib(name) {
  const out = mkdtempSync(path.join(tmpdir(), "systemdna-lib-"));
  const done = new Set();
  const compile = (mod) => {
    if (done.has(mod)) return;
    done.add(mod);
    const src = readFileSync(path.join(WEB, "lib", `${mod}.ts`), "utf8");
    const { outputText } = ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
      fileName: `${mod}.ts`,
    });
    // "@/lib/layers" -> "./layers.mjs" (types-only imports are already gone).
    const js = outputText.replace(/from\s+["']@\/lib\/([\w/-]+)["']/g, (_, dep) => {
      compile(dep);
      const rel = path.relative(path.dirname(path.join(out, `${mod}.mjs`)), path.join(out, `${dep}.mjs`)).replace(/\\/g, "/");
      return `from "${rel.startsWith(".") ? rel : `./${rel}`}"`;
    });
    const file = path.join(out, `${mod}.mjs`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, js);
  };
  compile(name);
  return import(pathToFileURL(path.join(out, `${name}.mjs`)).href);
}

export { WEB };
