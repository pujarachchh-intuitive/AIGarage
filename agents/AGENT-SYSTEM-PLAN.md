# SystemDNA — Agent Layer Plan (arnav-branch-agents)

> **This plan governs only the agent/backend layer.** The frontend lives on the
> `master` branch (`systemdna/web/`) and must not be modified. The TypeScript
> scanner lives at `systemdna/core/scanner/`. This layer plugs into both via the
> API contract defined in PRD section 13 and the `graph.json` contract in PRD
> section 7.

---

## 1. What the team is building — SystemDNA

**Tagline:** Find References for your whole system, and fix them all.

SystemDNA scans a repo, builds a 7-layer cross-language knowledge graph, predicts
the full ripple of any change (e.g. rename a DB column), then sends parallel Bob
agents to fix every affected component in dependency order — governed by permits,
verified by a re-scan, and visible live on the Agent City map.

**Event:** IBM Bob 2.0 Hackathon, lablab.ai. Submission due 27 September 2026.

---

## 2. Team split — what already exists vs. what this branch builds

| Area | Owner (from TEAM_PLAN) | Status | Our responsibility |
|---|---|---|---|
| Frontend (Agent City map, timeline, panels) | FDE4 | **EXISTS** on `master` branch | Zero changes — expose data only |
| TypeScript scanner (`ts-scan.mjs`) | FDE1 | **EXISTS** on `master` branch | Zero changes |
| PRD API contract (section 13) | CP2 | Defined in `web/lib/types.ts` | Implement exactly |
| Python scanner (ast, sqlglot) | FDE1 | TODO | Build here |
| Cross-layer linker | FDE1 | TODO | Build here |
| Graph store (NetworkX + graph.json) | FDE1 | TODO | Build here |
| Impact engine (traversal, risk, waves) | FDE2 | TODO | Build here |
| Orchestrator (permits, waves, bob -p) | FDE2 | TODO | Build here |
| MCP server (SystemDNA tools) | FDE3 | TODO | Build here |
| Bob modes (Cartographer, Fixer, etc.) | FDE3 | TODO | Build here (`.bob/`) |
| Bob hooks (permit_check, report) | FDE3 | TODO | Build here |
| FastAPI event server (REST + WebSocket) | CP2 | TODO | Build here |
| EC2 Docker Compose + bootstrap | CP2 | TODO | Build here |
| AG2 Cartographer subagents | FDE3 (with AG2) | TODO | Build here |
| AG2 Fixer agents (one per fix unit) | FDE2 (with AG2) | TODO | Build here |
| AG2 Inspector agent | FDE3 (with AG2) | TODO | Build here |

**Arnav's lane (this branch):** the entire Python/agent engine — scanners, linker,
graph store, impact engine, orchestrator, AG2 agent network, MCP server, Bob modes,
hooks, FastAPI server, and Docker Compose. The Gemini API key drives the AG2 agents.

---

## 3. API Contract (exact — from `web/lib/api.ts` and `web/lib/types.ts`)

The frontend calls these endpoints when `NEXT_PUBLIC_API_URL` is set. We implement
them exactly; no extra fields, no renamed paths.

| Method | Path | Request body | Response |
|---|---|---|---|
| `GET` | `/graph` | — | `Graph` (section 7 schema) |
| `GET` | `/node/{id}` | — | `GraphNode` |
| `POST` | `/changes` | `ChangeRequest` | `{ change_id: string, report: ImpactReport }` |
| `GET` | `/changes/{id}` | — | `Change` |
| `POST` | `/changes/{id}/approve` | — | `{}` |
| `POST` | `/changes/{id}/run` | — | `{}` |
| `GET` | `/changes/{id}/diff` | — | `{ before: number, after: number, edges: ... }` |
| `GET` | `/changes/{id}/metrics` | — | metrics object |
| `POST` | `/events` | `RunEvent` | `{}` |
| `WS` | `/ws` | — | streams `RunEvent` JSON |
| `GET` | `/replay/{id}` | — | `RunEvent[]` |

**`ChangeRequest`** (from `types.ts`):
```typescript
{ node: string; change: "rename" | "type_change" | "delete"; to: string }
```

**`RunEvent`** fields the frontend reads (must match exactly):
`ts`, `change_id`, `event` (one of 17 `RunEventType` values), `agent_id`,
`session_id`, `wave`, `tool`, `file`, `node`, `permit_ok`, `detail`,
`bobcoins`, `data`.

**`Graph`** schema (PRD section 7): `repo`, `scannedAt`, `layers` (LayerDef[]),
`nodes` (GraphNode[]), `edges` (GraphEdge[]), `textIndex`, `files` (RepoFile[]).

---

## 4. `graph.json` Node and Edge Schemas (exact — from `types.ts`)

