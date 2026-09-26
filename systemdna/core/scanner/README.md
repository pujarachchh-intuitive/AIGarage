# SystemDNA TypeScript scanner

Builds a SystemDNA `graph.json` (PRD section 7) from a TypeScript or Next.js repo.

It uses the TypeScript language service, the same engine behind "Find all references" in VS Code. So links come from the compiler, not from text search. That is why it can tell two fields with the same name apart, which grep cannot.

## Run it

```bash
npm install
node ts-scan.mjs <repo-dir> <out-file.json> [--repo-name name] [--progress] [--max-files 2500]
```

- `--progress` prints one JSON line per step (the upload screen reads these).
- `--max-files` caps how many code files are scanned (default 2,500).
- Works with or without a `tsconfig.json`. It never runs code from the repo.

Example, from this folder:

```bash
node ts-scan.mjs ../../samples/marketplace-dashboard ../../web/lib/mock/marketplace-dashboard.graph.json
```

On `marketplace-dashboard` it reads 31 code files in about 4 seconds and writes 202 nodes and 643 links.

## Rename agent

```bash
node ts-rename.mjs <repo-dir> --field Type.field --to newName [--apply]
```

Uses the compiler's rename, adds `keyof` string keys and docs that name the field, then checks every file that mentions the old name for **new** type errors. With `--apply` it writes the edits only if that check passes. It prints one JSON result: edits per file, docs, string keys, and any new errors. The GitHub agent in the web app runs it on a fresh clone before opening a pull request.

## What it finds

| Pass | What it does | Links it adds |
| --- | --- | --- |
| 1. Declarations | Interfaces and their fields, type aliases, functions, constants, seed datasets, component files, route pages | Nodes only |
| 2. References | For every field, function, dataset and component, asks the compiler for all references. Each reference is owned by the function, component or page it sits in | Field -> code that uses it (`rename_ref`). Function or component -> its callers (`passthrough`). Function -> fields of the type it returns (`passthrough`) |
| 2b. String keys | Finds string literals typed as `keyof SomeInterface`, such as `key: "totalMau"` in `KpiStrip.tsx`. Find-references misses these, but a rename still breaks them | Field -> code (`rename_ref`) |
| 3. Docs | A markdown line that names both the type and the field | Field -> doc (`update_doc`, medium confidence) |
| 3b. Business use | The README route table (route and purpose) | Page -> business use (`rename_ref`) |
| 4. Grep index | Which files contain each field name as plain text | `textIndex` in the graph, used for the grep comparison |

## Layers it assigns

Found from common folder names (a leading `src/` is ignored). Only layers the repo uses appear.

| Layer | Files |
| --- | --- |
| `types` | `types.ts`, `types/`, `models/`, `entities/`, `schemas/` (needs approval) |
| `data` | `data/`, `seed`, `fixtures`, `mocks` |
| `logic` | `lib/`, `utils/`, `services/`, `hooks/`, and anything else |
| `api` | `app/**/route.ts`, `pages/api/`, `api/`, `routes/`, `controllers/` |
| `components` | `components/`, `ui/`, `views/`, other `.tsx` files |
| `pages` | `app/**/page.tsx`, `layout.tsx`, `pages/**` |
| `business` | from the README route table |
| `quality` | tests (`*.test.*`, `tests/`) and markdown docs |

Tested on `marketplace-dashboard` (Next.js), `sindresorhus/ky` and `pmndrs/zustand` (libraries with `src/`).

## Limits

- Bob's Cartographer pass (links the parser cannot see, PRD section 7 pass 3) is not part of this script. Every link here comes from the parser.
- No test files exist in the sample repo, so every node is marked untested.
- Owners and personal-data flags are not set. In the PRD, Bob adds them from docs.
