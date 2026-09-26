# SystemDNA: what is built, what is not, and the plan

Status as of 26 September 2026. Feature IDs (F01 to F63) match the PRD feature list. Owners match `TEAM_PLAN.md` (CP1, CP2, FDE1 to FDE4).

**Short version:** a user can connect a real TypeScript or JavaScript repo, get a real knowledge graph, see the real impact of a rename, preview the real fix, and open a draft pull request with it. The multi-agent "Bob crew" run on the change page is still **simulated**. No Bob integration, backend service, AWS setup or user accounts exist yet.

---

## 1. What is implemented

### Web app (`systemdna/web`, Next.js 16, HRMS design system)

| Area | What works | Real or simulated |
| --- | --- | --- |
| App shell | Sidebar, navbar, component search (Ctrl+K), light and dark mode, repo switcher | Real |
| Overview | KPIs, components per district, parser vs Bob links, recent changes, agent activity | Real data from the graph |
| Repositories | List connected repos and samples; re-scan; remove | Real |
| Connect a repository | Public Git URL (GitHub, GitLab, Bitbucket) or `.zip` upload; live progress stepper; result stats | Real |
| Agent City: dependency map | Districts, buildings, roads, fields as floors, node panel, zoom to selection | Real |
| Agent City: 3D city | One building per file, log-scale height, plates per folder, import arcs, landmarks (entry, core, hotspot), file panel | Real |
| Agent City: graph | Obsidian-style force graph, search, filters, display and force settings | Real |
| New change | Pick a field, rename, see the ripple, affected table, risk score, waves, business impact, grep comparison | Real analysis |
| Change run | Approval gate, agents walking on the map, trace, agents table, governance panel, graph diff, report download | **Simulated** (`lib/simulator.ts`), clearly labelled |
| GitHub agent panel (on the change page) | Preview the real diff; open a draft PR after you confirm | Real (see section 1.4) |
| Changes, Governance, Settings | Change list, city laws, audit log, connection info | Audit log shows simulated events |

### 1.2 Knowledge graph (`systemdna/core/scanner/ts-scan.mjs`)

- Uses the TypeScript language service ("find all references"), not text search. It tells apart two fields with the same name.
- Finds: interfaces and classes with their fields, type aliases, functions, constants, datasets, components, pages, API routes, tests, docs.
- Finds `keyof` string keys (for example `key: "totalMau"`) that find-references misses.
- Links docs to fields when a markdown line names both the type and the field.
- Reads business use from a README route table.
- Maps every file for the 3D city: lines, language, folder, resolved imports.
- Detects layers from common folder names and outputs only the layers the repo uses.
- Works with or without a `tsconfig.json`. Caps at 2,500 code files. Prints progress.
- Never runs code from the repo.
- Tested on `marketplace-dashboard`, `sindresorhus/ky` and `pmndrs/zustand`.

### 1.3 Impact engine (`web/lib/impact.ts`)

- Severity per node: Breaking, Needs update, Update (tests and docs), Safe.
- Aliases, calls and derived fields stop the ripple (marked Safe), so only real edits are planned.
- Risk score 0 to 100 (fan-out, criticality, personal data, untested).
- Fix units per **file** (one agent per file), waves in dependency order, approval for protected layers.
- Business impact and the grep comparison (missed files and false alarms).
- Safe on cyclic graphs.

### 1.4 Ingestion and GitHub agent (server side, inside the Next.js app)

| Piece | File | Notes |
| --- | --- | --- |
| Ingestion API | `app/api/repos/**`, `lib/server/ingest.ts` | Clone or unzip into a temp folder, size limits, scan in a separate process, stream progress, always clean up |
| Repo store | `lib/server/repo-store.ts` | Graphs on local disk (`web/.data`). One file to swap for S3 + DynamoDB |
| Rename agent | `core/scanner/ts-rename.mjs` | TypeScript compiler rename + `keyof` string keys + docs, then a check for **new type errors** in every file that mentions the old name. Refuses if the rename adds errors |
| GitHub agent | `lib/server/github-agent.ts`, `app/api/github/**` | Fresh clone, edit, check, diff preview; then a new branch `systemdna/...`, commit, push, **draft** PR with the impact report as the description |
| GitHub App sign-in | `lib/server/github-auth.ts`, `app/api/github/install/callback` | Signs a JWT with the app's private key (Node `crypto`, no new package), then gets a **1-hour token for one repo** with only Contents, Pull requests and Metadata. Commits and PRs show up as `<slug>[bot]`. Falls back to `GITHUB_TOKEN` when no app is set up |

