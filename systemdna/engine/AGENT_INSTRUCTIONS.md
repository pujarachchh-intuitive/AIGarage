# AGENT INSTRUCTIONS — SystemDNA Engine Implementation
## File: `systemdna/engine/AGENT_INSTRUCTIONS.md`
## Branch: `arnav/agent-engine`

---

## YOUR IDENTITY AND MISSION

You are an implementation agent for the **SystemDNA** project.
Your job is to build the `systemdna/engine/` Python backend that powers the
Agent City dashboard. The frontend already exists at `systemdna/web/` and must
**never be modified**. You integrate with it purely through API contracts.

**WatsonX API Key (use this for all IBM/WatsonX LLM calls):**
```
WATSONX_API_KEY=bob_prod_bob-apikey_5VkXSMTgdVWMQWcKdFf5x3w7ERvDcBhps2qoLTJ5q9XDJGpJN29T21Xs3zjstR8i7NJqD2Nzg78uuW1ZZiwQNTs6_8TkqwVm69rk6JM5LrWHQ9Y9jAzKPrm2CNHGVEzfQpr5z
```
Store this in `.env` as `WATSONX_API_KEY`. Never commit it to git.

**LLM strategy:**
- Gemini 1.5 Pro (`GEMINI_API_KEY`) — AG2 Cartographer, Fixer agents (code generation)
- WatsonX `ibm/granite-34b-code-instruct` (`WATSONX_API_KEY`) — DocUnderstanding, Inspector (cheaper read-only analysis)
- Both configured via LangChain; both used inside AG2 agents

---

## CRITICAL RULES — READ FIRST

1. **NEVER touch `systemdna/web/`** — the frontend is complete. Zero changes.
2. **NEVER touch `systemdna/core/scanner/ts-scan.mjs`** — it is a working TS scanner. Wrap it with a subprocess call only.
3. **Every RunEvent you emit MUST match `systemdna/web/lib/types.ts` field names exactly** (snake_case). The frontend breaks if field names differ.
4. **The `Graph` JSON returned by `GET /graph` must match `types.ts` `Graph` interface exactly.** The city map will not render if fields are missing.
5. **All code goes in `systemdna/engine/`** — no files outside this folder except `.bob/` at repo root.
6. **After each sub-task, spawn a validation subagent to review the code** before proceeding to the next.
7. **Use Redis as the LangGraph checkpointer** — this is what enables fault-tolerant pipeline resume.
8. **All agent actions must emit RunEvents** — nothing runs silently in the background.

---

## REFERENCE FILES — READ THESE BEFORE WRITING ANY CODE

Read these files at the start of each task:

| File | Why |
|---|---|
| `systemdna/web/lib/types.ts` | Exact TypeScript types your Python must match |
| `systemdna/web/lib/api.ts` | Exact API contract (endpoints, request/response shapes) |
| `systemdna/web/lib/run-state.ts` | How frontend derives UI state from RunEvents |
| `systemdna/web/lib/mock/shopflow.ts` | ShopFlow graph fixture — your ground truth for testing |
| `systemdna/engine/PLAN.md` | Full plan with 12 sub-tasks |
| `systemdna/engine/architecture/` | All 6 architecture diagrams |
| `TEAM_PLAN.md` | Team split — confirms what already exists vs what we build |
| `SystemDNA - PRD (IBM Bob 2.0 Hackathon).md` | Full PRD with all feature specs |

---

## WORKFLOW — HOW TO EXECUTE EACH SUB-TASK

For **every** sub-task, follow this exact workflow:

```
STEP 1 — RESEARCH (spawn subagent)
  Spawn an "explore" subagent.
  Task: Read the relevant existing files, PRD sections, and types.ts.
  Extract: exact field names, exact schemas, exact constraints.
  Return: a JSON or markdown summary of everything the code must satisfy.

STEP 2 — DESIGN VALIDATION (spawn subagent)
  Spawn a "general" subagent with the research output.
  Task: Review the proposed design against types.ts and the PRD.
  Check: field name accuracy, missing edge cases, interface compliance.
  Return: GO or list of problems to fix before coding.

STEP 3 — CODE GENERATION
  Write the code yourself using the validated design.
  Follow the file layout in PLAN.md exactly.
  Every function must have a docstring.
  Every public interface must have type annotations.

STEP 4 — CODE VALIDATION (spawn subagent)
  Spawn a "general" subagent with the written code.
  Task: Review the code for:
    - types.ts interface compliance (field names, types)
    - missing RunEvent emissions
    - incorrect edge rules or severity logic
    - missing error handling
  Return: PASS or list of bugs with line numbers.

STEP 5 — FIX & FINALIZE
  Apply all fixes from Step 4.
  Commit: git add + git commit with descriptive message.
  Update sub-task status in PLAN.md to [x] done.
```

---

## SUB-TASK 1 — Project Scaffold