### Node fields
```
id           layer:type:qualified_name  e.g. "db:column:orders.cust_id"
type         Table | Column | SQLModel | SparkJob | Module | Function |
             ORMModel | Schema | Field | Endpoint | TSType | TSField |
             Component | Dashboard | Dataset | Constant | Page |
             Test | Doc | BusinessProcess
layer        database | pipelines | backend | api | frontend |
             dashboards | business | quality
name         human-readable name
file         relative path from repo root
line         line number (optional)
parent       parent node id (column → table, field → model)
owner        team/person string
pii          boolean
criticality  low | medium | high
tested       boolean
tokens       string[] — plain-text identifiers in the file (for grep comparison)
```

### Edge fields
```
id           unique string
from         source node id
to           downstream node id (to depends on from)
type         DERIVES_FROM | READS | WRITES | MAPS_TO | SERIALIZES |
             RETURNS | CONSUMES | TYPED_AS | IMPORTS | CALLS |
             TESTS | DOCUMENTS | SUPPORTS
source       parser | bob
confidence   high | medium | low
evidence     "file:line" string
rule         rename_ref | keep_alias | update_type | update_doc | passthrough
```

### 7 Layers
```
database    → pipelines → backend → api → frontend → dashboards → business
quality (tests + docs) drawn as a row under the city (column = -1)
```

---

## 5. RunEvent types the orchestrator must emit

The frontend's `run-state.ts` `deriveRun()` function reads these event types to
drive all UI state. The orchestrator MUST emit them in this order during a run:

```
impact_ready         after POST /changes analysis completes
awaiting_approval    when a db/PII fix unit needs human approval
approved             when the developer approves
wave_started         at the start of each wave (wave field = wave number)
agent_started        when a bob -p worker starts (agent_id, node, file, wave)
tool_call            on each Bob tool call (tool, file, permit_ok, bobcoins)
blocked              when permit_check exits with code 2 (detail = reason)
check_passed / check_failed   after per-node verify
retrying             when a failed node retries
done                 when an agent's node is fully fixed and verified
quarantined          after 2 blocked actions or budget exceeded
wave_completed       when all nodes in a wave are done
rescan               after the graph re-scan (data.before, data.after = dangling counts)
inspector            after Inspector review (data.verdict, data.issues)
pr_created           after branch + PR created (data.branch, data.simulated)
change_completed     final event
```

---

## 6. Sub-Tasks

---

### Sub-Task 1 — Project Scaffold

**Status:** `[ ] pending`

**Intent:**
Create the `systemdna/` directory structure on `arnav-branch-agents`, matching the
layout in PRD section 14, with stubs for every module, a `requirements.txt`, and a
`docker-compose.yml`.

**Expected Outcomes:**
- `systemdna/core/` package with stubs for all Python modules
- `systemdna/server/` package stub
- `systemdna/hooks/` directory with stub scripts
- `systemdna/prompts/` directory
- `systemdna/deploy/docker-compose.yml` — api, mcp, orchestrator, engine containers
- `systemdna/deploy/bootstrap.sh` — installs Docker + Bob Shell on EC2
- `requirements.txt` with all Python deps pinned
- `.env.example` with all required env vars
- `.bob/settings.json` with hook config (PRD section 13)

**Todo List:**
1. Create directory tree matching PRD section 14 layout exactly
2. Write `requirements.txt`: `fastapi`, `uvicorn`, `websockets`, `networkx`,
   `sqlglot`, `gitpython`, `tree-sitter`, `pyautogen[gemini]`, `opentelemetry-sdk`,
   `opentelemetry-exporter-otlp`, `redis`, `boto3` (for S3/DynamoDB), `pytest`, `ruff`
3. Write `systemdna/deploy/docker-compose.yml` with four services: `engine`, `api`,
   `mcp`, `orchestrator`; all share a volume for the repo workspace
4. Write `systemdna/deploy/bootstrap.sh`: install Docker, Docker Compose, Bob Shell,
   clone repo, copy `.env`, `docker compose up -d`
5. Write `.env.example`: `GEMINI_API_KEY`, `GITHUB_TOKEN`, `DEMO_TOKEN`, `S3_BUCKET`,
   `DYNAMODB_TABLE`, `REPO_WORKSPACE`, `BOB_API_KEY`
6. Write `.bob/settings.json` exactly as in PRD section 13
7. Write `systemdna/Dockerfile` for all four service containers

**Relevant Context:**
- PRD section 14 defines the target repo layout; match it exactly
- `.bob/settings.json` hook config must exactly match PRD section 13 — the field names
  `permit_check.py` reads come from real hook payloads
- EC2: Ubuntu 22.04 or Amazon Linux 2023, t3.xlarge

---

### Sub-Task 2 — Python Scanner (F01, F02, F03, F04)

**Status:** `[ ] pending`

**Intent:**
Build the three language scanners and the config scanner that produce nodes and
in-language edges from a repo. These implement F01–F04 and form Pass 1 of the
3-pass graph build (PRD section 7).

**Expected Outcomes:**
- `systemdna/core/scanner/python_scan.py` — scans Python files via `ast`:
  modules, classes, functions, imports, calls, FastAPI routes, Pydantic schemas,
  SQLAlchemy models, PySpark reads/writes
