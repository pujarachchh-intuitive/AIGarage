# SystemDNA dashboard (web)

The Agent City dashboard for SystemDNA. It is built with Next.js 16 and follows the HRMS design system (`C:\dev\hrms\DESIGN.md`): zinc first, Geist Sans, the same page shell, tokens, badges, tables and KPI tiles. Colour is used only for state.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. It starts on the Overview page.

## Two data modes

| Mode | When | What happens |
| --- | --- | --- |
| Demo | `NEXT_PUBLIC_API_URL` is not set | Uses a demo graph (see "Demo repos" below). The impact engine runs in the browser (`lib/impact.ts`). Agent runs are simulated (`lib/simulator.ts`) and clearly labelled "Simulated". |
| Live | `NEXT_PUBLIC_API_URL` is set in `.env.local` | Reads `GET /graph`, creates changes with `POST /changes`, starts them with `POST /changes/{id}/run`, approves with `POST /changes/{id}/approve`, and listens to `WS /ws` for events. |

Example `.env.local` for live mode:

```bash
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_DEMO_TOKEN=change-me
```

## Connect your own repository

Open **Repositories**, then **Connect repository** (or pick "+ Connect a repository…" in the top-bar switch).

| Source | How |
| --- | --- |
| Git URL | A public `https://` URL on GitHub, GitLab or Bitbucket, plus an optional branch |
| Upload | A `.zip` of the repo, up to 50 MB (GitHub: Code, then Download ZIP) |

What happens (the page shows each step live):

1. **Get the code.** `git clone --depth 1` (no shell, 2-minute limit, no prompts) or unzip (paths that escape the folder are refused).
2. **Check size.** Up to 40,000 files and 300 MB.
3. **Scan.** `core/scanner/ts-scan.mjs --progress` runs in its own process (4-minute limit). It only reads files: no install, no build, no scripts.
4. **Save.** The graph goes to `web/.data/repos/<id>/graph.json` with an entry in `index.json` (git-ignored).
5. **Clean up.** The temp copy of the code is always deleted.

| Method and path | Does |
| --- | --- |
| `GET /api/repos` | List connected repos |
| `POST /api/repos` | Connect: JSON `{ url, ref? }` or a multipart form with `file`. Streams progress as newline-delimited JSON |
| `GET /api/repos/{id}` | The graph and its entry |
| `POST /api/repos/{id}/rescan` | Pull the latest code and rebuild (git repos) |
| `DELETE /api/repos/{id}` | Remove the repo and its graph |

## Real change runs and pull requests

For a repo on github.com, the change page runs the change for real (`lib/server/change-agent.ts`); samples without code (ShopFlow) keep the simulator.

1. **Approval**: files in protected districts (Database, Types) or with personal data wait for **Approve**.
2. **Run** in a fresh clone, wave by wave:
   - Renames of TypeScript symbols: the TypeScript compiler (`core/scanner/ts-rename.mjs`), one pass, reported per file.
   - Everything else (type change, signature, delete, free text, database changes): one **IBM Bob Fixer** per file with a permit for that file only (plus new migrations for the schema file). Out-of-permit edits are reverted (*Blocked*); each edit is type-checked (`core/scanner/ts-check.mjs`), retried once with the errors, then rolled back if still failing (*Quarantined*). Budget: `BOB_RUN_MAX_COST` Bobcoins.
3. **Verify**: type check of every touched file, then the IBM Bob Inspector reviews the diff.
4. **Pull request** panel: the diff, the review and any remaining type errors. **Open draft pull request** (after you confirm) applies the stored diff to a fresh clone, pushes a new branch `systemdna/<change>` and opens a draft PR. The default branch is never touched, and no agent runs twice.

| Method and path | Does |
| --- | --- |
| `POST /api/changes/run` | `ChangeRunRequest`. Streams `ChangeStreamLine`: run events, status, the Bob review, the diff with a `patchId` |
| `POST /api/changes/pull-request` | `{ patchId, title, body }`. Streams progress, then the PR |
| `GET /api/github/status` | Whether a token is set, and whose (never returns the token) |
| `POST /api/github/pull-requests` | The original field-rename agent: `{ url, field, to, changeId, title, body, dryRun }` |

Opening PRs needs `GITHUB_TOKEN` in `.env.local` (a fine-grained token with Contents and Pull requests write access).

## Settings

Copy `.env.example` to `.env.local`.