### What to build
```
systemdna/engine/
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── core/__init__.py              (stub)
├── core/scanner/__init__.py      (stub)
├── core/scanner/python_scan.py   (stub)
├── core/scanner/sql_scan.py      (stub)
├── core/scanner/ts_scan.py       (stub)
├── core/scanner/config_scan.py   (stub)
├── core/linker.py                (stub)
├── core/graph.py                 (stub)
├── core/chroma.py                (stub)
├── core/impact.py                (stub)
├── core/verify.py                (stub)
├── core/pr.py                    (stub)
├── agents/__init__.py            (stub)
├── agents/llm_config.py          (full — both Gemini and WatsonX)
├── agents/cartographers.py       (stub)
├── agents/doc_understanding.py   (stub)
├── agents/fixer.py               (stub)
├── agents/inspector.py           (stub)
├── pipeline/__init__.py          (stub)
├── pipeline/state.py             (full — PipelineState TypedDict)
├── pipeline/nodes.py             (stub)
├── pipeline/graph_pipeline.py    (stub)
├── pipeline/runner.py            (stub)
├── orchestrator/__init__.py      (stub)
├── orchestrator/orchestrator.py  (stub)
├── orchestrator/permits.py       (stub)
├── orchestrator/events.py        (full — EventEmitter)
├── server/__init__.py            (stub)
├── server/app.py                 (stub with route signatures)
├── server/ws.py                  (full — ConnectionManager)
├── server/store.py               (stub)
├── server/models.py              (full — all Pydantic models)
├── hooks/permit_check.py         (stub)
├── hooks/report.py               (stub)
├── mcp/server.py                 (stub)
├── deploy/bootstrap.sh
├── deploy/deploy.sh
└── tests/fixtures/               (empty dir)
```

### requirements.txt — exact pinned versions
```
fastapi==0.115.0
uvicorn[standard]==0.30.6
websockets==12.0
pyautogen[gemini]==0.4.2
langchain==0.3.7
langchain-google-genai==2.0.4
langchain-ibm==0.3.2
langgraph==0.2.53
langgraph-checkpoint-redis==0.0.4
neo4j==5.25.0
chromadb==0.5.18
sqlglot==25.29.0
networkx==3.4.2
gitpython==3.1.43
boto3==1.35.66
pypdf==5.1.0
ruff==0.7.4
pytest==8.3.3
pytest-asyncio==0.24.0
opentelemetry-sdk==1.28.1
opentelemetry-exporter-otlp==1.28.1
redis==5.2.0
mcp[http]==1.0.0
httpx==0.27.2
aiosqlite==0.20.0
pydantic==2.9.2
python-dotenv==1.0.1
```

### docker-compose.yml structure
```yaml
services:
  neo4j:
    image: neo4j:5
    ports: ["7474:7474", "7687:7687"]
    environment:
      NEO4J_AUTH: neo4j/${NEO4J_PASSWORD}
    volumes: [neo4j_data:/data]

  chroma:
    image: chromadb/chroma:latest
    ports: ["8000:8000"]
    volumes: [chroma_data:/chroma/chroma]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  engine:
    build: .
    command: python -m core.scanner  # scan worker
    volumes: [repo_workspace:/workspace]
    env_file: .env
    depends_on: [neo4j, chroma, redis]

  api:
    build: .
    command: uvicorn server.app:app --host 0.0.0.0 --port 8080
    ports: ["8080:8080"]
    volumes: [repo_workspace:/workspace]
    env_file: .env
    depends_on: [neo4j, chroma, redis]

  mcp:
    build: .
    command: python mcp/server.py
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [api]

volumes:
  neo4j_data:
  chroma_data:
  repo_workspace:
```

### agents/llm_config.py — write this fully in Step 1
```python
import os
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ibm import WatsonxLLM

# AG2 config dict for Gemini (used by CartographerAgent, FixerAgent)
GEMINI_CONFIG = {
    "model": "gemini-1.5-pro",
    "api_key": os.getenv("GEMINI_API_KEY"),
    "api_type": "google",
}

def get_gemini_ag2_config() -> dict:
    return {"config_list": [GEMINI_CONFIG], "temperature": 0.1}

# LangChain Gemini LLM (used by LangChain tools and chains)
def get_gemini_langchain():
    return ChatGoogleGenerativeAI(
        model="gemini-1.5-pro",
        google_api_key=os.getenv("GEMINI_API_KEY"),
        temperature=0.1,
    )

# WatsonX LLM via LangChain (used by DocUnderstanding, Inspector — cheaper)
def get_watsonx_langchain():
    return WatsonxLLM(
        model_id="ibm/granite-34b-code-instruct",
        url="https://us-south.ml.cloud.ibm.com",
        apikey=os.getenv("WATSONX_API_KEY"),
        project_id=os.getenv("WATSONX_PROJECT_ID", ""),
        params={"max_new_tokens": 2048, "temperature": 0.1},
    )

# AG2 config using WatsonX (via LangChain bridge)
def get_watsonx_ag2_config() -> dict:
    return {
        "config_list": [{
            "model": "ibm/granite-34b-code-instruct",
            "api_key": os.getenv("WATSONX_API_KEY"),
            "api_type": "watsonx",
            "base_url": "https://us-south.ml.cloud.ibm.com",
        }],
        "temperature": 0.1,
    }
```

### pipeline/state.py — write this fully in Step 1
```python
from typing import TypedDict, Optional, Any

class PipelineState(TypedDict):
    change_id: str
    repo_path: str
    request: dict           # ChangeRequest fields
    nodes: list[dict]       # GraphNode dicts
    edges: list[dict]       # GraphEdge dicts
    report: Optional[dict]  # ImpactReport dict
    scan_done: bool
    enrich_done: bool
    orchestrate_done: bool
    error: Optional[str]
    error_node: Optional[str]
```

