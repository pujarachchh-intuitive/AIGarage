# SystemDNA — Agent City Dashboard

> **Built for the IBM Bob 2.0 Hackathon** · Next.js 16 · TypeScript · IBM Bob Shell

SystemDNA is an AI-powered change-intelligence platform that answers the question engineers dread most: **"If I rename this field, what breaks — and can I fix all of it safely, right now?"**

It builds a precise knowledge graph of your codebase, predicts the ripple of any planned change, and deploys a governed crew of **IBM Bob agents** to fix every affected file — then proves the change is complete with a type check, a Bob Inspector review, and a draft pull request.

---

## Why It Matters

Text search (`grep`) misses files. Type checkers only check what you edited. Docs and config don't import anything. Database migrations live in a separate world.

SystemDNA fuses all of these into one dependency graph and uses **IBM Bob Shell running headless on the server** to act on it. Every agent gets a strict file permit. Out-of-permit edits are automatically reverted. The run is fully observable, wave by wave, on a live city map.

---

## IBM Bob — The Core of SystemDNA

**Bob Shell (`bob run --format json`) powers three agents.** The API key stays on the server: passed only through the Bob process environment, scrubbed from every error message, never logged.

### 1 · Bob Fixer  _(the worker)_

For every change except TypeScript renames, SystemDNA dispatches **one IBM Bob Fixer per affected file**, in dependency-wave order.