Safety built in:
- Git runs without a shell, with timeouts and no prompts; option injection in branch names is blocked.
- Zip entries that escape the folder are refused.
- The token lives only in the server environment. It is sent as a header, never put in a URL or log, and stripped from error messages.
- PRs are drafts, never touch the default branch, and open only after the user confirms.

Tested:
- Dry run against `krishil-agrawal-itp/marketplace-dashboard`: 22 edits in 4 code files and 2 docs, no new type errors.
- A clashing name (`successRate` to `errorRate`) is refused because it adds type errors.
- The token-missing path.

**Tested with the GitHub App `systemdna1`:** the app JWT, the "not installed" check and message, the install callback redirect, and a preview (22 edits, 4 code files, 2 docs).

**Not yet tested:** a real push and PR. It needs the app installed on the target repo.

---

## 2. What is not implemented

### 2.1 Hackathon scope (PRD) still missing

| Missing | PRD features | Owner | Why it matters |
| --- | --- | --- | --- |
| Bob inside the product: custom modes, Skill, SystemDNA MCP server | F17, F18, F19 | FDE3 | Judging rule: Bob IDE must be a core part |
| Real agent runs: orchestrator, `bob -p` workers, waves | F20, F22, F23 | FDE2 | The change page run is simulated today |
| Lifecycle hooks: permit check (block with exit code 2), event reporting | F21, F29 | FDE3 | Governance is drawn, not enforced |
| Event server and live WebSocket feed | F30 | CP2 | Client code exists, no server yet |
| Bob Cartographer links and PDF document understanding (owners, personal data) | F07, F08 | FDE3 | Graph shows 0 links "found by Bob" |
| SQL, PySpark and Python scanners | F01, F02 | FDE1 | Only TypeScript and JavaScript today; ShopFlow is hand-made |
| Type change and delete | F51 | FDE1 | Buttons disabled |
| Inspector agent, quarantine | F25, F28 | FDE3 | Simulated only |
| AWS: CDK or Terraform, EC2, ALB, CloudFront, DynamoDB, S3, Secrets Manager, CloudWatch | F53 to F63 | CP1, CP2 | Nothing deployed |
| CI guard (PR comment with impact) | F50 | CP1 | Stretch |
| `bob_sessions/` export, README, video | F47 to F49 | Everyone | Required for submission |

### 2.2 GitHub agent gaps

- Only **renames of TypeScript fields**. No fixes driven by the risk score yet: tests for untested high-risk code, doc updates, type changes. Those need an LLM (Bob) with guard rails.
- No real PR opened yet (the app is not installed on a repo yet).
- No fork flow: the app must be installed on the repo itself.
- No per-user sign-in yet. The GitHub App gives per-repo tokens, but SystemDNA itself has no user accounts.
- No webhooks yet (re-scan on push, PR status).
- The PR's CI checks and review status are not shown in SystemDNA.
- The check is type-level only. Tests are not run, because we never execute repo code outside a sandbox.

### 2.3 SaaS basics not built

- Accounts, organisations and sign-in.
- Multi-tenant isolation of repos and graphs.
- A job queue and workers: ingestion and the agent run inside the web process today (limit: 2 at a time).
- A database: changes live in the browser (localStorage), graphs on local disk.
- Private repos, rate limits, quotas, billing.
- Webhooks to re-scan on every push.
- Automated tests for the scanner, impact engine and UI.

---

## 3. Implementation plan

### Phase A: finish the hackathon (next ~20 hours)

