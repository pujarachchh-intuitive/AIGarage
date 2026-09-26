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
```

Never put the demo write token in an env file: every `NEXT_PUBLIC_*` value is baked into the public JavaScript. Type the token into **Settings → Demo write token** instead. It is kept in the browser tab's `sessionStorage` only.

## Demo repos

Pick one with the Repository switch in the top bar.

| Repo | Where the graph comes from | Demo change |
| --- | --- | --- |
| `marketplace-dashboard` (default) | Real. Built by `core/scanner/ts-scan.mjs` from [krishil-agrawal-itp/marketplace-dashboard](https://github.com/krishil-agrawal-itp/marketplace-dashboard), cloned in `samples/marketplace-dashboard`. Saved as `lib/mock/marketplace-dashboard.graph.json` | Rename `Deployment.successRate` to `deploySuccessRate`: 6 files in 2 waves. Grep flags 2 extra files that use a different `ProductRow.successRate` |
| `samples/shopflow` | Hand-made in `lib/mock/shopflow.ts` to match the PRD's 7-layer sample (SQL, PySpark, API, React) | Rename `orders.cust_id` to `customer_id`: 18 files in 7 waves. Grep misses the 2 files that feed Finance |

To re-scan the sample repo after it changes (run `npm install` in `../core/scanner` once first):

```bash
npm run scan:sample
```

## Pages

| Route | What it shows |
| --- | --- |
| `/overview` | KPIs, components per district, how links were found, recent changes, agent activity |
| `/city` | The Agent City map. Click a building to see what it depends on and what uses it |
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
lib/mock/             ShopFlow demo graph
```
