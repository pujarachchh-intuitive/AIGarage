# SystemDNA

**Find References for your whole system, and fix them all.**

SystemDNA shows what a code change will break across a whole system, then has a governed crew of IBM Bob agents fix every affected part and prove the change is complete.

Built for the **IBM Bob 2.0 Hackathon** (lablab.ai, 25 to 27 September 2026).

---

## How it works

1. **Map.** Scan a repo and build a knowledge graph of every component: database tables and columns (Prisma, SQL), types, fields, functions, API routes, components, pages, tests, docs and business use.
2. **Predict.** Pick any change: rename, change a type or a function signature, delete, or describe it in plain words. See the ripple: what breaks, how badly, in what order, and which business process is hit.
3. **Fix.** Agents fix every affected file in dependency order. Each agent may only edit the files on its permit.
4. **Govern and observe.** The Agent City map shows every agent live, with approval gates for protected layers.
5. **Prove.** A re-scan shows 0 dangling references. The output is one draft PR, an impact report and an audit trail.

Links come from the TypeScript compiler ("find all references"), not text search, so SystemDNA can tell apart two fields with the same name. Grep can't. Every impact report includes a grep comparison showing the files grep would miss and the false alarms it would raise.

## What works today

| Feature | Status |
| --- | --- |
| Connect a public Git repo (GitHub, GitLab, Bitbucket) or upload a `.zip` | Real |
| Knowledge graph from TypeScript and JavaScript repos, plus database schemas (Prisma and SQL) | Real |
| Agent City: dependency map, 3D city, force graph | Real |
| Impact analysis for rename, type change, signature change, delete and free-text changes: severity, risk score, waves, business impact, grep comparison | Real |
| **Real change runs** on github.com repos: the TypeScript compiler for renames of TS symbols, **IBM Bob Fixer agents** (one per file, with permits) for everything else, then a type check and the Bob Inspector | Real (needs Bob Shell + `BOB_API_KEY` for Bob) |
| Draft PR from the exact previewed diff | Real (needs `GITHUB_TOKEN`) |
| IBM Bob Cartographer: adds links the parser misses when you connect a repo | Real, opt-in |
| Agent run for samples without code (ShopFlow) | **Simulated**, and labelled as such |
| Bob custom modes, MCP server, lifecycle hooks, AWS deployment | Not built yet |

See [systemdna/STATUS.md](systemdna/STATUS.md) for the full breakdown and plan.

---

## Quick start

### Prerequisites

- **Node.js 20 or later** (tested on 22)
- **npm**
- **git** on your `PATH` (used to clone repos you connect)

### 1. Install dependencies

```bash
# Scanner (needs the TypeScript compiler)
cd systemdna/core/scanner
npm install

# Web app
cd ../../web
npm install
```

### 2. Configure (optional)

The app runs without any settings. To open real pull requests, add a GitHub token:

```bash
cd systemdna/web
cp .env.example .env.local
```

Then edit `.env.local`:

| Variable | Default | Use |
| --- | --- | --- |
| `GITHUB_TOKEN` | empty | Lets the GitHub agent push a branch and open draft PRs. Use a fine-grained token with **Contents** and **Pull requests** set to read and write |
| `BOB_API_KEY` | empty | IBM Bob Shell API key. Turns on the Bob Inspector and Bob Cartographer |
| `BOB_CLI` | `bob` on `PATH` | Full path to the Bob Shell CLI, if it is not on the `PATH` |
| `BOB_TIMEOUT_MS`, `BOB_MAX_COST`, `BOB_MAX_TURNS` | 240000, 3, 20 | Limits for each Bob run |
| `BOB_RUN_MAX_COST` | 5 | Bobcoin budget for one change run (all Fixers plus the Inspector). The run stops cleanly when it is used up |
| `SYSTEMDNA_DATA_DIR` | `web/.data` | Where connected repos and their graphs are stored |
| `SYSTEMDNA_SCANNER` | `../core/scanner/ts-scan.mjs` | Path to the scanner |
| `NEXT_PUBLIC_API_URL` | empty | Optional external backend. Leave empty to use the built-in APIs and demo data |

### 3. Install IBM Bob Shell (optional)

The Bob agents need the Bob Shell CLI on the machine that runs the server. IBM's docs say Node.js 24, but the Bob Shell 2.0.5 package itself needs only **Node.js 22 or later** (tested on 22.23).