### .env.example
```
GEMINI_API_KEY=your_gemini_key_here
WATSONX_API_KEY=bob_prod_bob-apikey_...
WATSONX_PROJECT_ID=your_watsonx_project_id
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=systemdna_secret
CHROMA_HOST=chroma
CHROMA_PORT=8000
REDIS_URL=redis://redis:6379
REPO_WORKSPACE=/workspace
GITHUB_TOKEN=your_github_token
DEMO_TOKEN=systemdna_demo_token
USE_DYNAMO=0
DYNAMO_TABLE=systemdna-events
S3_BUCKET=systemdna-artifacts
MAX_WORKERS=3
API_URL=http://api:8080
```

### .bob/settings.json (at repo root, not in engine/)
```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{"type": "command",
        "command": "python systemdna/engine/hooks/report.py",
        "timeout": 5}]
    }],
    "PreToolUse": [{
      "matcher": ".*",
      "hooks": [{"type": "command",
        "command": "python systemdna/engine/hooks/permit_check.py",
        "timeout": 5}]
    }],
    "PostToolUse": [{
      "matcher": ".*",
      "hooks": [{"type": "command",
        "command": "python systemdna/engine/hooks/report.py",
        "timeout": 5}]
    }],
    "Stop": [{
      "hooks": [{"type": "command",
        "command": "python systemdna/engine/hooks/report.py",
        "timeout": 5}]
    }]
  }
}
```

---

## SUB-TASK 2 — Scanners (python_scan, sql_scan, ts_scan, config_scan)

### Research step instructions
Spawn subagent to read:
- `systemdna/web/lib/mock/shopflow.ts` — extract all node ids, types, layers,
  files, line numbers, tokens arrays. This is your exact test target.
- `systemdna/web/lib/types.ts` — extract GraphNode and GraphEdge interfaces.
- `SystemDNA - PRD (IBM Bob 2.0 Hackathon).md` section 7 — extract node types per layer.

The subagent must return a JSON object:
```json
{
  "expected_nodes": [
    {"id": "db:column:orders.cust_id", "type": "Column", "layer": "database",
     "file": "db/schema.sql", "line": 3, "tokens": []}
  ],
  "expected_edges": [
    {"from": "pipe:sqlmodel:stg_orders", "to": "db:column:orders.cust_id",
     "type": "DERIVES_FROM", "rule": "keep_alias"}
  ]
}
```
Use this as your test assertions.

### Create test fixtures
Before writing scanner code, create `tests/fixtures/shopflow/` with real files:
- `db/schema.sql`
- `transforms/stg_orders.sql`
- `transforms/fct_revenue.sql`
- `pipelines/churn_job.py`
- `pipelines/export_job.py`
- `backend/models.py`
- `backend/schemas.py`
- `backend/routes.py`
- `frontend/src/types.ts`
- `frontend/src/OrdersTable.tsx`
- `dashboards/revenue.yaml`
- `processes.yaml`

Content of each file must match what `shopflow.ts` describes.

### python_scan.py specification
```python
def scan_python_files(repo_path: str) -> tuple[list[dict], list[dict]]:
    """
    Walk all .py files in repo_path.
    Return (nodes, edges) where:
    - nodes: list of GraphNode dicts (id, type, layer, name, file, line,
             parent, owner, pii, criticality, tested, tokens)
    - edges: list of GraphEdge dicts (id, from, to, type, source, confidence,
             evidence, rule)

    Node id format: layer:type:qualified_name
    Examples:
      be:orm:Order          (SQLAlchemy model)
      be:field:Order.cust_id (SQLAlchemy column)
      be:schema:OrderOut    (Pydantic model)
      be:field:OrderOut.cust_id (Pydantic field)
      api:endpoint:get_orders (FastAPI route)
      pipe:sparkjob:churn_job (PySpark job)

    Evidence format: "relative/path/to/file.py:42"
    All edges: source="parser", confidence="high"
    """
```

### sql_scan.py specification
```python
def scan_sql_files(repo_path: str) -> tuple[list[dict], list[dict]]:
    """
    Walk all .sql files in repo_path using sqlglot.
    Key: detect aliased columns.

    stg_orders.sql:  SELECT cust_id AS customer_key FROM orders
    Must produce:
      DERIVES_FROM edge:
        from: "db:column:orders.cust_id"
        to:   "pipe:column:stg_orders.customer_key"
        rule: "keep_alias"     ← CRITICAL: stops impact walk here
        evidence: "transforms/stg_orders.sql:3"
        confidence: "high"
    """
```

### ts_scan.py specification
```python
def scan_typescript_files(repo_path: str) -> tuple[list[dict], list[dict]]:
    """
    Call the existing ts-scan.mjs via subprocess.
    ts-scan.mjs is at: systemdna/core/scanner/ts-scan.mjs
    It takes the repo_path and returns JSON to stdout.
    Parse the JSON and normalise to GraphNode/GraphEdge schema.
    If ts-scan.mjs fails or node is not installed, return ([], []) and log.
    """
```

### config_scan.py specification
```python
def scan_config_files(repo_path: str) -> tuple[list[dict], list[dict]]:
    """
    Parse processes.yaml → BusinessProcess nodes (layer="business")
    Parse dashboards/*.yaml → Dashboard nodes (layer="dashboards")
    Detect 'source:' keys → emit READS edges to SQLModel nodes.
    """
```