| Variable | Default | Use |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | empty | FastAPI backend (live mode) |
| `SYSTEMDNA_DATA_DIR` | `web/.data` | Where graphs are stored |
| `SYSTEMDNA_SCANNER` | `../core/scanner/ts-scan.mjs` | Scanner path (run `npm install` there once) |
| `GITHUB_TOKEN` | empty | Lets the GitHub agent push branches and open draft PRs |
| `BOB_API_KEY` | empty | IBM Bob Shell key: turns on the Bob Inspector (reviews GitHub agent diffs) and Bob Cartographer (enriches connected repos). Needs the `bob` CLI |
| `BOB_CLI` | `bob` on `PATH` | Path to the Bob Shell CLI |
| `BOB_TIMEOUT_MS`, `BOB_MAX_COST`, `BOB_MAX_TURNS` | 240000, 3, 20 | Limits per Bob run |

The server also needs `git` installed.

## Demo repos

Pick one with the Repository switch in the top bar.

| Repo | Where the graph comes from | Demo change |
| --- | --- | --- |
| `marketplace-dashboard` (default) | Real. Built by `core/scanner/ts-scan.mjs` from [krishil-agrawal-itp/marketplace-dashboard](https://github.com/krishil-agrawal-itp/marketplace-dashboard), cloned in `samples/marketplace-dashboard`. Saved as `lib/mock/marketplace-dashboard.graph.json` | Rename `Deployment.successRate` to `deploySuccessRate`: 6 files in 2 waves. Grep flags 2 extra files that use a different `ProductRow.successRate` |

To re-scan the sample repo after it changes (run `npm install` in `../core/scanner` once first):

```bash
npm run scan:sample
```

## Pages

| Route | What it shows |
| --- | --- |
| `/overview` | KPIs, components per district, how links were found, recent changes, agent activity |
| `/repos` | Connected repositories and samples; `/repos/new` connects a new one |
| `/city` | The Agent City. Three views: **Dependency map** (the knowledge graph as districts and roads) and **3D city** (`?view=3d`: one building per file, height = lines of code on a log scale, plates = top-level folders, arcs = imports, caps = entry point, core modules and hotspots) and **Graph** (`?view=graph`: an Obsidian-style force graph of every node, sized by link count, with search, filters, display and force settings) |
| | Agent City toolbar: **Full screen** (whole view with its panels; falls back to filling the window where the browser blocks full screen), **Image** (PNG of the current view), **Preferences** (saved in the browser: start view, map legend, 3D height by lines or imports, colour, arcs, labels, auto-rotate, graph local depth), **Keyboard shortcuts** (`1` `2` `3` views, `F` full screen, `Esc` clear, `?` help). The selection carries across all three views |
| `/changes/new` | Pick a column or field, give it a new name, see the ripple, the fix plan, business impact and the grep comparison |
| `/changes/[id]` | The live run: approval gate, agents on the map, trace, agents table, governance, graph diff, report download |
| `/changes` | All changes |
| `/governance` | City laws and the audit log |
| `/settings` | Connection and local data |

## Contracts the backend must follow

The types live in `lib/types.ts`. They match the PRD:

- `Graph` = `graph.json` (PRD section 7). Edges point downstream: `to` depends on `from`. Each graph brings its own `layers` (districts). The ids `business` (read-only) and `quality` (tests and docs row) have fixed meaning.
- `ImpactReport` (PRD section 8). `fixUnits` has one entry per file, so one agent owns one file.
- `RunEvent` (PRD section 13). The dashboard understands these `event` values: `impact_ready`, `awaiting_approval`, `approved`, `wave_started`, `agent_started`, `tool_call`, `blocked`, `check_passed`, `check_failed`, `retrying`, `done`, `quarantined`, `wave_completed`, `rescan` (`data.before`, `data.after`), `inspector` (`data.verdict`, `data.issues`), `pr_created` (`data.branch`), `change_completed`.
- `node` on an event is the fix unit id, which is the file path.

`lib/run-state.ts` turns the event list into what the screens show. Demo and live mode use the same code path.

## Folder map

```text
app/(app)/            pages inside the app shell
components/layout/    sidebar, navbar, app chrome
components/ui/        badge, status badge, table, KPI tile, page shell, empty state, toaster
components/city/      city map (Cytoscape), legend, node panel
components/changes/   impact report parts, run panels
lib/                  types, impact engine, run state, simulator, API client, store, theme, report
lib/mock/             marketplace-dashboard demo graph
```