```powershell
# Windows (PowerShell)
powershell -c "irm -Uri https://bob.ibm.com/download/bobshell.ps1 | iex"
```

```bash
# macOS and Linux
curl -fsSL https://bob.ibm.com/download/bobshell.sh | bash
```

Check it with `bob --version`, then restart `npm run dev`. **Settings** in the app shows whether Bob is ready. Without Bob Shell, everything else works: the Bob steps show "skipped" with the reason.

### 4. Run

```bash
cd systemdna/web
npm run dev
```

Open http://localhost:3000. It starts on the Overview page.

To use a different port: `npm run dev -- --port 3100`. In VS Code you can also use the `systemdna-web` launch configuration in [.claude/launch.json](.claude/launch.json), which runs on port 3100.

> If you see "Another next dev server is already running", the app is already up. Open the URL it prints, or stop the old process with `taskkill /PID <pid> /F` (Windows) or `kill <pid>` (macOS and Linux).

### 5. Try it

1. The `marketplace-dashboard` demo repo is loaded by default. Pick it in the Repository switch in the top bar.
2. Go to **Agent City** to explore the graph as a map, a 3D city or a force graph.
3. Go to **New change**, pick `Deployment.successRate`, rename it to `deploySuccessRate`, then **Analyse impact**. You get 6 files in 2 waves, and the grep comparison flags 2 files that use a different `successRate`.
4. **Approve plan and run**. `lib/types.ts` is a protected file, so the run waits for your **Approve**. Then it runs for real in a fresh clone: the compiler renames, the type check runs, and the IBM Bob Inspector reviews (about 2 minutes).
5. Try a change the compiler cannot do: **Change type** of `Deployment.successRate` to `number | null`. IBM Bob Fixer agents update every affected file wave by wave (about 7 minutes, about 1 Bobcoin). Watch them on the map and in the trace.
6. The **Pull request** panel shows the diff and Bob's review. With a `GITHUB_TOKEN` set, **Open draft pull request** pushes exactly that diff to a new branch, with the impact report and Bob's review in the description.

To analyse your own code, go to **Repositories**, then **Connect repository**, and paste a public Git URL or upload a `.zip` (up to 50 MB). Tick **Enrich with IBM Bob** to have the Bob Cartographer add links the parser cannot see.

---

## IBM Bob in SystemDNA

Bob Shell runs headless on the server (`bob run --format json`). The key stays on the server: it is passed to the `bob` process through its environment and removed from every error message.

| Agent | When it runs | What Bob does | Guard rails |
| --- | --- | --- | --- |
| **Fixer** | Change page, for every change except renames of TypeScript symbols | One agent per affected file, in wave order. It gets the change, why its file is affected, and the diff of earlier waves, and edits its own file. For a database change, the agent on the schema file also writes a **new migration** | **Permit:** edits to any other file are reverted and shown as *Blocked*. Each edit is type-checked; a failure gets one retry with the errors, then the file is rolled back (*Quarantined*). Bobcoin budget per run |
| **Inspector** | End of every real run, and the GitHub agent preview | Reviews the whole diff against the change and gives a verdict and notes | Told to only read. Edits are staged first and anything Bob changes is thrown away |
| **Cartographer** | Connect or re-scan a repo, with **Enrich with IBM Bob** ticked | Finds links the parser cannot see (fetch calls to API routes, string keys, config) and flags personal-data fields | Only links between nodes the parser already found are kept. Parser links win. Bob links are marked "Found by Bob" |

Code: [lib/server/bob.ts](systemdna/web/lib/server/bob.ts) (client), [lib/server/change-agent.ts](systemdna/web/lib/server/change-agent.ts) (real runs and Fixers), [lib/server/github-agent.ts](systemdna/web/lib/server/github-agent.ts) (Inspector, push and PR), [lib/server/bob-cartographer.ts](systemdna/web/lib/server/bob-cartographer.ts) (Cartographer), `GET /api/bob/status`.

## Change kinds