### scanner/__init__.py
```python
def scan_repo(repo_path: str) -> tuple[list[dict], list[dict]]:
    """
    Call all four scanners. Merge results.
    Deduplicate nodes by id (keep first occurrence).
    Return (nodes, edges).
    Emit tool_call RunEvent for each scanner start/end (for TraceTimeline).
    Must complete in under 5 seconds on ShopFlow.
    """
```

---

## SUB-TASK 3 — Linker + Neo4j GraphStore + ChromaDB Store

### linker.py specification
```python
class Linker:
    def link(self, nodes: list[dict], edges: list[dict]) -> list[dict]:
        """
        Apply 6 cross-layer rules. Return NEW edges only (do not modify input).
        All new edges: source="parser", confidence="high"

        Rule 1: MAPS_TO — ORMModel.__tablename__ → Table.name
          rule="rename_ref"
          Example: Order.__tablename__="orders" → MAPS_TO db:table:orders

        Rule 2: SERIALIZES — Schema fields → ORMModel fields (matched by name)
          rule="rename_ref"
          Example: OrderOut.cust_id → SERIALIZES → Order.cust_id

        Rule 3: RETURNS — Endpoint return annotation → Schema
          rule="passthrough"
          Example: GET /api/orders returns OrderOut

        Rule 4: CONSUMES — Component fetch() URL → Endpoint path
          rule="passthrough"
          Example: OrdersTable fetch("/api/orders") → GET /api/orders

        Rule 5: TYPED_AS — TSField.name → API Field.name (same parent type name)
          rule="rename_ref"
          Example: TS Order.cust_id → TYPED_AS → be:field:OrderOut.cust_id

        Rule 6: SUPPORTS — Dashboard source column chain → BusinessProcess
          rule="passthrough"
          Example: revenue dashboard → biz:revenue_close
        """
```

### graph.py specification
```python
class GraphStore:
    def __init__(self, uri: str, user: str, password: str): ...

    def build(self, nodes: list[dict], edges: list[dict],
              repo: str, scanned_at: str) -> None:
        """
        Create Neo4j nodes and relationships.
        Node label: GraphNode  (use id as unique key)
        Relationship type: matches EdgeType from types.ts
        Run CREATE CONSTRAINT IF NOT EXISTS FOR (n:GraphNode) REQUIRE n.id IS UNIQUE
        """

    def to_json(self) -> dict:
        """
        Return complete Graph dict matching types.ts Graph interface:
        {
          repo: str,
          scannedAt: str,
          layers: LayerDef[],    ← hardcoded 8 layers
          nodes: GraphNode[],    ← all nodes from Neo4j
          edges: GraphEdge[],    ← all edges from Neo4j
          textIndex: {word: [file_paths]},  ← built from node.tokens[]
          files: RepoFile[]      ← one entry per unique file
        }
        CRITICAL: every field name must match types.ts exactly.
        """

    def add_edges(self, edges: list[dict]) -> None:
        """Merge new edges into Neo4j. Used by Cartographer."""

    def get_node(self, node_id: str) -> dict:
        """Return single GraphNode dict."""

    def get_downstream(self, node_id: str, depth: int = 3) -> list[tuple]:
        """
        BFS traversal via Cypher:
        MATCH (n {id: $id})-[r*1..{depth}]->(m) RETURN m.id, r
        Return list of (node_id, edge_rule, confidence) tuples.
        """

    def diff(self, old_node_ids: set, new_node_ids: set) -> dict:
        """Compare before/after. Return {before: int, after: int}
        where value = count of edges pointing to old name."""

    def save_json(self, path: str) -> None:
        """Write graph.json to disk (for compatibility)."""
```

### Hardcoded LAYER_DEFS (use exactly in to_json)
```python
LAYER_DEFS = [
    {"id": "database",   "label": "Database",    "column": 0,
     "requiresApproval": True,  "check": "sqlglot parse"},
    {"id": "pipelines",  "label": "Pipelines",   "column": 1,
     "check": "sqlglot parse + ruff"},
    {"id": "backend",    "label": "Backend",     "column": 2,
     "check": "ruff check"},
    {"id": "api",        "label": "API",         "column": 3,
     "check": "ruff check"},
    {"id": "frontend",   "label": "Frontend",    "column": 4,
     "check": "tsc --noEmit"},
    {"id": "dashboards", "label": "Dashboards",  "column": 5},
    {"id": "business",   "label": "Business",    "column": 6},
    {"id": "quality",    "label": "Tests & Docs", "column": -1},
]
```

### chroma.py specification
```python
class ChromaStore:
    def __init__(self, host: str, port: int): ...

    def upsert(self, nodes: list[dict]) -> None:
        """
        For each node, create a summary string:
        "{name} ({type}) in {file} — {layer} layer"
        Embed using GoogleGenerativeAIEmbeddings (Gemini).
        Upsert into collection named "systemdna_nodes".
        """

    def search(self, query: str, n: int = 5) -> list[dict]:
        """Cosine similarity search. Return top-n node dicts."""
```

---

## SUB-TASK 4 — AG2 Cartographer Subagents + Document Understanding

