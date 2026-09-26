# SystemDNA TypeScript scanner

Builds a SystemDNA `graph.json` (PRD section 7) from a TypeScript or Next.js repo.

It uses the TypeScript language service, the same engine behind "Find all references" in VS Code. So links come from the compiler, not from text search. That is why it can tell two fields with the same name apart, which grep cannot.

## Run it

```bash
npm install
node ts-scan.mjs <repo-dir> <out-file.json> [--repo-name name]
```

Example, from this folder:

```bash
node ts-scan.mjs ../../samples/marketplace-dashboard ../../web/lib/mock/marketplace-dashboard.graph.json
```

On `marketplace-dashboard` it reads 30 files in about 5 seconds and writes 201 nodes and 643 links.

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

| Layer | Files |
| --- | --- |
| `types` | `lib/types.ts` (needs approval) |
| `data` | `data/**` |
| `logic` | other `lib/**` |
| `components` | `components/**` |
| `pages` | `app/**/page.tsx`, `app/layout.tsx` |
| `business` | from the README route table |
| `quality` | markdown docs |

The layer rules match the layout of `marketplace-dashboard`. Other repos may need different rules in `layerOf()`.

## Limits

- Bob's Cartographer pass (links the parser cannot see, PRD section 7 pass 3) is not part of this script. Every link here comes from the parser.
- No test files exist in the sample repo, so every node is marked untested.
- Owners and personal-data flags are not set. In the PRD, Bob adds them from docs.