- `systemdna/core/scanner/sql_scan.py` — scans SQL via `sqlglot`: tables, columns,
  column-level lineage including aliases (the alias trap from ShopFlow)
- `systemdna/core/scanner/ts_scan.py` — calls the existing `ts-scan.mjs` via
  subprocess and parses its output (do NOT rewrite it)
- `systemdna/core/scanner/config_scan.py` — scans dashboard YAML and
  `processes.yaml`
- Each scanner returns a list of `GraphNode` dicts and `GraphEdge` dicts matching
  the exact schema from section 4 above
- Unit tests in `tests/` covering at least the ShopFlow fixture files

**Todo List:**
1. Write `systemdna/core/scanner/python_scan.py` — walk `.py` files, use `ast.parse`,
   extract: `Module`, `Class`, `Function`, `ORMModel` (SQLAlchemy), `Schema` (Pydantic),
   `Field`, `Endpoint` (FastAPI `@router.get/post`), `SparkJob` (`spark.table`,
   `.select`, `.write`); emit `IMPORTS` and `CALLS` edges with `evidence` as `"file:line"`
2. Write `systemdna/core/scanner/sql_scan.py` — use `sqlglot.parse` + lineage API;
   extract `Table`, `Column` nodes; emit `DERIVES_FROM` edges with `rule=keep_alias`
   for aliased columns (detect `SELECT x AS y`) and `rule=rename_ref` otherwise
3. Write `systemdna/core/scanner/ts_scan.py` — subprocess-call `node ts-scan.mjs
   <repo_path>`, parse stdout JSON, normalise to `GraphNode`/`GraphEdge` schema;
   set `source=parser`, `confidence=high`
4. Write `systemdna/core/scanner/config_scan.py` — parse `*.yaml` files: if a file
   matches `processes.yaml` extract `BusinessProcess` nodes; if it is a dashboard YAML
   extract `Dashboard` nodes with `source:` line as edge evidence
5. Write `systemdna/core/scanner/__init__.py` exposing `scan_repo(path) -> (nodes, edges)`
   that calls all four scanners and merges results
6. Write `tests/test_python_scan.py`, `tests/test_sql_scan.py`,
   `tests/test_config_scan.py` using ShopFlow fixture files

**Relevant Context:**
- ShopFlow has 3 traps: alias chain in `stg_orders.sql` (sql_scan must catch it),
  dynamic SQL in `export_job.py` (python_scan emits medium-confidence node; AG2
  Cartographer fills the gap), cross-language link (linker handles it)
- Node id format: `layer:type:qualified_name` — match exactly what `shopflow.ts` uses
- `tokens[]` field: list of plain-text identifiers in the file (used by grep comparison)
- Scanner must complete in under 5 seconds on ShopFlow (PRD success metric)

---

### Sub-Task 3 — Cross-Layer Linker (F05)

**Status:** `[ ] pending`

**Intent:**
Build the linker that takes the combined output of all four scanners and adds the
cross-language edges that connect ORM to table, schema to ORM, route to fetch URL,
TS field to API field, and dashboard to model column.

**Expected Outcomes:**
- `systemdna/core/linker.py` — `Linker.link(nodes, edges) -> edges` that applies
  cross-layer rules and returns additional edges
- Edges added: `MAPS_TO` (ORM → table column), `SERIALIZES` (Schema → ORM field),
  `RETURNS` (Endpoint → Schema), `CONSUMES` (Component → Endpoint), `TYPED_AS`
  (TSField → API Field), `SUPPORTS` (Dashboard → BusinessProcess)
- All added edges have `source=parser`, `confidence=high`, `rule` set correctly

**Todo List:**
1. Write `systemdna/core/linker.py` — `Linker` class with rule methods:
   - `_link_orm_to_table(nodes)`: match `ORMModel.__tablename__` to `Table.name` →
     `MAPS_TO` edges
   - `_link_schema_to_orm(nodes)`: match `Schema` fields to `ORMModel` fields by name →
     `SERIALIZES` edges
   - `_link_route_to_schema(nodes)`: match `Endpoint` return annotation to `Schema` →
     `RETURNS` edges
   - `_link_fetch_to_endpoint(nodes, edges)`: match `fetch()` URL in Component to
     `Endpoint.name` → `CONSUMES` edges
   - `_link_ts_to_api(nodes)`: match `TSField.name` to `Field.name` in same-named
     parent types → `TYPED_AS` edges
   - `_link_dashboard_to_business(nodes, edges)`: follow `Dashboard` → `SQLModel` →
     `BusinessProcess` via `SUPPORTS` edges
2. Write `tests/test_linker.py` using ShopFlow nodes/edges; verify that all 5
   cross-language edges from `shopflow.ts` are produced

**Relevant Context:**
- Cross-language edges are the third trap that grep cannot find
- `rule` for each edge type: ORM→table = `rename_ref`, schema→ORM = `rename_ref`,
  route→schema = `passthrough`, component→endpoint = `passthrough`, TS→API = `rename_ref`