Each Fixer receives:
- The change in plain English ("Rename column `cust_id` to `customer_id` in the `orders` table")
- Why _this specific file_ is affected (link evidence from the graph)
- The cumulative diff of every earlier wave (so it never undoes a previous agent's work)
- Its **permit**: the one file it may edit

Guard rails enforced automatically:
| Situation | What happens |
|---|---|
| Agent edits a file outside its permit | Edit is git-reverted; event shown as **Blocked** |
| Type check fails after the edit | Agent gets **one retry** with the exact error messages |
| Still failing after the retry | File is rolled back; event shown as **Quarantined** |
| Bobcoin budget (`BOB_RUN_MAX_COST`) exhausted | Run stops cleanly; partial progress is preserved |

For a **database change**, the agent on the schema file also writes a new migration (ALTER TABLE / Prisma) with the correct timestamp, following the repo's own migration naming pattern. It never touches an existing migration.

### 2 · Bob Inspector  _(the reviewer)_

After every real run and after every GitHub agent preview, the **IBM Bob Inspector** reads the full staged diff and looks for what the compiler or the Fixers missed: string literals, dynamic property access, JSON, config files, SQL, tests, docs, API payloads.

It returns a verdict (`approved` / `changes_requested`), a one-paragraph summary, and a list of files with line numbers. The verdict appears:
- In the run trace as an `inspector` event
- In the GitHub agent panel as a badge
- In the PR description as `## IBM Bob Inspector review`

Inspector edits are staged first; anything Bob changes is thrown away afterwards — the PR is always exactly the agent's diff.

### 3 · Bob Cartographer  _(the enricher)_

When you connect a repository with **Enrich with IBM Bob** ticked, the Cartographer runs after the TypeScript compiler scan. It finds the links the compiler cannot see:

- `fetch("/api/...")` calls wired to their route handlers
- String keys, dynamic property access, JSON and config files that reference a field by name
- Docs, tests and scripts that depend on a field without importing it
- Shared environment variables and config values
- **PII flagging**: nodes that hold personal data (names, emails, IDs)

Every proposed link is validated: both ends must be nodes the parser already found, edge type and rule must be known, and parser links win. Accepted links show as _"Found by Bob"_ with medium or low confidence.

### Key safety properties

```
BOB_API_KEY / BOBSHELL_API_KEY  ──►  bob process env only
                                     never: CLI arg / file / log / error message
                                     scrubbed by scrubBob() from every string before it leaves the server
bob run --format json            ──►  stdin closed (no piped prompt wait)
                                     stdout capped at 2 MB, stderr at 4 KB
                                     SIGKILL + taskkill /T /F after BOB_TIMEOUT_MS
```

**Relevant source files**

| File | Responsibility |
|---|---|
| [`lib/server/bob.ts`](lib/server/bob.ts) | Shell client: key handling, CLI discovery, spawn, status cache |
| [`lib/server/change-agent.ts`](lib/server/change-agent.ts) | Real runs: Compiler strategy, Bob Fixer strategy, type-check loop, Inspector call |
| [`lib/server/github-agent.ts`](lib/server/github-agent.ts) | Inspector (preview path), push, draft PR |
| [`lib/server/bob-cartographer.ts`](lib/server/bob-cartographer.ts) | Cartographer: catalog, prompt, link validation, PII flags |
| [`app/api/bob/status/route.ts`](app/api/bob/status/route.ts) | `GET /api/bob/status` — never returns the key |

---

## Quick Start

### Prerequisites

- Node.js ≥ 20 (tested on 22)
- `git` on `PATH`
- IBM Bob Shell CLI (optional — everything else works without it)

### Install

```bash
# Scanner (TypeScript compiler)
cd systemdna/core/scanner && npm install

# Web app
cd systemdna/web && npm install
```

### Configure

```bash
cp .env.example .env.local
```

| Variable | Default | What it does |
|---|---|---|
| `BOB_API_KEY` | _empty_ | **IBM Bob Shell API key.** Enables all three Bob agents |
| `BOB_CLI` | `bob` on PATH | Full path to the Bob Shell CLI executable |
| `BOB_TIMEOUT_MS` | `240000` | Per-run timeout (ms) |
| `BOB_MAX_COST` | `3` | Bobcoin cap per individual Bob call |
| `BOB_MAX_TURNS` | `20` | Max agent turns per call |
| `BOB_RUN_MAX_COST` | `5` | Total Bobcoin budget for one change run (all Fixers + Inspector) |
| `GITHUB_TOKEN` | _empty_ | Fine-grained token (Contents + Pull Requests: write) for pushing branches and opening draft PRs |
| `GITHUB_APP_ID` | _empty_ | GitHub App id (preferred over `GITHUB_TOKEN`) |
| `GITHUB_APP_PRIVATE_KEY_PATH` | _empty_ | Path to the app's `.pem` file |
| `SYSTEMDNA_DATA_DIR` | `web/.data` | Where connected repo graphs are stored |
| `SYSTEMDNA_SCANNER` | `../core/scanner/ts-scan.mjs` | Path to the scanner |
| `NEXT_PUBLIC_API_URL` | _empty_ | External FastAPI backend (leave empty for built-in APIs) |

### Install IBM Bob Shell

```powershell
# Windows
powershell -c "irm -Uri https://bob.ibm.com/download/bobshell.ps1 | iex"
```

```bash
# macOS / Linux
curl -fsSL https://bob.ibm.com/download/bobshell.sh | bash
```

Verify: `bob --version`. Restart `npm run dev`. The **Settings** page shows "IBM Bob ready" when the key and CLI are both present.

### Run

```bash
cd systemdna/web
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Walkthrough

### Step 1 — Explore the graph

The `marketplace-dashboard` demo is loaded by default. Open **Agent City** to see the dependency graph as:
- **Dependency map** — districts (layers) connected by typed edges
- **3D city** — one building per file, height = lines of code, arcs = imports
- **Force graph** — Obsidian-style network, sized by link count, searchable

### Step 2 — Plan a change

Go to **New change**. Pick `Deployment.successRate`, rename it to `deploySuccessRate`. Click **Analyse impact**.

You see:
- 6 files in 2 waves
- Severity per component (breaking / needs_update / safe)
- Business process impact
- Grep comparison: 2 files grep would flag that use a _different_ `successRate` on a different type

### Step 3 — Run it for real

Click **Approve plan and run**. `lib/types.ts` is in a protected district and waits for your **Approve** click. Then:

1. A fresh `git clone` of the repo (never your working copy)
2. The TypeScript compiler's own rename (ts-rename.mjs) — one pass, no guessing
3. Type check: no new errors
4. The IBM Bob Inspector reviews the diff (~2 min, ~0.2 Bobcoins)
5. The run page shows every agent on the city map, wave by wave

Try a change the compiler cannot do: **Change type** of `Deployment.successRate` to `number | null`. IBM Bob Fixer agents take over — one per file, wave by wave (~7 min, ~1 Bobcoin).

### Step 4 — Open a pull request

The **GitHub agent** panel shows the full diff and Bob's Inspector verdict. Click **Preview changes** (dry run, no push). Then **Open draft pull request** to push exactly that diff to a new branch `systemdna/<change>` and open a draft PR with the impact report and Bob's review in the description.

### Step 5 — Connect your own repo

**Repositories → Connect repository** → paste a public Git URL or upload a `.zip` (≤ 50 MB). Tick **Enrich with IBM Bob** to run the Cartographer after the scan.

---

## Architecture

```
Browser                          Next.js server
  │                                    │
  ├─ GET /api/bob/status ──────────────► bobStatus()   (key present? CLI found? version?)
  │                                    │
  ├─ POST /api/repos { bob:true } ─────► ingest.ts → scan → bob-cartographer.ts
  │                                    │              └─► runBob()  [Cartographer]
  │                                    │
  ├─ POST /api/changes/run ────────────► change-agent.ts
  │   streams RunEvents (NDJSON)       │   ├─ compiler strategy: ts-rename.mjs
  │                                    │   └─ bob strategy: runBob() × N  [Fixers]
  │                                    │                  + inspectWithBob()  [Inspector]
  │                                    │
  └─ POST /api/github/pull-requests ──► github-agent.ts
      streams AgentEvents (NDJSON)     │   └─ inspectWithBob()  [Inspector, preview only]
                                       │
                                    bob CLI process
                                    (BOB_API_KEY in env, stdin closed)
```

### Data flow for a change run

```
ImpactReport (browser) ──► POST /api/changes/run
                              │
                    ┌─────────┴──────────────────────────┐
                    │  1. git clone --depth 1             │
                    │  2. baseline type errors            │
                    │  3. fix (compiler or Bob Fixers)    │
                    │     emit: wave_started              │
                    │           agent_started             │
                    │           tool_call (write/read)    │
                    │           check_passed / failed     │
                    │           blocked / quarantined     │
                    │           done                      │
                    │  4. Bob Inspector                   │
                    │     emit: inspector + review        │
                    │  5. git diff → save patch           │
                    │     emit: rescan + change_completed │
                    └────────────────────────────────────┘
                              │
                    stored patchId ──► POST /api/changes/pull-request
                                          └─ fresh clone → apply patch → push → draft PR
```

---

## Pages

| Route | What it shows |
|---|---|
| `/overview` | KPIs, components per district, how links were found (parser vs Bob), recent changes, agent activity |
| `/repos` | Connected repositories and samples; `/repos/new` connects a new one |
| `/city` | **Dependency map**, **3D city** and **Force graph** with full-screen, PNG export, keyboard shortcuts |
| `/changes/new` | Pick a node, choose a change kind, see the ripple, fix plan, business impact and grep comparison |
| `/changes/[id]` | Live run: approval gate, agents on the city map, trace, agents table, governance, graph diff, report download |
| `/changes` | All changes |
| `/governance` | City laws and audit log |
| `/settings` | IBM Bob status, GitHub status, connection info |

---

## Change Kinds

| Kind | Node types | Strategy |
|---|---|---|
| **Rename** | TSField, TSType, Function, Constant, Component, Column, Table | TypeScript compiler (TS symbols) · IBM Bob Fixers (DB and everything else) |
| **Change type** | Fields, Columns, Constants | IBM Bob Fixers |
| **Signature** | Functions | IBM Bob Fixers |
| **Delete** | Anything | IBM Bob Fixers |
| **Custom** (plain text) | Anything | IBM Bob Fixers |

---

## API Reference

| Method · Path | What it does |
|---|---|
| `GET /api/bob/status` | Bob ready? Key set? CLI version? **Never returns the key** |
| `GET /api/repos` | List connected repos |
| `POST /api/repos` | Connect a repo (`{ url, ref?, bob? }` JSON or `.zip` form). Streams progress (NDJSON) |
| `POST /api/repos/{id}/rescan` | Re-clone and rebuild the graph |
| `DELETE /api/repos/{id}` | Remove the repo |
| `GET /api/github/status` | GitHub App or token status; `?repo=<url>` checks installation |
| `POST /api/changes/run` | Run a planned change. Streams `RunEvent`s + `BobReview` + diff (`ChangeStreamLine` NDJSON) |
| `POST /api/changes/pull-request` | `{ patchId, title, body }` — open a draft PR from a stored diff |
| `POST /api/github/pull-requests` | Legacy field-rename agent (`dryRun` + PR). Streams `AgentEvent` NDJSON |
| `GET /api/github/install/callback` | GitHub App OAuth callback |

---

## Type Contracts

The types in [`lib/types.ts`](lib/types.ts) are the single source of truth shared between the browser and the server:

- **`Graph`** — nodes (TSField, TSType, Column, Table, Component, …) + edges (typed, directional, with `source: "parser" | "bob"`, confidence and rule)
- **`ImpactReport`** — items (severity, risk, depth), fixUnits (one per file), waves, business impact, grep comparison
- **`RunEvent`** — the event stream the run page consumes: `wave_started`, `agent_started`, `tool_call`, `check_passed/failed`, `blocked`, `quarantined`, `inspector`, `rescan`, `change_completed`
- **`ChangeStreamLine`** — wraps `RunEvent` plus status lines, `BobReview`, diff preview and errors
- **`BobReview`** — `verdict`, `summary`, `issues[]`, `bobcoins`, `durationMs`
- **`BobStatus`** — `configured`, `cli`, `version`, `ready`, `reason` (no key, ever)

---

## Folder Map

```
app/(app)/            Pages: overview, repos, city, changes, governance, settings
app/api/              Route handlers
  bob/status/           GET /api/bob/status
  changes/run/          POST /api/changes/run  (Compiler + Bob Fixers + Inspector)
  changes/pull-request/ POST /api/changes/pull-request
  github/               status, pull-requests, install callback
  repos/                CRUD + rescan
components/layout/    Sidebar, navbar, app chrome
components/city/      City map (Cytoscape), 3D city (Three.js), force graph (D3), legend, node panel
components/changes/   Impact report, run panels, GitHub agent panel (Bob review UI)
lib/                  types, impact engine, run-state, simulator, API client, store, report
lib/server/
  bob.ts              Shell client: key, CLI, spawn, scrub, status
  change-agent.ts     Real runs: Compiler strategy, Bob Fixer strategy, type-check loop
  github-agent.ts     Inspector (preview), push, draft PR
  bob-cartographer.ts Cartographer: catalog, prompt, link validation, PII
  github-auth.ts      GitHub App JWT + install tokens; personal token fallback
  ingest.ts           git clone / zip unpack → scan → save
lib/mock/             marketplace-dashboard demo graph (real scan)
```

---

## Demo Repos

| Repo | Graph source | Suggested change |
|---|---|---|
| `marketplace-dashboard` (default) | Real scan of [krishil-agrawal-itp/marketplace-dashboard](https://github.com/krishil-agrawal-itp/marketplace-dashboard) | Rename `Deployment.successRate` → `deploySuccessRate`: 6 files, 2 waves |

To re-scan the sample:

```bash
# Run once: npm install in ../core/scanner
npm run scan:sample
```

---

## Development Notes

```bash
# TypeScript check
node node_modules/typescript/bin/tsc --noEmit

# ESLint
node node_modules/eslint/bin/eslint.js .

# The app serves both demo and live mode from the same binary.
# Demo: NEXT_PUBLIC_API_URL not set — uses built-in graph, impact engine in browser, simulator.
# Live: NEXT_PUBLIC_API_URL set — reads from FastAPI backend, WebSocket event feed.
```

The `lib/run-state.ts` `deriveRun()` function processes the same `RunEvent` list in both modes. The simulator (`lib/simulator.ts`) produces the same sequence real runs produce, so the UI was built and tested before the backend existed.

---

*SystemDNA · IBM Bob 2.0 Hackathon submission · lablab.ai · September 2026*
