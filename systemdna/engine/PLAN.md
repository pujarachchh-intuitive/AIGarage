# SystemDNA — Agent Engine Plan
## Branch: `arnav/agent-engine`

> **Scope:** This folder (`systemdna/engine/`) is the only thing we build.
> The frontend (`systemdna/web/`) and TypeScript scanner (`systemdna/core/scanner/`)
> already exist on `master` and are **never touched**.
> We expose data to the frontend through the exact API contract in
> `systemdna/web/lib/types.ts` and `systemdna/web/lib/api.ts`.

---

## What We Are Building

**SystemDNA** ingests a repo, builds a 7-layer cross-language knowledge graph, 
predicts the full ripple of a code change, then sends AG2 agents to fix every 
affected component in dependency order — governed by permits, verified by a 
re-scan, and **visible live** in the existing Agent City UI.

The agent engine combines:
- **AG2 (AutoGen v2)** — GroupChat-based Cartographer, Fixer, and Inspector agents
- **LangGraph** — durable, resumable pipeline connecting scan → enrich → impact → fix → verify
- **LangChain** — LLM calls, tool definitions, and document loaders (PDF, markdown)
- **Neo4j** — persistent knowledge graph store (replaces the PRD's NetworkX choice for durability)
- **ChromaDB** — vector store for semantic search across code entities
- **Gemini 1.5 Pro** — LLM for all AG2 agents (Cartographer, Fixer, Inspector)
- **FastAPI + WebSocket** — event server; every agent action streams live to the UI
- **Redis** — LangGraph checkpoint store (fault-tolerant pipeline resume)
- **Bob Shell + hooks** — primary worker executor; AG2 is the fallback

Every agent action, LangGraph node transition, and tool call streams a `RunEvent`
to the frontend via `WS /ws`. The UI renders it live in the Agent City map, trace
timeline, agents table, and governance panel — **nothing is background-only**.

---

## Architecture

```
Developer (Bob IDE)
    │  Change Planner mode
    │  POST /changes  {node, change, to}
    ▼
FastAPI :8080
    │
    ├── GET /graph          ──► Neo4j + ChromaDB ──► Graph JSON ──► Agent City map
    │
    ├── POST /changes       ──► ImpactEngine (LangGraph node, pure BFS) ──► ImpactReport
    │                             ↳ RunEvent: impact_ready ──► WS ──► UI
    │
    └── POST /changes/{id}/run
             │
             ▼
        LangGraph Pipeline (Redis checkpoint — resumable)
        ┌────────────────────────────────────────────────┐
        │  Node 1: scan_node                             │
        │    Scanner (Python ast + sqlglot + TS + YAML)  │
        │    ──► Neo4j write ──► ChromaDB upsert         │
        │                                                │
        │  Node 2: enrich_node                           │
        │    AG2 GroupChat Cartographers (one per layer) │
        │    Gemini → finds missed edges                 │
        │    AG2 DocUnderstanding (PDF + ADR)            │
        │    ──► Neo4j merge bob-edges                   │
        │                                                │
        │  Node 3: orchestrate_node                      │
        │    For each wave (topological order):          │
        │      ┌─ bob -p workers (primary)               │
        │      └─ AG2 Fixer agents (fallback, Gemini)    │
        │    Hooks ──► POST /events ──► WS ──► UI        │
        │    AG2 Inspector ──► diff review               │
        │    Re-scan ──► Neo4j diff ──► 0 dangling refs  │
        └────────────────────────────────────────────────┘
             │  All state in Redis (LangGraph checkpointer)
             ▼
        RunEvent stream ──► WS /ws ──► UI live:
          - CityMap: agents on buildings, building states, severity colours
          - TraceTimeline: every event as a row
          - AgentsTable: per-agent state, bobcoins, blocked count
          - GovernancePanel: blocked actions, approvals, PII
          - KPI tiles: elapsed, wave, dangling refs, bobcoins
```

---

## UI Integration Contract (read-only — no UI changes)

The frontend switches from **demo mode** to **live mode** automatically when
`NEXT_PUBLIC_API_URL` is set. It then:

1. Calls `GET /graph` to populate the Agent City map
2. Calls `POST /changes` to get the `ImpactReport` (ripple animation)
3. Calls `POST /changes/{id}/run` to start the agents
4. Opens `WS /ws` and receives `RunEvent` messages in real time

### RunEvent types we must emit (exact field names from `types.ts`)

| Event | When | Key fields |
|---|---|---|
| `impact_ready` | After `POST /changes` analysis | — |
| `awaiting_approval` | db/PII node needs approval | `node`, `file`, `detail` |
| `approved` | Developer clicks Approve | `node` |
| `wave_started` | Wave begins | `wave` |
| `agent_started` | Worker or AG2 agent starts | `agent_id`, `node`, `file`, `wave` |
| `tool_call` | Bob tool call / AG2 tool call | `tool`, `file`, `permit_ok`, `bobcoins` |
| `blocked` | Permit hook exit 2 / AG2 blocked | `agent_id`, `detail` |
| `check_passed` | Verify step passed | `agent_id`, `detail` |
| `check_failed` | Verify step failed | `agent_id`, `detail` |
| `retrying` | Retry after failure | `agent_id` |
| `done` | Node fully fixed | `agent_id`, `node` |
| `quarantined` | 2 blocks or budget exceeded | `agent_id`, `detail` |
| `wave_completed` | All nodes in wave done | `wave` |
| `rescan` | Graph re-scan after last wave | `data.before`, `data.after` |
| `inspector` | Inspector verdict | `data.verdict`, `data.issues` |
| `pr_created` | Branch + PR opened | `data.branch` |
| `change_completed` | Final event | — |

### Graph schema (exact — from `types.ts`)

Node id format: `layer:type:qualified_name` (e.g. `db:column:orders.cust_id`)

Node fields: `id`, `type`, `layer`, `name`, `file`, `line`, `parent`, `owner`,
`pii`, `criticality`, `tested`, `tokens[]`

Edge fields: `id`, `from`, `to`, `type`, `source` (parser|bob), `confidence`,
`evidence` (file:line), `rule` (rename_ref|keep_alias|update_type|update_doc|passthrough)

---

## Technology Choices (Combined Best-of-Both Plan)

| Concern | Choice | Why |
|---|---|---|
| Agent runtime | AG2 (AutoGen v2) | GroupChat for Cartographers; direct for Fixer/Inspector |
| Pipeline | LangGraph StateGraph + Redis checkpointer | Durable, resumable; each node saves state |
| LLM framework | LangChain (tool defs, doc loaders) | Clean tool schema; PDF/MD loaders for document understanding |
| Graph store | **Neo4j** (Docker) | Persistent across restarts; Cypher for traversal; richer than NetworkX for long-lived graph |
| Vector store | ChromaDB (Docker) | Semantic search across code entities; cosine similarity for "what uses X" |
| LLM | Gemini 1.5 Pro everywhere | User-provided `GEMINI_API_KEY`; AG2 native support |
| API server | FastAPI + WebSocket | Exact contract from `types.ts`; WebSocket for live streaming |
| Event storage | SQLite (local) / DynamoDB (EC2) | Lightweight local dev; production scale on EC2 |
| Checkpoint store | Redis | LangGraph `RedisSaver`; pipeline survives crashes |
| Bob integration | Bob Shell `bob -p` workers + permit hooks | Primary fixer; AG2 Fixer is fallback |
| Infrastructure | Docker Compose on EC2 t3.xlarge | All services containerised; one-command deploy |

> **Note on Neo4j vs NetworkX:** The PRD says NetworkX to avoid a graph DB.
> We use Neo4j because: (a) it persists across restarts (critical for LangGraph
> resume), (b) Cypher traversals are faster for the impact engine at scale, and
> (c) the `GET /graph` endpoint still returns the same JSON — Neo4j is an
> implementation detail the frontend never sees.

---

## Folder Layout (`systemdna/engine/`)

```
systemdna/engine/
├── PLAN.md                         ← this file
├── requirements.txt
├── Dockerfile
├── docker-compose.yml              ← all services (engine, api, neo4j, chroma, redis, mcp)
├── .env.example
│
├── core/
│   ├── __init__.py
│   ├── scanner/
│   │   ├── __init__.py             ← scan_repo(path) → (nodes, edges)
│   │   ├── python_scan.py          ← ast-based Python scanner
│   │   ├── sql_scan.py             ← sqlglot SQL + lineage scanner
│   │   ├── ts_scan.py              ← subprocess wrapper for ../scanner/ts-scan.mjs
│   │   └── config_scan.py          ← YAML dashboard + processes scanner
│   ├── linker.py                   ← cross-layer edge rules
│   ├── graph.py                    ← Neo4j store + GraphStore class
│   ├── chroma.py                   ← ChromaDB client
│   ├── impact.py                   ← ImpactEngine (BFS, alias rule, waves)
│   ├── verify.py                   ← per-node checks (sqlglot, ruff, tsc, pytest)
│   └── pr.py                       ← GitHub branch + PR creation
│
├── agents/
│   ├── __init__.py
│   ├── llm_config.py               ← Gemini LLM config for AG2
│   ├── cartographers.py            ← AG2 Cartographer GroupChats (one per layer)
│   ├── doc_understanding.py        ← AG2 DocUnderstanding (LangChain PDF/MD loader)
│   ├── fixer.py                    ← AG2 Fixer agent (propagate-rename recipes)
│   └── inspector.py                ← AG2 Inspector agent (diff review)
│
├── pipeline/
│   ├── __init__.py
│   ├── state.py                    ← PipelineState TypedDict (LangGraph state)
│   ├── nodes.py                    ← LangGraph nodes: scan, enrich, orchestrate
│   ├── graph_pipeline.py           ← StateGraph definition + Redis checkpointer
│   └── runner.py                   ← PipelineRunner.start() and .resume()
│
├── orchestrator/
│   ├── __init__.py
│   ├── orchestrator.py             ← wave runner, permit writer, bob -p spawner
│   ├── permits.py                  ← permit file schema + writer
│   └── events.py                   ← RunEvent emitter (posts to /events + WS)
│
├── server/
│   ├── __init__.py
│   ├── app.py                      ← FastAPI app, all 11 endpoints
│   ├── ws.py                       ← WebSocket ConnectionManager
│   ├── store.py                    ← EventStore (SQLite local / DynamoDB prod)
│   └── models.py                   ← Pydantic models matching types.ts
│
├── hooks/
│   ├── permit_check.py             ← PreToolUse hook (exit 2 if out of permit)
│   └── report.py                   ← SessionStart/PostToolUse/Stop → /events
│
├── mcp/
│   └── server.py                   ← FastMCP: scan_repo, get_impact, plan_change,
│                                     start_wave, get_status, approve, verify
│
├── deploy/
│   ├── bootstrap.sh                ← EC2 setup: Docker, Bob Shell, clone, .env
│   └── deploy.sh                   ← rsync + docker compose up --build
│
└── tests/
    ├── fixtures/                   ← ShopFlow synthetic fixture files
    ├── test_scanner.py
    ├── test_linker.py
    ├── test_graph.py
    ├── test_impact.py
    ├── test_api.py
    └── test_cartographers.py
```

---

## Sub-Tasks

---

### Sub-Task 1 — Scaffold: Directories, Docker Compose, Requirements

**Status:** `[ ] pending`

**Intent:**
Create the `systemdna/engine/` directory tree with all stubs, `requirements.txt`,
`docker-compose.yml`, and `.env.example`. No logic yet — just the skeleton so every
subsequent sub-task slots in cleanly.

**Expected Outcomes:**
- All directories and `__init__.py` stubs created
- `requirements.txt` with all dependencies pinned
- `docker-compose.yml` with six services: `engine`, `api`, `mcp`, `neo4j`, `chroma`, `redis`
- `.env.example` with all env vars documented
- `Dockerfile` for the Python services
- `.bob/settings.json` hook config (PRD section 13 exactly)

**Todo List:**
1. Create `systemdna/engine/` tree with all directories and empty `__init__.py` stubs
2. Write `requirements.txt`: `fastapi`, `uvicorn[standard]`, `websockets`,
   `pyautogen[gemini]>=0.4`, `langchain`, `langchain-google-genai`, `langgraph`,
   `langgraph-checkpoint-redis`, `neo4j`, `chromadb`, `sqlglot`, `networkx`,
   `gitpython`, `boto3`, `pypdf`, `ruff`, `pytest`, `pytest-asyncio`,
   `opentelemetry-sdk`, `opentelemetry-exporter-otlp`, `redis`, `mcp[http]`
3. Write `docker-compose.yml`:
   - `neo4j:5` — ports 7474/7687, bolt protocol
   - `chromadb/chroma:latest` — port 8000
   - `redis:7-alpine` — port 6379
   - `engine` (Python) — scan + agent workload
   - `api` (Python) — FastAPI on port 8080
   - `mcp` (Python) — FastMCP on port 3000
   - Shared volume `repo_workspace` mounted on all Python containers
4. Write `.env.example`: `GEMINI_API_KEY`, `NEO4J_URI`, `NEO4J_USER`,
   `NEO4J_PASSWORD`, `CHROMA_HOST`, `REDIS_URL`, `REPO_WORKSPACE`, `GITHUB_TOKEN`,
   `DEMO_TOKEN`, `USE_DYNAMO`, `DYNAMO_TABLE`, `S3_BUCKET`, `MAX_WORKERS`
5. Write `Dockerfile` — Python 3.11 slim, install requirements, copy engine/
6. Write `deploy/bootstrap.sh` — install Docker CE + Compose v2, Bob Shell,
   clone repo, copy `.env`, `docker compose up -d`
7. Write `deploy/deploy.sh` — rsync to EC2 over SSH, `docker compose up -d --build`
8. Write `.bob/settings.json` — exact hook config from PRD section 13:
   `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop` pointing to `hooks/`

**Relevant Context:**
- `systemdna/web/` and `systemdna/core/scanner/` are NOT touched
- EC2: Ubuntu 22.04, t3.xlarge (4 vCPU, 16 GB RAM)
- All secrets in `.env` — never committed

---

### Sub-Task 2 — Scanners: Python, SQL, TS wrapper, Config (F01–F04)

**Status:** `[ ] pending`

**Intent:**
Build the four language scanners that form Pass 1 of the graph build. Each
scanner reads files and returns `GraphNode` and `GraphEdge` dicts in the exact
schema the frontend's `types.ts` defines. The TS scanner wraps the existing
`ts-scan.mjs` — it is not rewritten.

**Expected Outcomes:**
- `core/scanner/python_scan.py` — ast-based Python scanner
- `core/scanner/sql_scan.py` — sqlglot SQL + column-level lineage scanner
- `core/scanner/ts_scan.py` — subprocess wrapper for `ts-scan.mjs`
- `core/scanner/config_scan.py` — YAML config scanner
- `core/scanner/__init__.py` exposing `scan_repo(path) -> tuple[list, list]`
- Tests pass against ShopFlow fixture files

**Todo List:**
1. Write `core/scanner/python_scan.py`:
   - Walk all `.py` files via `ast.walk`
   - Extract: `Module`, `Class`, `Function`, `ORMModel` (SQLAlchemy `declarative_base`
     subclasses), `Schema` (Pydantic `BaseModel` subclasses), `Field`, `Endpoint`
     (FastAPI `@router.get/post/put/delete`), `SparkJob` (`spark.table`, `.select`,
     `.write`)
   - Emit `IMPORTS`, `CALLS`, `READS`, `WRITES` edges
   - Evidence = `"file:line"` string; `source=parser`, `confidence=high`
   - `tokens[]` = list of string literals + identifier names referenced in the file
2. Write `core/scanner/sql_scan.py`:
   - Parse `.sql` files with `sqlglot.parse`
   - Use `sqlglot.lineage` for column-level lineage
   - Detect aliased columns (`SELECT x AS y`) → emit `DERIVES_FROM` with
     `rule=keep_alias`; unaliased → `rule=rename_ref`
   - Extract `Table`, `Column` nodes; emit `READS`, `WRITES`, `DERIVES_FROM` edges
3. Write `core/scanner/ts_scan.py`:
   - Subprocess-call `node systemdna/core/scanner/ts-scan.mjs <repo_path>`
   - Parse stdout JSON; normalise to `GraphNode`/`GraphEdge` schema
   - Set `source=parser`, `confidence=high`
   - Handle case where `ts-scan.mjs` not installed (return empty, log warning)
4. Write `core/scanner/config_scan.py`:
   - Parse `processes.yaml` → `BusinessProcess` nodes
   - Parse `dashboards/*.yaml` → `Dashboard` nodes + `SUPPORTS` edges
   - Detect `source:` lines → emit `READS` edge to source model
5. Write `core/scanner/__init__.py`:
   - `scan_repo(path: str) -> tuple[list[dict], list[dict]]`
   - Calls all four scanners; deduplicates nodes by `id`; merges edges
   - Returns `(nodes, edges)` — both plain dicts matching `types.ts`
6. Write `tests/fixtures/` — synthetic ShopFlow files (SQL, Python, YAML matching
   the ShopFlow structure from `web/lib/mock/shopflow.ts`)
7. Write `tests/test_scanner.py` — assert ShopFlow fixture produces the correct
   node and edge sets from the answer key

**Relevant Context:**
- Node id format: `layer:type:qualified_name` — exactly as in `shopflow.ts`
- `tokens[]` is used by the grep comparison in `ImpactReport.grep`
- Scanner must complete in <5 seconds on ShopFlow (PRD success metric)
- Dynamic SQL trap in `export_job.py` is intentionally a medium-confidence gap —
  the Cartographer (Sub-Task 4) fills it; the scanner emits a low-confidence node

---

### Sub-Task 3 — Cross-Layer Linker + Neo4j + ChromaDB Store (F05, F06)

**Status:** `[ ] pending`

**Intent:**
Build the cross-layer linker (Pass 2) and the persistent graph store. Neo4j holds
the property graph; ChromaDB holds embeddings for semantic search. The `GraphStore`
class exposes all the read/write operations used by every other module.

**Expected Outcomes:**
- `core/linker.py` — `Linker.link(nodes, edges) -> list[dict]` (new cross-layer edges)
- `core/graph.py` — `GraphStore` backed by Neo4j; exposes `build`, `to_json`,
  `add_edges`, `get_node`, `get_downstream`, `diff`
- `core/chroma.py` — `ChromaStore` backed by ChromaDB; `upsert`, `search`
- `GET /graph` returns the correct JSON matching `types.ts` `Graph` type exactly
- `GET /node/{id}` returns one node

**Todo List:**
1. Write `core/linker.py` — `Linker` class:
   - `_link_orm_to_table` → `MAPS_TO` edges (`rule=rename_ref`)
   - `_link_schema_to_orm` → `SERIALIZES` edges (`rule=rename_ref`)
   - `_link_route_to_schema` → `RETURNS` edges (`rule=passthrough`)
   - `_link_fetch_to_endpoint` → `CONSUMES` edges (`rule=passthrough`)
   - `_link_ts_to_api` → `TYPED_AS` edges (`rule=rename_ref`)
   - `_link_dashboard_to_business` → `SUPPORTS` edges (`rule=passthrough`)
   - All new edges: `source=parser`, `confidence=high`
2. Write `core/graph.py` — `GraphStore(neo4j_uri, user, password)`:
   - `build(nodes, edges, repo, scanned_at)` — creates Neo4j nodes/rels from
     dicts; builds Cypher constraints on `id`
   - `to_json() -> dict` — returns full `Graph` dict: `repo`, `scannedAt`,
     `layers` (from `LAYER_DEFS`), `nodes`, `edges`, `textIndex`, `files`
   - `add_edges(edges)` — merge new edges (used by Cartographer)
   - `get_node(id) -> dict` — single node
   - `get_downstream(node_id, depth=3) -> list[str]` — Cypher `MATCH (n)-[*1..{depth}]->(m)`
   - `diff(old_nodes, new_nodes) -> dict` — compare before/after for `rescan` event
   - `save_json(path)` — write `graph.json` to disk for compatibility
3. Write `core/chroma.py` — `ChromaStore(host, port)`:
   - `upsert(nodes: list[dict])` — embed node summaries with Gemini embeddings via
     LangChain `GoogleGenerativeAIEmbeddings`
   - `search(query: str, n: int) -> list[dict]` — cosine similarity search
   - `get_collection(name) -> chromadb.Collection`
4. Write `tests/test_graph.py` — round-trip: build from ShopFlow fixture,
   `to_json()`, assert node count, edge count, `textIndex` keys

**Relevant Context:**
- Neo4j node labels: `File`, `GraphNode` (generic); relationship types match
  `EdgeType` from `types.ts`
- `LAYER_DEFS` (hardcoded): database, pipelines, backend, api, frontend,
  dashboards, business (column 0–6), quality (column=-1)
- `textIndex`: `{word: [file_paths]}` built from `node.tokens[]`

---

### Sub-Task 4 — AG2 Cartographer Subagents + Document Understanding (F07, F08)

**Status:** `[ ] pending`

**Intent:**
Build the AG2 enrichment pass (Pass 3). One `CartographerAgent` GroupChat per
layer runs in parallel via asyncio, each finding edges that parsers missed.
A `DocUnderstandingAgent` reads `data_dictionary.pdf` and ADR markdown to patch
node attributes. Both use Gemini 1.5 Pro via LangChain + AG2.

**Expected Outcomes:**
- `agents/cartographers.py` — `CartographerOrchestrator` running 7 parallel AG2
  GroupChats (one per layer); merges valid edges into Neo4j
- `agents/doc_understanding.py` — `DocUnderstandingAgent` patching `owner`, `pii`,
  `criticality` on nodes
- New edges have `source=bob`, `confidence=medium`
- Edges without evidence (`file:line`) are rejected by the validator
- `agent_started` / `tool_call` / `done` RunEvents emitted for each Cartographer
  (visible in TraceTimeline)

**Todo List:**
1. Write `agents/llm_config.py` — `get_llm_config()` returning AG2 LLM config dict:
   `{"model": "gemini-1.5-pro", "api_key": os.getenv("GEMINI_API_KEY"),
   "api_type": "google"}`; also `get_langchain_llm()` returning
   `ChatGoogleGenerativeAI(model="gemini-1.5-pro")`
2. Write `agents/cartographers.py`:
   - `CartographerAgent(layer, files, nodes, unresolved_refs, event_emitter)` —
     AG2 `AssistantAgent` with system prompt: finds missed edges, returns JSON only
   - `CartographerGroupChat(layer, ...)` — `GroupChat([CartographerAgent, UserProxyAgent],
     max_round=5, speaker_selection_method="auto")`
   - `CartographerOrchestrator.enrich(graph_store, event_emitter)`:
     - For each layer: create `CartographerGroupChat`; run via `asyncio.gather`
     - Parse JSON response; validate each edge has `evidence` matching `file:line` regex
     - Emit `agent_started` before, `done` after each Cartographer
     - Call `graph_store.add_edges(valid_edges)`
3. Write `agents/doc_understanding.py`:
   - LangChain `PyPDFLoader` for `data_dictionary.pdf`
   - LangChain `UnstructuredMarkdownLoader` for ADR files
   - AG2 `AssistantAgent` with chain-of-thought prompt; returns JSON patches
   - `DocUnderstandingOrchestrator.enrich(graph_store, doc_paths[])` — apply patches
     to Neo4j nodes
4. Write `tests/test_cartographers.py` — mock AG2 LLM response; verify:
   - Edge with evidence → accepted and added to graph
   - Edge without evidence → rejected
   - `agent_started` + `done` events emitted

**Relevant Context:**
- Dynamic SQL trap: `export_job.py` builds `f"SELECT {col} FROM orders"` —
  Cartographer must return edge `{from: "pipe:sparkjob:export_job",
  to: "db:column:orders.cust_id", type: "READS", evidence: "pipelines/export_job.py:8",
  confidence: "medium"}`
- `max_round=5` per Cartographer to stay within Bobcoin budget
- Cartographers run after `scan_node` in LangGraph; before `orchestrate_node`

---

### Sub-Task 5 — Impact Engine (F10–F16)

**Status:** `[ ] pending`

**Intent:**
Build the pure-Python impact engine that takes a `ChangeRequest` and returns a
complete `ImpactReport` in under 1 second. This is what `POST /changes` calls.
The output must match `ImpactReport` from `types.ts` field-for-field.

**Expected Outcomes:**
- `core/impact.py` — `ImpactEngine.analyse(graph_store, request) -> dict`
- Alias rule correctly applied: nodes downstream of a `keep_alias` edge are `safe`
- Risk score formula: `0.35*fanout + 0.30*criticality + 0.20*pii + 0.15*untested`
- Wave planner uses topological sort
- `grep` field from `textIndex`
- `levels[]` field for ripple animation (node ids grouped by BFS depth)
- Completes in <1 second on ShopFlow

**Todo List:**
1. Write `core/impact.py` — `ImpactEngine`:
   - `_walk_downstream(graph, node_id, change)` — BFS using
     `graph_store.get_downstream()`; apply edge `rule` to each step:
     - `rename_ref` → `breaking`; continue walk
     - `keep_alias` → `needs_update`; **stop walk** (downstream is safe)
     - `update_type` → `needs_update`; continue
     - `update_doc` → `update`; stop
     - `passthrough` → `safe`; continue
   - `_business_impact(graph, affected_ids)` — follow `SUPPORTS` edges from
     affected Dashboard nodes to BusinessProcess nodes
   - `_risk_score(node, fanout, max_fanout) -> float` — PRD formula
   - `_plan_waves(items, graph)` — topological sort; nodes at same depth = one wave;
     return `FixUnit[]` (one per file, not per node)
   - `_grep_comparison(graph, old_name)` — files in `textIndex[old_name]` = `found`;
     affected files not in that set = `missed`; files in set but not affected = `falsePositives`
   - `_levels(items) -> list[list[str]]` — node ids grouped by BFS depth (for ripple)
   - `analyse(graph_store, request) -> dict` — runs all steps; returns typed dict
2. Write `tests/test_impact.py` — ShopFlow fixture assertions:
   - `orders.cust_id` rename: at least 17 affected nodes
   - `stg_orders.customer_key` severity = `safe`
   - `export_job` confidence = `medium`
   - `biz:revenue_close` in `business[]`
   - `waveCount >= 4`
   - `grep.missed` includes `export_job` path

**Relevant Context:**
- `ImpactItem` fields (from `types.ts`): `nodeId`, `severity`, `depth`, `risk`,
  `viaEdge`, `confidence`, `needsApproval` (true for `layer=database` or `pii=true`)
- `FixUnit.id` = file path (the UI renders one agent per fix unit, not per node)
- `danglingRefs` at analysis time = number of edges still referencing the old name
  (pre-fix); updated to 0 after re-scan

---

### Sub-Task 6 — FastAPI Server + WebSocket (F30)

**Status:** `[ ] pending`

**Intent:**
Build the FastAPI server implementing all 11 PRD endpoints plus `WS /ws`.
Every `RunEvent` posted to `POST /events` (by hooks and the orchestrator) is
broadcast to all connected WebSocket clients instantly — that is how all agent
activity becomes visible in the UI live.

**Expected Outcomes:**
- `server/app.py` — all 11 endpoints + WebSocket
- `server/ws.py` — `ConnectionManager` broadcasting to all connected clients
- `server/store.py` — `EventStore` (SQLite local / DynamoDB prod)
- `server/models.py` — Pydantic request/response models matching `types.ts`
- Frontend connects and Agent City map populates from live data

**Todo List:**
1. Write `server/models.py` — Pydantic models:
   - `ChangeRequest(node: str, change: str, to: str)`
   - `RunEvent` (all fields from `types.ts` — snake_case)
   - `Change(id, title, request, report, createdAt, mode, events)`
   - `GraphResponse` (wraps `GraphStore.to_json()`)
2. Write `server/ws.py` — `ConnectionManager`:
   - `connect(websocket)`, `disconnect(websocket)`, `broadcast(message: str)`
   - Stores `active: set[WebSocket]`
3. Write `server/store.py`:
   - `SQLiteStore` — `events` + `changes` tables via `aiosqlite`
   - `DynamoStore` — `boto3` async put/query (activated by `USE_DYNAMO=1`)
   - Factory: `get_store() -> EventStore`
4. Write `server/app.py`:
   - `GET /graph` → `graph_store.to_json()`
   - `GET /node/{id}` → `graph_store.get_node(id)`
   - `POST /changes` → `ImpactEngine.analyse()` → save → emit `impact_ready` → return
   - `GET /changes/{id}` → `store.get_change(id)`
   - `POST /changes/{id}/approve` → save `approved` event → broadcast
   - `POST /changes/{id}/run` → `PipelineRunner.start(change_id)` (background task)
   - `GET /changes/{id}/diff` → `graph_store.diff()`
   - `GET /changes/{id}/metrics` → aggregate events by type
   - `POST /events` → `store.save_event(ev)` + `ws.broadcast(ev)` ← **heart of live UI**
   - `WS /ws` → `ConnectionManager` subscribe + listen
   - `GET /replay/{id}` → `store.get_events(id)`
5. Add CORS `*`, Bearer token check on write endpoints

**Relevant Context:**
- `POST /events` is called by `hooks/report.py` and `orchestrator/events.py`
- WS message format: JSON string of `RunEvent` — matches `types.ts` exactly
- `change.mode` must be set to `"live"` (not `"demo"`) for the frontend to use
  the WS feed instead of the simulator

---

### Sub-Task 7 — LangGraph Pipeline + Redis Checkpointing

**Status:** `[ ] pending`

**Intent:**
Wire the scan → enrich → orchestrate flow into a LangGraph `StateGraph` with a
Redis checkpointer. This makes the pipeline fully resumable — if a container
crashes mid-pipeline, `PipelineRunner.resume(change_id)` re-enters at the failed
node using the saved state.

**Expected Outcomes:**
- `pipeline/state.py` — `PipelineState` TypedDict
- `pipeline/nodes.py` — three LangGraph nodes: `scan_node`, `enrich_node`,
  `orchestrate_node`
- `pipeline/graph_pipeline.py` — `StateGraph` compiled with `RedisSaver`
- `pipeline/runner.py` — `PipelineRunner.start()` and `.resume()`
- Pipeline survives a Redis restart and resumes correctly

**Todo List:**
1. Write `pipeline/state.py` — `PipelineState(TypedDict)`:
   `change_id`, `repo_path`, `request`, `nodes`, `edges`, `report`,
   `scan_done`, `enrich_done`, `orchestrate_done`, `error`, `error_node`
2. Write `pipeline/nodes.py`:
   - `scan_node(state)` — calls `scan_repo()` + `Linker.link()` → `GraphStore.build()`
     + `ChromaStore.upsert()`; sets `scan_done=True`; emits `tool_call` events for
     each scanner (visible in TraceTimeline)
   - `enrich_node(state)` — calls `CartographerOrchestrator.enrich()` +
     `DocUnderstandingOrchestrator.enrich()`; sets `enrich_done=True`
   - `orchestrate_node(state)` — calls `Orchestrator.run_change()`; sets
     `orchestrate_done=True`
   - Each node: try/except → on failure set `error` + `error_node` → return state
3. Write `pipeline/graph_pipeline.py`:
   - `build_graph() -> CompiledStateGraph`
   - `StateGraph(PipelineState)` → add nodes → add edges → compile with
     `RedisSaver(redis_url=os.getenv("REDIS_URL"))`
   - Conditional edge: if `state.error` → `END`
4. Write `pipeline/runner.py`:
   - `PipelineRunner.start(change_id, repo_path, request)` — initialise state,
     invoke graph with `config={"configurable": {"thread_id": change_id}}`
   - `PipelineRunner.resume(change_id)` — re-invoke graph with same `thread_id`;
     LangGraph re-enters at the failed node using Redis checkpoint
5. Wire `POST /changes/{id}/run` in `server/app.py` to call `PipelineRunner.start()`
   as a `BackgroundTask`

**Relevant Context:**
- `thread_id = change_id` — LangGraph uses this as the checkpoint key
- `RedisSaver` from `langgraph-checkpoint-redis` package
- Each node saves partial results before the next node runs — crash mid-enrich
  means resume skips scan and retries enrich only

---

### Sub-Task 8 — Orchestrator + Bob Hooks + Permits (F20–F26)

**Status:** `[ ] pending`

**Intent:**
Build the orchestrator that runs the actual fix waves — writing permits, starting
`bob -p` workers (or AG2 Fixer agents as fallback), verifying each node, and
emitting `RunEvent` messages that drive the live Agent City UI.

**Expected Outcomes:**
- `orchestrator/orchestrator.py` — wave-by-wave runner
- `orchestrator/permits.py` — permit file writer
- `orchestrator/events.py` — `EventEmitter` posting to `POST /events`
- `hooks/permit_check.py` — `PreToolUse` hook (exit 2 blocks out-of-permit edits)
- `hooks/report.py` — `SessionStart`/`PostToolUse`/`Stop` → `POST /events`
- Live UI shows workers on buildings, building states changing, governance panel
  populated

**Todo List:**
1. Write `orchestrator/events.py` — `EventEmitter(api_url, change_id)`:
   - `emit(event_type, **kwargs)` — constructs `RunEvent` dict; posts to
     `POST /api_url/events` via `httpx`; every field from `types.ts`
2. Write `orchestrator/permits.py` — `PermitWriter`:
   - `write(unit: FixUnit, change_id: str, max_cost: float, max_turns: int)`
     → writes `.systemdna/permits/{unit.id}.json`
   - Permit schema: `agent_id`, `change_id`, `node`, `allowed_files[]`,
     `max_cost`, `max_turns`, `needs_approval`
3. Write `hooks/permit_check.py`:
   - Read JSON from stdin (Bob hook payload)
   - Parse `agent_id` from env `SYSTEMDNA_AGENT_ID` or session ID
   - Load permit from `.systemdna/permits/{agent_id}.json`
   - If no permit → allow (developer session), emit `tool_call`, exit 0
   - If writing to non-allowed file → emit `blocked` event, exit 2
   - Otherwise emit `tool_call`, exit 0
   - Accept both `tool`/`tool_name` and `path`/`file_path` (PRD note)
4. Write `hooks/report.py`:
   - `SessionStart` → emit `agent_started`
   - `PostToolUse` → emit `tool_call` (or `blocked` if exit_code=2)
   - `Stop` → emit `done` or `check_failed`
5. Write `orchestrator/orchestrator.py` — `Orchestrator.run_change(change_id, report,
   graph_store, emitter)`:
   - Emit `awaiting_approval` for `needsApproval` fix units; wait for approval event
   - For each wave:
     - Call `PermitWriter.write()` per unit
     - Emit `wave_started`
     - Start up to `MAX_WORKERS` bob workers in parallel via `asyncio.create_subprocess_exec`
       (`bob -p <prompt_file> --mode agent --max-cost 2 --max-turns 12`)
     - If `bob` not available: fall back to `AG2FixerAgent.run()` per unit
     - Wait; collect results; emit `wave_completed`
     - Retry once on `check_failed`
   - Re-scan: call `scan_repo()` → `GraphStore.build()` → `GraphStore.diff()` →
     emit `rescan` with `data.before`, `data.after`
   - Run `InspectorAgent.run(diff, report)` → emit `inspector`
   - Create PR via `core/pr.py` → emit `pr_created`
   - Emit `change_completed`
6. Write `core/verify.py` — `Verifier.verify_node(node, repo_path) -> dict`:
   - Run `sqlglot.parse` (SQL), `ruff check` (Python), `tsc --noEmit` (TS),
     `pytest -x -k <node_name>` (tests)
   - Return `{passed: bool, detail: str}`

**Relevant Context:**
- Building state in UI: `affected` → `under_construction` (tool_call) → `inspecting`
  (check_passed) → `fixed` (done); `blocked` if permit violation
- Agent state in UI: `queued` → `editing` → `verifying` → `done` (or `blocked`)
- `SYSTEMDNA_AGENT_ID` env var set by orchestrator before spawning each worker

---

### Sub-Task 9 — AG2 Fixer & Inspector Agents (F19, F25)

**Status:** `[ ] pending`

**Intent:**
Build the AG2 Fixer agent (used when `bob -p` is unavailable) and the Inspector
agent that reviews the full diff. Both use Gemini 1.5 Pro and emit `RunEvent`
messages so they appear in the Agent City UI identically to Bob workers.

**Expected Outcomes:**
- `agents/fixer.py` — `FixerAgent` applying `propagate-rename` recipes
- `agents/inspector.py` — `InspectorAgent` reviewing diff vs impact report
- Both visible in TraceTimeline and AgentsTable as live agents

**Todo List:**
1. Write `agents/fixer.py` — `FixerAgent(unit, permit, change, graph, emitter)`:
   - AG2 `AssistantAgent` with Gemini config + LangChain tools:
     `read_file(path)`, `write_file(path, content)`, `run_verify(node)`
   - System prompt includes: change, node, evidence lines, edge rule, upstream
     change already made, permit (`allowed_files`)
   - Every tool call: emit `tool_call` RunEvent
   - On write to non-allowed file: emit `blocked`, raise PermitViolation
   - `FixerGroupChat`: `[FixerAgent, UserProxyAgent]`, `max_round=12`
   - `run() -> dict` — initiate chat → return `{passed, detail}`
2. Write `agents/inspector.py` — `InspectorAgent(diff, report, emitter)`:
   - AG2 `AssistantAgent` with Gemini + read-only `read_file` tool
   - System prompt: "Review the diff against the impact report. Return JSON:
     `{verdict: approved|needs_revision, issues: int, details: [str]}`"
   - `run() -> dict` — emit `agent_started`, run chat, emit `done`, return result
3. Write `tests/test_fixer.py` — mock LLM; assert permit violation raises error
   when fixer tries to write outside `allowed_files`

**Relevant Context:**
- `propagate-rename` recipes per file type (from PRD F19):
  SQL → rename column ref; PySpark → rename string; ORM/Pydantic → rename field;
  TypeScript → rename interface field; YAML → rename source; Tests → rename assertion
- Fixer emits same `RunEvent` types as Bob worker → UI cannot tell the difference
- Inspector is read-only — no tool calls to write files

---

### Sub-Task 10 — MCP Server (F17)

**Status:** `[ ] pending`

**Intent:**
Build the FastMCP server that gives Bob IDE the 7 tools from PRD section 13.
This is what FDE3 uses from the Change Planner mode.

**Expected Outcomes:**
- `mcp/server.py` — FastMCP server running on port 3000
- All 7 tools: `scan_repo`, `get_impact`, `plan_change`, `start_wave`, `get_status`,
  `approve`, `verify`
- HTTPS-ready (behind load balancer); protected by `DEMO_TOKEN`

**Todo List:**
1. Write `mcp/server.py` using `mcp[http]`:
   - `scan_repo(path: str) -> dict` — calls `scan_repo()`, builds graph, returns
     `{nodes: int, edges: int, graph_path: str}`
   - `get_impact(node: str, change: str, to: str) -> dict` — calls
     `ImpactEngine.analyse()`, returns `ImpactReport`
   - `plan_change(change_id: str) -> dict` — returns waves, permits, approvals
   - `start_wave(change_id: str, wave: int) -> dict` — starts orchestrator wave
   - `get_status(change_id: str) -> dict` — returns agent + node states from events
   - `approve(change_id: str, node: str) -> dict` — records approval
   - `verify(change_id: str) -> dict` — returns check results + dangling ref count
2. Add auth middleware: `Authorization: Bearer {DEMO_TOKEN}`

---

### Sub-Task 11 — Bob Modes & propagate-rename Skill (F18, F19)

**Status:** `[ ] pending`

**Intent:**
Create the four Bob custom modes and the `propagate-rename` Skill. These go in
`.bob/` at the repo root and are used by FDE3 from Bob IDE.

**Expected Outcomes:**
- `.bob/modes/cartographer.yaml` (or `.md` — per Bob docs format)
- `.bob/modes/change-planner.yaml`
- `.bob/modes/fixer.yaml`
- `.bob/modes/inspector.yaml`
- `.bob/skills/propagate-rename/SKILL.md`
- All modes reference MCP server tools; Fixer references the permit

**Todo List:**
1. Check Bob docs for exact mode and Skill file format via `search_ibm_docs`
2. Write `.bob/modes/cartographer.yaml` — read-only; finds missed edges; returns JSON
3. Write `.bob/modes/change-planner.yaml` — read + MCP; calls `get_impact`,
   `plan_change`, shows report, gets approval, calls `start_wave`
4. Write `.bob/modes/fixer.yaml` — read + edit (permit-limited); uses
   `propagate-rename` Skill; calls `run_verify`; reports done
5. Write `.bob/modes/inspector.yaml` — read-only; reviews diff vs report
6. Write `.bob/skills/propagate-rename/SKILL.md` — fix recipes per file type

---

### Sub-Task 12 — EC2 Deployment & End-to-End Smoke Test

**Status:** `[ ] pending`

**Intent:**
Deploy all containers to EC2, run the ShopFlow hero change end-to-end, and
confirm the Agent City UI shows live data — agents on buildings, ripple animation,
0 dangling refs in the KPI tile.

**Expected Outcomes:**
- All Docker Compose services healthy on EC2
- `POST /changes` returns correct `ImpactReport` for ShopFlow `cust_id` rename
- WebSocket stream delivers all 17 `RunEventType` values to the frontend
- Agent City map shows agents moving across buildings live
- `rescan` event shows `data.after = 0`
- `systemdna/engine/DEPLOYMENT.md` documents every step

**Todo List:**
1. Provision EC2 t3.xlarge Ubuntu 22.04; open ports 8080 (API), 3000 (MCP)
2. Run `deploy/bootstrap.sh` via SSH with EC2 key
3. Copy `.env` with `GEMINI_API_KEY`, `GITHUB_TOKEN`, `DEMO_TOKEN` to EC2
4. Run `deploy/deploy.sh`; verify `docker compose ps` all healthy
5. Create ShopFlow fixture in `REPO_WORKSPACE/shopflow/` on EC2 from `tests/fixtures/`
6. Smoke test graph: `GET http://<ec2>:8080/graph` → node count ≥ 30
7. Smoke test impact: `POST /changes {"node":"db:column:orders.cust_id",
   "change":"rename","to":"customer_id"}` → 17+ affected nodes
8. Run: `POST /changes/{id}/run` → open WebSocket → verify all event types arrive
9. Set `NEXT_PUBLIC_API_URL=http://<ec2>:8080` in `systemdna/web/.env.local`;
   run `npm run dev`; verify Agent City map renders live data
10. Verify KPI tile shows `Dangling references: 0` at end
11. Write `systemdna/engine/DEPLOYMENT.md`

---

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Graph store | Neo4j (Docker) | Persistent across restarts; critical for LangGraph resume; Cypher is fast for traversal |
| Vector store | ChromaDB | Semantic code search; "what uses X" queries; cosine similarity |
| Pipeline | LangGraph StateGraph + Redis | Resumable on crash; each node checkpoints; `thread_id = change_id` |
| Agent runtime | AG2 GroupChat | Cartographers as GroupChat; Fixer/Inspector as direct AssistantAgent |
| LLM framework | LangChain (tools + loaders) | LangChain `@tool` decorator for clean AG2 tool definitions; PDF/MD loaders |
| LLM | Gemini 1.5 Pro everywhere | User-provided key; AG2 native support |
| Primary fixer | Bob Shell `bob -p` workers | Uses Bob's built-in permit/hook system; AG2 Fixer is the fallback |
| Events | `POST /events` + `WS /ws` | All agents (Bob + AG2) post to same endpoint; WS broadcasts to UI |
| Visibility | Every agent action emits a RunEvent | City map, trace, agents table, governance — all live, not background |
| Frontend | Zero changes to `systemdna/web/` | API contract only; UI switches to live mode via `NEXT_PUBLIC_API_URL` |
| TS scanner | Wrap existing `ts-scan.mjs` | Already written; no duplication |
| Impact engine | Pure Python BFS | <1 second requirement; no LLM needed for traversal |
| Fault tolerance | LangGraph Redis checkpointer | Resume from exact failure node; no reprocessing |