- Linker runs after all scanners; it receives the merged node/edge lists

---

### Sub-Task 4 — Graph Store (F06)

**Status:** `[ ] pending`

**Intent:**
Build the graph store that holds the graph in NetworkX in memory, saves/loads
`graph.json` (locally and to S3), and exposes the typed Python and REST interfaces
the rest of the system uses.

**Expected Outcomes:**
- `systemdna/core/graph.py` — `GraphStore` class
- `graph.json` saved to disk and optionally to `S3_BUCKET`
- `GET /graph` endpoint returns a `Graph` JSON object matching `types.ts` exactly
- `GET /node/{id}` returns one `GraphNode`

**Todo List:**
1. Write `systemdna/core/graph.py` — `GraphStore`:
   - `build(nodes, edges, repo, scanned_at)` — constructs `networkx.DiGraph`
   - `to_json() -> dict` — serialises to `Graph` schema (layers, nodes, edges,
     textIndex, files)
   - `save_local(path)` — writes `graph.json`
   - `save_s3(bucket, key)` — uploads to S3 (requires `boto3`)
   - `load_local(path)` and `load_s3(bucket, key)`
   - `get_node(id) -> GraphNode`
   - `get_downstream(node_id, depth) -> list[str]` — BFS traversal
2. Write `systemdna/server/routes/graph.py` — `GET /graph` and `GET /node/{id}`
   FastAPI route handlers; read from `GraphStore`
3. Write `tests/test_graph.py` — round-trip test: build from ShopFlow fixture,
   serialise, deserialise, assert node count and edge count match

**Relevant Context:**
- NetworkX (not Neo4j) — PRD explicitly says no graph database
- `textIndex`: `Record<string, string[]>` — word → files containing it (for grep
  comparison); build from `GraphNode.tokens[]`
- `files[]` (RepoFile[]): `path`, `dir`, `lines`, `language`, `imports` — the 3D city
  uses this for building heights

---

### Sub-Task 5 — AG2 Cartographer Subagents (F07, F08)

**Status:** `[ ] pending`

**Intent:**
Build the AG2-powered enrichment pass (Pass 3). Parallel Cartographer subagents,
one per layer, find edges that parsers missed (especially dynamic SQL). A separate
Document Understanding subagent reads `data_dictionary.pdf` and ADRs to add
`owner`, `pii`, and `criticality` attributes. All agent calls use the Gemini API.

**Expected Outcomes:**
- `systemdna/core/cartographers.py` — `CartographerOrchestrator` that spawns one
  AG2 GroupChat per layer in parallel, collects JSON edges with evidence, validates
  them, and merges into the graph
- AG2 agents configured with Gemini 1.5 Pro via `GEMINI_API_KEY`
- New edges added with `source=bob`, `confidence=medium`
- `systemdna/core/document_understanding.py` — `DocUnderstandingAgent` that reads
  PDF + ADR markdown and returns node attribute patches
- Edges without evidence (file+line) are rejected

**Todo List:**
1. Write `systemdna/core/cartographers.py`:
   - `CartographerAgent(layer, files, nodes, unresolved_refs)` — AG2 `AssistantAgent`
     with system prompt: "You are a Cartographer for the `{layer}` layer. Find
     dependency edges the parser missed. Return JSON only:
     `[{from, to, type, rule, evidence, confidence}]`. Reject any edge without a
     file:line evidence string."
   - `CartographerOrchestrator.enrich(graph_store)` — runs one Cartographer per
     layer in parallel using Python `asyncio`; merges returned edges; calls
     `graph_store.add_edges()`
   - LLM config: `{"model": "gemini-1.5-pro", "api_key": os.getenv("GEMINI_API_KEY"),
     "api_type": "google"}`
2. Write `systemdna/core/document_understanding.py`:
   - `DocUnderstandingAgent` — AG2 `AssistantAgent` that reads PDF text (via
     `pypdf`) and ADR markdown, returns JSON patches:
     `[{node_id, owner, pii, criticality, business_meaning}]`
   - `DocUnderstandingOrchestrator.enrich(graph_store, doc_paths[])` — applies patches
3. Write `tests/test_cartographers.py` — mock LLM responses; verify edge validation
   (edge without evidence is rejected; edge with evidence is merged)

**Relevant Context:**
- The dynamic SQL trap in ShopFlow (`export_job.py`) is the key test: `export_job`
  builds `f"SELECT {col} FROM orders"` — the Cartographer must find this and return
  an edge with `confidence=medium` and a line-number evidence
- Keep AG2 GroupChat pattern: `AssistantAgent` + `UserProxyAgent`, `max_turns=5`
  per Cartographer to stay within Bobcoin budget