| Kind | Applies to | How it ripples | Who fixes it |
| --- | --- | --- | --- |
| Rename | Any field, column, table, type, function, constant, component | Fields and columns follow the link rules; for other symbols every direct reference breaks | TypeScript compiler for TS symbols; Bob Fixers for tables and columns (schema, migration, SQL, code) |
| Change type | Fields, columns, constants | Users of the value break; code that passes the value on needs a check | Bob Fixers |
| Signature | Functions | Every caller breaks | Bob Fixers |
| Delete | Anything | Direct users break; a field that mirrors a deleted column goes too | Bob Fixers |
| Describe | Anything | Like a type change; the agents decide what really needs an edit | Bob Fixers |

---

## Command-line tools

The scanner and rename agent also run on their own, from `systemdna/core/scanner`:

```bash
# Build a graph.json from a repo
node ts-scan.mjs <repo-dir> <out-file.json> [--repo-name name] [--progress] [--max-files 2500]

# Rename a field, or any symbol, with the TypeScript compiler; refuses if it adds type errors
node ts-rename.mjs <repo-dir> --field Type.field --to newName [--apply]
node ts-rename.mjs <repo-dir> --symbol name --file path/to/file.ts [--line n] --to newName [--apply]

# TypeScript errors in some files (used before and after each agent's edit)
node ts-check.mjs <repo-dir> --files a.ts,b.tsx
```

Neither tool installs, builds or runs code from the scanned repo. See [systemdna/core/scanner/README.md](systemdna/core/scanner/README.md).

---

## Project structure

```text
.
├── systemdna/
│   ├── core/scanner/     Scanner (ts-scan.mjs), rename agent (ts-rename.mjs), type check (ts-check.mjs)
│   ├── web/              Next.js 16 app: Agent City dashboard and server APIs
│   │   ├── app/(app)/    Pages: overview, repos, city, changes, governance, settings
│   │   ├── app/api/      Repo ingestion and GitHub agent APIs
│   │   ├── components/   UI, city map, change panels
│   │   └── lib/          Impact engine, run state, simulator, server code, demo graphs
│   └── STATUS.md         What is built, what is not, and the plan
├── bob_sessions/         Exported IBM Bob sessions (hackathon submission)
├── SystemDNA — PRD (IBM Bob 2.0 Hackathon).md
├── TEAM_PLAN.md          Roles and feature ownership
└── SECURITY.MD           Credential handling rules
```

## API

The web app serves these routes itself:

| Method and path | Does |
| --- | --- |
| `GET /api/repos` | List connected repos |
| `POST /api/repos` | Connect a repo: JSON `{ url, ref?, bob? }` or a multipart form with `file` (and `bob`). Streams progress |
| `GET /api/repos/{id}` | The repo's graph |
| `POST /api/repos/{id}/rescan` | Pull the latest code and rebuild the graph |
| `DELETE /api/repos/{id}` | Remove the repo and its graph |
| `GET /api/github/status` | Whether a GitHub token is set (never returns the token) |
| `POST /api/github/pull-requests` | Preview a rename (`dryRun: true`, includes the Bob review) or open a draft PR. Streams progress |
| `POST /api/changes/run` | Run a planned change for real in a fresh clone (compiler or Bob Fixers). Streams run events, the Bob review and the diff. Nothing is pushed |
| `POST /api/changes/pull-request` | `{ patchId, title, body }`: open a draft PR from a run's stored diff |
| `GET /api/bob/status` | Whether IBM Bob is ready: key set, CLI found, version (never returns the key) |

More detail in [systemdna/web/README.md](systemdna/web/README.md).

---

## Security

- Never commit `.env` or `.env.local`. Both are git-ignored.
- The GitHub token stays on the server. It is sent as a header, never put in a URL or log, and stripped from error messages.
- The Bob API key stays on the server. It is passed only to the `bob` process through its environment, never in arguments, files or logs.
- PRs are always drafts, always on a new `systemdna/...` branch, and open only after you confirm.
- Uploaded zips that try to write outside their folder are refused. Git runs without a shell, with timeouts.

Read [SECURITY.MD](SECURITY.MD) before every commit.

## Documentation

- [PRD](SystemDNA%20—%20PRD%20(IBM%20Bob%202.0%20Hackathon).md): the full product spec
- [STATUS.md](systemdna/STATUS.md): current build status and roadmap
- [TEAM_PLAN.md](TEAM_PLAN.md): who owns what
- [Web app README](systemdna/web/README.md): pages, data modes, backend contracts
- [Scanner README](systemdna/core/scanner/README.md): how the graph is built