| # | Task | Owner | Done when |
| --- | --- | --- | --- |
| A1 | SystemDNA MCP server wrapping the existing APIs: `get_impact`, `preview_fix`, `open_pr` | FDE3 | Bob IDE can call all three |
| A2 | Bob custom mode "Change Planner": takes "rename X to Y", calls the MCP tools, asks for approval, opens the draft PR | FDE3 | Demo starts in Bob IDE and ends with a PR link |
| A3 | Test the PR path with a fine-grained token on a test fork | FDE2 | A draft PR exists on the fork |
| A4 | Replace the simulated run for renames with the real agent: the change page shows real progress from `/api/github/pull-requests` | FDE4 | "Simulated" banner is gone for rename changes |
| A5 | One `bob -p` worker for a fix the compiler cannot do (for example updating a test's expected text), behind a permit hook | FDE2, FDE3 | One real blocked edit in the audit log |
| A6 | Deploy the web app plus scanner to one EC2 host with `git` installed | CP1, CP2 | Public HTTPS URL works |
| A7 | Export `bob_sessions/`, README, 3-minute video | CP1, FDE4 | Submission uploaded |

### Phase B: SaaS MVP (weeks 1 to 3 after the hackathon)

1. **Sign-in with GitHub.** The GitHub App part is done (short-lived tokens per repo). Still to do: user sign-in, so each user only sees their own installations. Store the private key in AWS Secrets Manager (`GITHUB_APP_PRIVATE_KEY`).
2. **Jobs and workers.** Move ingestion and the agent to a queue (SQS) and worker containers (ECS Fargate or EC2). Each job gets a clean container, a CPU and memory cap, and no network except GitHub.
3. **Storage.** Graphs to S3, repos, changes and PRs to Postgres or DynamoDB, keyed by organisation. Remove localStorage for changes.
4. **Webhooks.** On every push, re-scan and update the graph. On pull request events, update PR status in SystemDNA.
5. **CI guard.** A GitHub check that posts the impact of every PR (F50).
6. **Limits and safety.** Per-org quotas, rate limits, audit log in the database, secret scanning of uploads.

### Phase C: product depth

1. **More languages.** Python (`ast`), SQL (sqlglot column lineage), PySpark, then Java or Go. The graph format stays the same.
2. **Bob enrichment.** Cartographer subagents add links parsers miss and read docs for owners and personal data.
3. **Risk-driven agent fixes.** For each high-risk node (for example fan-out high, untested), a Bob agent writes a test or doc update inside a permit, and the PR groups them.
4. **Sandboxed verify.** Install and run `tsc` and the repo's tests inside the worker container before opening the PR.
5. **More change types.** Type change, delete, split field, move file.

---

## 4. How to use the GitHub agent now

**Option A: GitHub App (preferred).**

1. GitHub, Settings, Developer settings, **GitHub Apps**, **New GitHub App**.
   - Setup URL: `http://localhost:3100/api/github/install/callback`
   - Webhook: untick "Active" for now.
   - Repository permissions: **Contents: Read and write**, **Pull requests: Read and write**, **Metadata: Read-only**.
2. Create the app. Note the **App ID**, the slug (the end of `https://github.com/apps/<slug>`) and generate a **private key** (`.pem`). Keep the `.pem` outside the repo.
3. In `systemdna/web/.env.local` set `GITHUB_APP_ID`, `GITHUB_APP_SLUG` and `GITHUB_APP_PRIVATE_KEY_PATH`. Restart `npm run dev`.
4. Check `http://localhost:3100/api/github/status`. It should show `"mode":"app"` and the app's name.
5. **Repositories** page, **Install or pick repos**. Choose the target repo. GitHub sends you back with a "GitHub App installed" message.

**Option B: personal token (fallback).** Create a fine-grained token with **Contents: Read and write** and **Pull requests: Read and write**, and set `GITHUB_TOKEN`. It is used only when `GITHUB_APP_ID` is empty.

**Then, for both:**

1. Connect the repo from a Git URL on **Repositories** (the `marketplace-dashboard` sample is already linked to its GitHub repo).
2. **New change**: pick a TypeScript field, give the new name, **Analyse impact**, then **Approve plan and run**.
3. On the change page, **GitHub agent**, then **Preview changes**. Check the diff.
4. **Open draft pull request**, then confirm. The PR link appears in the panel.