### Research step
Spawn subagent to:
1. Read `systemdna/web/lib/mock/shopflow.ts` — find the bob-sourced edges
   (confidence="medium", source="bob"). These are what Cartographers must find.
2. Read the dynamic SQL trap description in TEAM_PLAN.md and PRD section 15.
3. Return: exact edge dict for the export_job dynamic SQL trap.

Expected Cartographer output for the dynamic SQL trap:
```json
{
  "from": "pipe:sparkjob:export_job",
  "to": "db:column:orders.cust_id",
  "type": "READS",
  "rule": "rename_ref",
  "evidence": "pipelines/export_job.py:8",
  "confidence": "medium"
}
```

### cartographers.py specification
```python
class CartographerAgent:
    """
    AG2 AssistantAgent for one layer.
    LLM: Gemini 1.5 Pro (get_gemini_ag2_config())
    System prompt template:
    '''
    You are a Cartographer agent for the {layer} layer of a software system.
    Your job: find dependency edges between code entities that the static
    parser missed.

    You will be given:
    - Files in this layer
    - Already-known nodes in this layer
    - Unresolved references (things that mention identifiers from other layers
      but have no edge yet)

    Return ONLY a JSON array of edges. Each edge must have:
    - from: source node id (layer:type:qualified_name)
    - to: target node id
    - type: one of READS/WRITES/CALLS/IMPORTS/DERIVES_FROM/CONSUMES/TYPED_AS
    - rule: one of rename_ref/keep_alias/update_type/update_doc/passthrough
    - evidence: REQUIRED — must be "relative/file/path.ext:line_number"
    - confidence: "medium"

    REJECT any edge you cannot ground in a specific file and line number.
    Return [] if you find nothing.

    Files:
    {files_content}

    Known nodes:
    {nodes_json}

    Unresolved references:
    {unresolved_refs}
    '''
    """

class CartographerOrchestrator:
    async def enrich(self, graph_store: GraphStore,
                     event_emitter: EventEmitter) -> None:
        """
        Run one CartographerGroupChat per layer in parallel.
        asyncio.gather all 7 tasks.
        For each layer:
          1. emit agent_started (agent_id=f"cartographer-{layer}")
          2. run GroupChat (max_round=5)
          3. parse JSON response
          4. validate: reject edges without evidence matching r"\\w+\\.\\w+:\\d+"
          5. call graph_store.add_edges(valid_edges)
          6. emit done (agent_id=f"cartographer-{layer}")
        """
```

### doc_understanding.py specification
```python
class DocUnderstandingAgent:
    """
    Uses WatsonX (cheaper for read-only analysis) via LangChain.
    Reads PDF and markdown docs with LangChain loaders.
    Returns node attribute patches.
    """

    def enrich(self, graph_store: GraphStore, doc_paths: list[str]) -> None:
        """
        For each doc file:
        1. Load with PyPDFLoader (PDF) or TextLoader (markdown)
        2. Split into chunks with RecursiveCharacterTextSplitter
        3. Prompt WatsonX:
           "Read this documentation. Extract:
            - For each entity mentioned (table, column, API, field):
              {node_id, owner_team, pii: bool, criticality, business_meaning}
            Return JSON array."
        4. Apply patches to Neo4j nodes via graph_store.patch_nodes(patches)
        """
```

---

## SUB-TASK 5 — Impact Engine

### Research step
Spawn subagent to:
1. Read `systemdna/web/lib/impact.ts` (the browser-side impact engine).
2. Read `systemdna/web/lib/types.ts` ImpactReport interface.
3. Read `systemdna/web/lib/mock/shopflow.ts` edges.
4. Return: complete expected ImpactReport for the ShopFlow hero change
   (rename orders.cust_id → customer_id).

### impact.py specification
```python
class ImpactEngine:
    def analyse(self, graph_store: GraphStore,
                request: dict) -> dict:
        """
        Run in under 1 second.
        Return ImpactReport dict matching types.ts ImpactReport exactly:
        {
          request: ChangeRequest,
          oldName: str,           ← e.g. "cust_id"
          items: ImpactItem[],
          fixUnits: FixUnit[],    ← ONE per FILE (not per node)
          waveCount: int,
          business: [{nodeId, name, owner, severity}],
          grep: {found, missed, falsePositives},
          levels: [[nodeId, ...], ...],  ← grouped by BFS depth (for ripple)
          danglingRefs: int,
          computedMs: int,
        }
        """

    def _walk_downstream(self, node_id: str, change: dict) -> list[dict]:
        """
        BFS using graph_store.get_downstream().
        Apply edge rule to each hop:
          rename_ref  → severity=breaking,      continue walk
          keep_alias  → severity=needs_update,  STOP (downstream is safe)
          update_type → severity=needs_update,  continue
          update_doc  → severity=update,        stop
          passthrough → severity=safe,          continue

        CRITICAL: The alias trap depends on keep_alias STOPPING the walk.
        stg_orders.sql aliases cust_id → customer_key.
        Downstream of stg_orders (fct_revenue, revenue dashboard) must be safe.
        """

    def _build_fix_units(self, items: list[dict],
                         graph_store: GraphStore) -> list[dict]:
        """
        Group items by file (not by node).
        One FixUnit per unique file path.
        FixUnit.id = file path
        FixUnit.assets = list of node ids that live in this file
        FixUnit.wave = assigned wave number
        FixUnit.needsApproval = True if layer=database or any node pii=True
        """

    def _grep_comparison(self, old_name: str,
                         graph_store: GraphStore,
                         affected_files: list[str]) -> dict:
        """
        graph_store.to_json()['textIndex'][old_name] = files containing old_name
        found = files that contain old_name AND are in affected_files
        missed = affected_files NOT containing old_name (grep would miss these)
        falsePositives = files containing old_name but NOT in affected_files
        """
```