- `source=bob` edges show "Found by Bob" badges in the UI (FDE4's confidence badges)

---

### Sub-Task 6 — Impact Engine (F10–F15)

**Status:** `[ ] pending`

**Intent:**
Implement the impact engine that takes a `ChangeRequest` and returns a full
`ImpactReport` — matching the `ImpactReport` type in `types.ts` exactly. This is
what `POST /changes` returns.

**Expected Outcomes:**
- `systemdna/core/impact.py` — `ImpactEngine` class
- `ImpactEngine.analyse(graph_store, request) -> ImpactReport` completes in <1 second
- Alias rule correctly applied (nodes downstream of an alias are `safe`)
- Business impact populated from `SUPPORTS` edges
- Risk score formula: `0.35*fanout + 0.30*criticality + 0.20*pii + 0.15*untested`
- Wave planner uses topological sort
- `grep` field populated from `textIndex`

**Todo List:**
1. Write `systemdna/core/impact.py` — `ImpactEngine`:
   - `_walk_downstream(graph, node_id, change)` — BFS following outgoing edges;
     apply edge `rule` to determine severity:
     - `rename_ref` → `breaking`
     - `keep_alias` → `needs_update` (stop walking — downstream is safe)
     - `update_type` → `needs_update`
     - `update_doc` → `update`
     - `passthrough` → continue walking, `safe`
   - `_business_impact(graph, affected_ids)` — walk `SUPPORTS` edges from affected
     `Dashboard` nodes to `BusinessProcess` nodes
   - `_risk_score(node, fanout, max_fanout)` — apply PRD formula
   - `_plan_waves(affected_nodes, graph)` — topological sort → wave groups
   - `_grep_comparison(graph, change)` — use `graph.textIndex` to find files
     containing the old name; compare with affected nodes
   - `analyse(graph_store, request) -> ImpactReport` — runs all steps, returns
     typed dict matching `ImpactReport` from `types.ts`
2. Write `tests/test_impact.py` using ShopFlow graph; assert:
   - `orders.cust_id` rename affects exactly the nodes in `answer_key.json`
   - `stg_orders.customer_key` is `safe` (alias trap works correctly)
   - `export_job` is flagged with `confidence=medium`
   - `biz:revenue_close` is in `business` list

**Relevant Context:**
- `ImpactItem`: `nodeId`, `severity`, `depth`, `risk`, `viaEdge`, `confidence`,
  `needsApproval` (true for `db` layer and `pii=true` nodes)
- `FixUnit`: `id` = file path, `assets`, `nodes`, `wave`, `needsApproval`
- `levels[]` field is used by the ripple animation — node ids grouped by BFS depth
- `danglingRefs`: count of edges in the graph that still point to the old name
  (computed after the change; 0 at analysis time, updated after re-scan)

---

### Sub-Task 7 — FastAPI Event Server (F30, REST + WebSocket)

**Status:** `[ ] pending`

**Intent:**
Build the FastAPI server that implements the full PRD section 13 REST and WebSocket
API. This is what the frontend connects to when `NEXT_PUBLIC_API_URL` is set.

**Expected Outcomes:**
- `systemdna/server/app.py` — FastAPI app with all 11 endpoints
- `systemdna/server/store.py` — event storage using DynamoDB in production and
  SQLite locally (switch via `USE_DYNAMO` env var)
- `WS /ws` streams every `RunEvent` to all connected dashboard clients
- `POST /events` receives events from hooks and orchestrator and broadcasts via WebSocket

**Todo List:**
1. Write `systemdna/server/store.py` — `EventStore`:
   - `SQLiteStore` (local dev): `events` table, `changes` table
   - `DynamoStore` (production): key=`change_id`, sort=`ts`
   - Both implement `save_event(ev)`, `get_events(change_id)`,
     `save_change(change)`, `get_change(change_id)`
2. Write `systemdna/server/ws.py` — `ConnectionManager`: `connect(ws)`,
   `disconnect(ws)`, `broadcast(event_json)` using `asyncio`
3. Write `systemdna/server/app.py` — FastAPI app:
   - `GET /graph` → `graph_store.to_json()`
   - `GET /node/{id}` → `graph_store.get_node(id)`
   - `POST /changes` → run `ImpactEngine.analyse`, save change, return
     `{change_id, report}`
   - `GET /changes/{id}` → `store.get_change(id)` returning `Change`
   - `POST /changes/{id}/approve` → save approval event, broadcast
   - `POST /changes/{id}/run` → trigger orchestrator
   - `GET /changes/{id}/diff` → graph diff after re-scan
   - `GET /changes/{id}/metrics` → timing, cost, agent counts from events
   - `POST /events` → `store.save_event(ev)`, `ws.broadcast(ev)`
   - `WS /ws` → WebSocket endpoint using `ConnectionManager`
   - `GET /replay/{id}` → `store.get_events(id)`
4. Write `tests/test_api.py` using `TestClient` and the ShopFlow fixture

**Relevant Context:**
- Bearer token auth: check `Authorization: Bearer {DEMO_TOKEN}` on write endpoints
  (`POST /changes`, approve, run, `/events`)
- CORS: allow `*` origins for the hackathon demo
- All `RunEvent` JSON must match `types.ts` field names exactly (snake_case)

---

### Sub-Task 8 — Orchestrator (F20, F22, F23, F26)

**Status:** `[ ] pending`

**Intent:**
Build the orchestrator that issues permits, starts `bob -p` workers in parallel
per wave (or AG2 Fixer agents as fallback), waits for each wave to complete,
verifies each node, retries once on failure, and creates the final PR.

**Expected Outcomes:**
- `systemdna/orchestrator.py` — `Orchestrator` class
- `systemdna/hooks/permit_check.py` — `PreToolUse` hook (blocks out-of-permit edits,
  exit code 2)
- `systemdna/hooks/report.py` — `SessionStart`, `PostToolUse`, `Stop` hook (posts
  events to `/events`)
- One clean end-to-end run on ShopFlow: all nodes fixed, 0 dangling refs, PR created

**Todo List:**
1. Write `systemdna/hooks/permit_check.py`:
   - Read JSON from stdin (Bob hook payload)
   - Find permit at `.systemdna/permits/{agent_id}.json`
   - If tool writes a file not on `allowed_files`, or breaks a district rule:
     post `blocked` event to `/events`, exit 2
   - Otherwise post `tool_call` event, exit 0
   - Accept both `tool` and `tool_name`, both `path` and `file_path` from payload
     (PRD section 13 note)
2. Write `systemdna/hooks/report.py`:
   - On `SessionStart`: post `agent_started` event
   - On `PostToolUse`: post `tool_call` event (or `blocked` if exit_code=2)
   - On `Stop`: post `done` or `check_failed` event
3. Write `systemdna/orchestrator.py` — `Orchestrator`:
   - `run_change(change_id, report, graph_store, event_store)`:
     - Emit `awaiting_approval` for db/PII nodes; wait for `POST /changes/{id}/approve`
     - For each wave:
       - Write permits to `.systemdna/permits/{unit_id}.json`
       - Emit `wave_started`
       - Start up to N `bob -p` workers in parallel (N from env `MAX_WORKERS`,
         default 3); if `bob -p` unavailable, fall back to AG2 Fixer agents
       - Wait for all workers in wave to emit `done` or `check_failed`
       - If `check_failed`: retry once with error message
       - Emit `wave_completed`
     - After last wave: re-scan with scanner, diff graph, emit `rescan`
     - Run AG2 Inspector agent, emit `inspector`
     - Create branch + PR on GitHub, emit `pr_created`
     - Emit `change_completed`
4. Write `systemdna/core/verify.py` — `Verifier.verify_node(node, repo_path)`:
   runs `sqlglot.parse`, `ruff check`, `tsc --noEmit`, `pytest -x -k <node>`;
   returns `{passed: bool, detail: str}`
5. Write `systemdna/core/pr.py` — `PRCreator.create_pr(repo_path, change_id,
   report, diff)`: creates branch, commits, pushes, opens PR via GitHub REST API

**Relevant Context:**
- Permit JSON schema (PRD section 9): `agent_id`, `change_id`, `node`,
  `allowed_files[]`, `max_cost`, `max_turns`, `needs_approval`
- `bob -p` command template (PRD section 9): include change, node, evidence,
  edge rule, permit in the prompt file
- Concurrency limit: `MAX_WORKERS` env var (3–5 for EC2 t3.xlarge)
- Fallback: if Bob Shell not available, use AG2 Fixer agents (next sub-task)

---

### Sub-Task 9 — AG2 Fixer & Inspector Agents (F19, F25)

**Status:** `[ ] pending`

**Intent:**
Build the AG2-powered Fixer agents (the fallback when `bob -p` workers cannot run)
and the Inspector agent that reviews the full diff. The Fixer uses the
`propagate-rename` skill logic encoded as a system prompt.

**Expected Outcomes:**
- `systemdna/core/agents/fixer.py` — `FixerAgent` (AG2 AssistantAgent) that applies
  the `propagate-rename` recipe for a given file type, within its permit
- `systemdna/core/agents/inspector.py` — `InspectorAgent` that reviews the full diff
  against the impact report
- Both emit `RunEvent` JSON to `/events` as they work

**Todo List:**
1. Write `systemdna/core/agents/fixer.py` — `FixerAgent(unit, permit, change, graph)`:
   - AG2 `AssistantAgent` with Gemini LLM config
   - System prompt includes: the change, the node, evidence lines, the edge rule,
     what the upstream change already made, and the permit
   - Tools registered: `read_file(path)`, `write_file(path, content)`,
     `run_verify(node)` — all tool calls emit `RunEvent` to `/events`
   - `FixerGroupChat`: `FixerAgent` + `UserProxyAgent` in a GroupChat;
     `max_turns=12`, `max_cost=2`
   - `run()` method: initiate chat → collect result → emit `done` or `check_failed`
2. Write `systemdna/core/agents/inspector.py` — `InspectorAgent(diff, report)`:
   - AG2 `AssistantAgent` with Gemini LLM config
   - System prompt: "You are the Inspector. Review the diff against the impact report.
     List any problems. Return JSON: `{verdict: approved|needs_revision, issues: int,
     details: [str]}`"
   - Tools: `read_file(path)` only (read-only mode)
   - `run()` → returns inspector result dict
3. Write `tests/test_fixer.py` — mock LLM; verify that fixer only writes to
   `allowed_files` (otherwise the test should fail with a permit violation error)

**Relevant Context:**
- `propagate-rename` recipes per file type (PRD section 12, F19):
  - SQL: rename column references, update aliases
  - PySpark: rename string references and column selects
  - ORM/Pydantic: rename field attribute
  - TypeScript: rename interface field and all usages
  - YAML: rename source field
  - Tests: rename assertions
  - Docs: rename mentions
- AG2 fixer is the fallback only; `bob -p` is preferred
- Fixer must check `allowed_files` at every write — post `blocked` + exit if violated

---

### Sub-Task 10 — MCP Server (F17)

**Status:** `[ ] pending`

**Intent:**
Build the SystemDNA MCP server that gives Bob IDE the tools to drive a change from
within the Change Planner mode. This is what FDE3 calls from Bob IDE.

**Expected Outcomes:**
- `systemdna/mcp_server.py` — FastMCP server with 7 tools matching PRD section 13
- MCP server reachable over HTTPS (behind load balancer in production)
- Protected by `DEMO_TOKEN`

**Todo List:**
1. Write `systemdna/mcp_server.py` using `mcp` (FastMCP) Python package:
   - `scan_repo(path: str) -> dict` — calls `scan_repo()`, builds graph, returns
     node/edge counts and S3 path
   - `get_impact(node: str, change: str, to: str) -> dict` — calls
     `ImpactEngine.analyse()`, returns `ImpactReport` JSON
   - `plan_change(change_id: str) -> dict` — returns waves, permits, approvals needed
   - `start_wave(change_id: str, wave: int) -> dict` — calls `orchestrator.start_wave()`
   - `get_status(change_id: str) -> dict` — returns agent and node states
   - `approve(change_id: str, node: str) -> dict` — records approval
   - `verify(change_id: str) -> dict` — returns check results, dangling ref count,
     graph diff
2. Add auth middleware: check `Authorization: Bearer {DEMO_TOKEN}`
3. Write `tests/test_mcp.py` — call each tool via `mcp` test client

**Relevant Context:**
- FastMCP HTTP transport (not stdio) so Bob IDE can reach it through the load balancer
- Tool names must match exactly what FDE3 configured in the Bob modes

---

### Sub-Task 11 — Bob Modes & Skill (F18, F19)

**Status:** `[ ] pending`

**Intent:**
Create the four custom Bob modes and the `propagate-rename` Skill that FDE3 uses
from Bob IDE. These go in `.bob/modes/` and `.bob/skills/propagate-rename/`.

**Expected Outcomes:**
- `.bob/modes/cartographer.yaml`
- `.bob/modes/change-planner.yaml`
- `.bob/modes/fixer.yaml`
- `.bob/modes/inspector.yaml`
- `.bob/skills/propagate-rename/SKILL.md`
- All modes reference the MCP server tools correctly

**Todo List:**
1. Read the Bob docs format for custom modes and Skills (from `AGENTS.md` note about
   `node_modules/next/dist/docs/` — check IBM Bob docs via `search_ibm_docs`)
2. Write `.bob/modes/cartographer.yaml` — read-only mode; instructions: scan one
   layer, return JSON edges with evidence
3. Write `.bob/modes/change-planner.yaml` — read + MCP mode; instructions: call
   `get_impact` and `plan_change`, show report, ask for approval, call `start_wave`
4. Write `.bob/modes/fixer.yaml` — read + edit mode (permit-limited); instructions:
   apply the `propagate-rename` Skill for this node, run verify, report done
5. Write `.bob/modes/inspector.yaml` — read-only mode; instructions: review diff
   against impact report, return verdict
6. Write `.bob/skills/propagate-rename/SKILL.md` — Skill with fix recipes per file
   type (SQL, PySpark, ORM, Pydantic, TypeScript, YAML, Tests, Docs)

**Relevant Context:**
- Bob mode and Skill file formats must follow IBM Bob docs exactly
- FDE3 owns these files too — this branch provides the initial versions for alignment
- Change Planner mode is the developer's entry point (PRD section 9, step 1)

---

### Sub-Task 12 — EC2 Deployment & Smoke Test

**Status:** `[ ] pending`

**Intent:**
Deploy all containers to EC2, verify the full flow works end-to-end with ShopFlow,
and confirm the frontend (`master` branch) can connect to the live API.

**Expected Outcomes:**
- All Docker Compose services healthy on EC2
- `POST /changes` with ShopFlow `orders.cust_id` rename returns correct `ImpactReport`
- All 17 affected nodes found (matching `answer_key.json`)
- WebSocket stream delivers all `RunEvent` types to the dashboard
- `GET /changes/{id}/diff` returns `after: 0` dangling references
- `systemdna/DEPLOYMENT.md` documents every step

**Todo List:**
1. Provision EC2 t3.xlarge (Ubuntu 22.04 or Amazon Linux 2023); open ports 8080 (API),
   3000 (MCP), 443 (behind ALB)
2. Run `systemdna/deploy/bootstrap.sh` via SSH with EC2 key
3. Copy `.env` with `GEMINI_API_KEY`, `GITHUB_TOKEN`, `DEMO_TOKEN` to EC2
4. Run `systemdna/deploy/deploy.sh` (rsync + `docker compose up -d --build`)
5. Clone ShopFlow to `REPO_WORKSPACE/shopflow/` on EC2
6. Scan: `POST /graph` → verify node count ≥ 30
7. Change: `POST /changes {"node":"db:column:orders.cust_id","change":"rename","to":"customer_id"}`
8. Verify impact report: all 17 nodes from `answer_key.json` present
9. Run: `POST /changes/{id}/run` → watch WebSocket for all event types
10. Verify: `GET /changes/{id}/diff` → `after: 0`
11. Connect frontend: set `NEXT_PUBLIC_API_URL=http://<ec2-ip>:8080` in the web app
    `.env.local` and verify city map renders real data
12. Write `systemdna/DEPLOYMENT.md`

**Relevant Context:**
- ShopFlow is built by FDE2 — until it exists, use the fixture from `web/lib/mock/shopflow.ts`
  to generate synthetic ShopFlow files for scanner testing
- Do NOT commit `GEMINI_API_KEY` or any secret
- EC2 security group: 8080 internal only (behind ALB); 443 public via ALB

---

## 7. Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Graph database | NetworkX + `graph.json` | PRD explicitly says no graph DB; NetworkX is enough for 500 nodes |
| LLM (agents) | Gemini 1.5 Pro via `GEMINI_API_KEY` | User-provided key; AG2 supports Gemini natively |
| Agent framework | AG2 (AutoGen v2) | Requested; GroupChat for Cartographers; simple AssistantAgent for Fixer/Inspector |
| AG2 pattern | AssistantAgent + UserProxyAgent GroupChat | `speaker_selection_method="auto"` for Cartographers; direct chat for Fixer |
| Impact engine | Pure Python (NetworkX BFS + topological sort) | Under 1 second requirement; no LLM needed for traversal |
| API server | FastAPI + WebSocket | PRD spec; matches `web/lib/api.ts` exactly |
| Event storage | SQLite (local) / DynamoDB (production) | SQLite for hackathon laptop dev; DynamoDB on EC2 |
| S3 | `graph.json` versions, replays, reports | PRD architecture |
| Bob modes | 4 custom modes + propagate-rename Skill | PRD F18, F19 |
| Bob hooks | `permit_check.py` + `report.py` | PRD F21, F29 |
| Corrections scope | Rename only for hackathon; guided by permits | PRD section 3: rename working end-to-end is the target |
| Frontend | Zero changes to `master` branch | API contract only |
| TypeScript scanner | Call existing `ts-scan.mjs` via subprocess | It already exists; do not duplicate |

---

## 8. answer_key.json (ShopFlow hero change)

The impact engine output for `rename orders.cust_id → customer_id` must match this.
FDE2 writes the authoritative version; this is our working reference from the PRD.

Expected affected nodes (17):
```
db:column:orders.cust_id          breaking    wave 0 (the change itself)
pipe:sqlmodel:stg_orders          needs_update wave 1 (alias rule — only source side)
pipe:sparkjob:churn_job           breaking    wave 1
pipe:sparkjob:export_job          breaking    wave 1 (medium confidence — dynamic SQL)
pipe:sqlmodel:dim_customer        breaking    wave 1
be:orm:Order                      breaking    wave 2
be:field:Order.cust_id            breaking    wave 2
be:schema:OrderOut                breaking    wave 2
be:field:OrderOut.cust_id         breaking    wave 2
be:function:list_orders           needs_update wave 2
api:endpoint:get_orders           needs_update wave 3
fe:tstype:Order                   breaking    wave 3
fe:tsfield:Order.cust_id          breaking    wave 3
fe:component:OrdersTable          breaking    wave 3
fe:component:CustomerPage         breaking    wave 3
qa:test:test_routes               update      wave 4
qa:test:test_transforms           update      wave 4
qa:test:orders_table              update      wave 4
qa:doc:data_dictionary            update      wave 4
qa:doc:adr_003                    update      wave 4
qa:doc:changelog                  update      wave 4
```

Nodes NOT affected (safe via alias):
```
pipe:column:stg_orders.customer_key   safe (keep_alias rule — downstream of alias)
pipe:sqlmodel:fct_revenue             safe (uses customer_key, not cust_id)
dash:revenue                          safe (uses customer_key via fct_revenue)
```

Business processes affected (via SUPPORTS):
```
biz:retention_review   (via churn dashboard)
```