### Test assertions (ShopFlow hero change)
```python
# tests/test_impact.py
def test_shopflow_hero_change():
    # Setup: build graph from ShopFlow fixture
    # Request: rename db:column:orders.cust_id → customer_id
    report = engine.analyse(graph_store, {
        "node": "db:column:orders.cust_id",
        "change": "rename",
        "to": "customer_id"
    })

    # 17+ affected nodes
    non_safe = [i for i in report["items"] if i["severity"] != "safe"]
    assert len(non_safe) >= 17

    # Alias trap: customer_key nodes are safe
    safe_ids = {i["nodeId"] for i in report["items"] if i["severity"] == "safe"}
    assert "pipe:column:stg_orders.customer_key" in safe_ids
    assert "pipe:sqlmodel:fct_revenue" in safe_ids

    # Dynamic SQL trap: export_job is medium confidence
    export_item = next(i for i in report["items"]
                       if i["nodeId"] == "pipe:sparkjob:export_job")
    assert export_item["confidence"] == "medium"

    # Business impact
    biz_ids = {b["nodeId"] for b in report["business"]}
    assert "biz:revenue_close" in biz_ids or "biz:retention_review" in biz_ids

    # Waves
    assert report["waveCount"] >= 4

    # Speed
    assert report["computedMs"] < 1000
```

---

## SUB-TASK 6 — FastAPI Server + WebSocket

### server/models.py — write ALL models matching types.ts
```python
from pydantic import BaseModel
from typing import Optional, Literal

class ChangeRequest(BaseModel):
    node: str
    change: Literal["rename", "type_change", "delete"]
    to: str

class RunEvent(BaseModel):
    ts: str
    change_id: str
    event: Literal[
        "impact_ready", "awaiting_approval", "approved",
        "wave_started", "agent_started", "tool_call", "blocked",
        "check_passed", "check_failed", "retrying", "done",
        "quarantined", "wave_completed", "rescan", "inspector",
        "pr_created", "change_completed"
    ]
    agent_id: Optional[str] = None
    session_id: Optional[str] = None
    wave: Optional[int] = None
    tool: Optional[str] = None
    file: Optional[str] = None
    node: Optional[str] = None
    permit_ok: Optional[bool] = None
    detail: Optional[str] = None
    bobcoins: Optional[float] = None
    data: Optional[dict] = None

class PostChangesResponse(BaseModel):
    change_id: str
    report: dict  # ImpactReport dict

# CRITICAL: change.mode must be "live" not "demo" — otherwise frontend uses simulator
class Change(BaseModel):
    id: str
    repo: Optional[str] = None
    title: str
    request: dict
    report: dict
    createdAt: str
    mode: Literal["live"] = "live"  # hardcoded to "live"
    events: list[dict] = []
```

### server/ws.py — ConnectionManager
```python
class ConnectionManager:
    def __init__(self):
        self.active: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active.discard(websocket)

    async def broadcast(self, message: str):
        """Send to all connected clients. Remove dead connections."""
        dead = set()
        for ws in self.active:
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        self.active -= dead
```

### server/app.py — critical route for live mode
```python
@app.post("/events")
async def receive_event(event: RunEvent, ...) -> dict:
    """
    This endpoint is the heart of the live UI.
    Every Bob hook and every AG2 agent posts here.
    1. Save to store
    2. Broadcast to all WebSocket clients
    The frontend's subscribeEvents() in api.ts receives these via WS /ws.
    """
    await store.save_event(event.model_dump())
    await manager.broadcast(event.model_json())
    return {}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Frontend connects here when NEXT_PUBLIC_API_URL is set.
    Keep connection alive; relay events from POST /events.
    """
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep alive
    except WebSocketDisconnect:
        manager.disconnect(websocket)
```

---

## SUB-TASK 7 — LangGraph Pipeline + Redis Checkpointing

### pipeline/graph_pipeline.py specification
```python
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.redis import RedisSaver

def build_graph() -> CompiledStateGraph:
    """
    Build the three-node StateGraph.
    Nodes: scan_node, enrich_node, orchestrate_node
    Edges:
      START → scan_node
      scan_node → enrich_node (if not error)
      scan_node → END (if error)
      enrich_node → orchestrate_node (if not error)
      enrich_node → END (if error)
      orchestrate_node → END

    Checkpointer: RedisSaver(redis_url=os.getenv("REDIS_URL"))
    thread_id = change_id (set in config when invoking)
    """
    builder = StateGraph(PipelineState)
    builder.add_node("scan_node", scan_node)
    builder.add_node("enrich_node", enrich_node)
    builder.add_node("orchestrate_node", orchestrate_node)
    builder.set_entry_point("scan_node")
    builder.add_conditional_edges(
        "scan_node",
        lambda s: "enrich_node" if not s.get("error") else END,
    )
    builder.add_conditional_edges(
        "enrich_node",
        lambda s: "orchestrate_node" if not s.get("error") else END,
    )
    builder.add_edge("orchestrate_node", END)
    checkpointer = RedisSaver.from_conn_string(os.getenv("REDIS_URL"))
    return builder.compile(checkpointer=checkpointer)
```

### pipeline/runner.py specification
```python
class PipelineRunner:
    def start(self, change_id: str, repo_path: str, request: dict) -> None:
        """
        Initialize PipelineState.
        Invoke graph with config={"configurable": {"thread_id": change_id}}.
        graph.invoke(initial_state, config)
        """

    def resume(self, change_id: str) -> None:
        """
        Re-invoke graph with same thread_id.
        LangGraph reads Redis checkpoint and skips completed nodes.
        graph.invoke(None, config={"configurable": {"thread_id": change_id}})
        """
```

---

## SUB-TASK 8 — Orchestrator + Hooks + Permits

### orchestrator/events.py — EventEmitter (write this early, used everywhere)
```python
import httpx
from datetime import datetime, timezone

class EventEmitter:
    def __init__(self, api_url: str, change_id: str):
        self.api_url = api_url
        self.change_id = change_id

    def emit(self, event: str, **kwargs) -> None:
        """
        Post a RunEvent to POST /events.
        Constructs the event dict with all fields from types.ts RunEvent.
        Uses httpx (sync) — do not use async here (hooks are sync scripts).
        """
        payload = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "change_id": self.change_id,
            "event": event,
            **kwargs
        }
        try:
            httpx.post(
                f"{self.api_url}/events",
                json=payload,
                headers={"Authorization": f"Bearer {os.getenv('DEMO_TOKEN')}"},
                timeout=5.0,
            )
        except Exception as e:
            # Never crash the agent because event emission failed
            print(f"[EventEmitter] Failed to emit {event}: {e}")
```

### hooks/permit_check.py — critical for governance
```python
"""
Called by Bob as PreToolUse hook.
Reads hook payload from stdin.
Checks permit. Exits with code 2 if out of permit (Bob refuses the tool call).

Hook payload fields (accept both variants per PRD):
  event_name: "PreToolUse"
  tool_name OR tool: str
  tool_input.path OR tool_input.file_path: str
  session_id: str
  env.SYSTEMDNA_AGENT_ID: str
"""
import json, os, sys
from pathlib import Path

def main():
    payload = json.load(sys.stdin)
    tool = payload.get("tool_name") or payload.get("tool", "")
    tool_input = payload.get("tool_input", {})
    file_path = tool_input.get("path") or tool_input.get("file_path", "")
    agent_id = os.getenv("SYSTEMDNA_AGENT_ID") or payload.get("session_id", "")

    # Load permit
    permit_path = Path(f".systemdna/permits/{agent_id}.json")
    if not permit_path.exists():
        # No permit = developer session, allow everything
        emit_event("tool_call", agent_id=agent_id, tool=tool,
                   file=file_path, permit_ok=True)
        sys.exit(0)

    permit = json.loads(permit_path.read_text())
    allowed = permit.get("allowed_files", [])
    is_write = tool in ("write_to_file", "apply_diff", "create_file",
                        "replace_in_file")

    if is_write and file_path and file_path not in allowed:
        emit_event("blocked", agent_id=agent_id, tool=tool,
                   file=file_path, permit_ok=False,
                   detail=f"out of permit: {file_path} not in {allowed}")
        sys.exit(2)  # Bob refuses the tool call

    emit_event("tool_call", agent_id=agent_id, tool=tool,
               file=file_path, permit_ok=True)
    sys.exit(0)

def emit_event(event_type, **kwargs): ...  # posts to POST /events via httpx
```

---

## SUB-TASK 9 — AG2 Fixer + Inspector Agents

### agents/fixer.py specification
```python
class FixerAgent:
    """
    AG2 AssistantAgent using Gemini (code generation).
    Falls back to this when 'bob -p' is unavailable.
    Applies propagate-rename recipes per file type.
    """

    RECIPES = {
        "sql":   "Rename all occurrences of {old_name} to {to} in SQL. "
                 "For aliased columns (SELECT {old_name} AS x), change only "
                 "the source side: SELECT {to} AS x.",
        "py":    "Rename {old_name} to {to}. Update SQLAlchemy column names, "
                 "Pydantic field names, and PySpark column string references.",
        "ts":    "Rename TypeScript interface field {old_name} to {to}. "
                 "Update all usages in the component.",
        "tsx":   "Rename field {old_name} to {to} in the React component "
                 "and any typed props.",
        "yaml":  "Update 'source:' lines that reference {old_name} to {to}.",
        "test":  "Update test assertions that check for {old_name} to {to}.",
        "md":    "Update documentation mentions of {old_name} to {to}.",
    }

    def run(self, unit: dict, permit: dict, change: dict,
            emitter: EventEmitter) -> dict:
        """
        Run the Fixer for one FixUnit.
        Emit: agent_started → tool_call (per write) → check_passed/failed → done
        Returns: {passed: bool, detail: str}
        """
```

### agents/inspector.py specification
```python
class InspectorAgent:
    """
    Uses WatsonX (cheaper — read-only analysis).
    Reviews the full git diff against the impact report.
    """

    def run(self, diff_text: str, report: dict,
            emitter: EventEmitter) -> dict:
        """
        Prompt: "You are the Inspector agent. Review this git diff against
        the impact report. Verify:
        1. Every affected node in the report has been changed.
        2. No files outside the permitted scope were changed.
        3. All changes are syntactically correct for their language.
        Return JSON: {verdict: approved|needs_revision, issues: int, details: [str]}"

        Uses get_watsonx_langchain() as the LLM.
        Emits: agent_started → done → inspector RunEvent
        """
```

---

## SUB-TASK 10 — MCP Server

### mcp/server.py specification
```python
"""
FastMCP HTTP server on port 3000.
7 tools matching PRD section 13 exactly.
Used by Bob IDE Change Planner mode.
"""
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("SystemDNA")

@mcp.tool()
def scan_repo(path: str) -> dict:
    """Scan a repo and build the knowledge graph."""

@mcp.tool()
def get_impact(node: str, change: str, to: str) -> dict:
    """Analyse the impact of a change. Returns ImpactReport."""

@mcp.tool()
def plan_change(change_id: str) -> dict:
    """Return the wave plan, permits needed, approvals required."""

@mcp.tool()
def start_wave(change_id: str, wave: int) -> dict:
    """Start all agents in a wave."""

@mcp.tool()
def get_status(change_id: str) -> dict:
    """Return current state of all agents and nodes."""

@mcp.tool()
def approve(change_id: str, node: str) -> dict:
    """Record human approval for a db or PII node."""

@mcp.tool()
def verify(change_id: str) -> dict:
    """Run re-scan and return dangling ref count + graph diff."""
```

---

## SUB-TASK 11 — Bob Modes & propagate-rename Skill

### Research step
Spawn subagent to:
1. Call `search_ibm_docs` with library `bob`, query "custom modes file format YAML schema roleDefinition"
2. Call `search_ibm_docs` with library `bob`, query "Skills SKILL.md frontmatter schema"
3. Return: exact file format and required fields for both modes and skills.

Use the returned format to write the mode files. Do not guess — use exactly what the docs say.

---

## SUB-TASK 12 — EC2 Deployment & Smoke Test

### deploy/bootstrap.sh
```bash
#!/bin/bash
set -e

# Install Docker CE
apt-get update -y
apt-get install -y docker.io docker-compose-plugin

# Start Docker
systemctl enable docker && systemctl start docker

# Install Bob Shell
curl -fsSL https://install.bob.ai/shell | bash

# Clone repo
git clone https://github.com/pujarachchh-intuitive/AIGarage.git /app
cd /app

# Copy .env (user must provide this)
echo "Place your .env file in /app/systemdna/engine/.env"
echo "Then run: cd /app/systemdna/engine && docker compose up -d"
```

### Smoke test sequence
```bash
# 1. Start all services
cd systemdna/engine && docker compose up -d

# 2. Wait for health
docker compose ps  # all should be "healthy" or "running"

# 3. Verify graph endpoint
curl http://localhost:8080/graph | python3 -m json.tool | head -20

# 4. Submit hero change
curl -X POST http://localhost:8080/changes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer systemdna_demo_token" \
  -d '{"node":"db:column:orders.cust_id","change":"rename","to":"customer_id"}'

# 5. Start the run
curl -X POST http://localhost:8080/changes/chg-001/run \
  -H "Authorization: Bearer systemdna_demo_token"

# 6. Watch events (in another terminal)
websocat ws://localhost:8080/ws

# 7. Connect frontend
# In systemdna/web/.env.local:
# NEXT_PUBLIC_API_URL=http://localhost:8080
# npm run dev
# Open http://localhost:3000 — Agent City should show live data
```

---

## VALIDATION CHECKLIST

Before marking each sub-task complete, validate:

### Types compliance
- [ ] `GET /graph` response passes TypeScript type check against `Graph` interface
- [ ] Every `RunEvent` emitted has all required fields from `types.ts`
- [ ] `change.mode` is always `"live"` (not `"demo"`)
- [ ] `ImpactReport.levels[]` is populated (ripple animation needs it)
- [ ] `FixUnit.id` is a file path (not a node id)

### ShopFlow correctness
- [ ] Scanner finds ≥30 nodes from ShopFlow fixture
- [ ] `stg_orders.customer_key` is `safe` in impact report
- [ ] `export_job` is in impact report with `confidence=medium`
- [ ] `biz:revenue_close` is in `report.business[]`
- [ ] `report.waveCount >= 4`
- [ ] `report.computedMs < 1000`

### Live UI integration
- [ ] `POST /events` broadcasts to all WS clients within 100ms
- [ ] Agent City map shows at least one node after `GET /graph`
- [ ] Approval banner appears when `awaiting_approval` event emitted
- [ ] KPI "Dangling references: 0" shows green after `rescan` event

### Fault tolerance
- [ ] Kill `api` container mid-run; restart; `POST /changes/{id}/resume` continues
- [ ] LangGraph skips completed nodes on resume
- [ ] All events re-emitted for in-progress node only

### Security
- [ ] `WATSONX_API_KEY` never in any committed file
- [ ] `GEMINI_API_KEY` never in any committed file
- [ ] `DEMO_TOKEN` required on write endpoints
- [ ] `.env` in `.gitignore`
