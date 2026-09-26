# Architecture Diagram 5 — Graph Build (3 Passes)

How the 7-layer knowledge graph is built from a repo.

```
REPO (any Python/TS/SQL/YAML codebase)
        │
        ▼
═══════════════════════════════════════════════════════
PASS 1 — Parsers  (scan_node in LangGraph)
Speed: <5 seconds  |  Confidence: high  |  Source: parser
═══════════════════════════════════════════════════════
        │
        ├── python_scan.py   (ast.walk)
        │   Finds: Module, Class, Function, ORMModel, Schema,
        │           Field, Endpoint, SparkJob
        │   Edges:  IMPORTS, CALLS, READS, WRITES
        │
        ├── sql_scan.py      (sqlglot.parse + lineage)
        │   Finds: Table, Column
        │   Edges:  DERIVES_FROM (keep_alias if aliased, rename_ref if not)
        │           READS, WRITES
        │
        ├── ts_scan.py       (subprocess → ts-scan.mjs)
        │   Finds: TSType, TSField, Component, Endpoint
        │   Edges:  IMPORTS, CALLS, CONSUMES
        │
        └── config_scan.py   (PyYAML)
            Finds: Dashboard, BusinessProcess
            Edges:  SUPPORTS, READS
        │
        ▼
═══════════════════════════════════════════════════════
PASS 2 — Cross-layer Linker  (scan_node continued)
Speed: <1 second  |  Confidence: high  |  Source: parser
═══════════════════════════════════════════════════════
        │
        Linker.link(nodes, edges) adds:
        │
        ├── ORM.__tablename__ matches Table.name
        │   → MAPS_TO edge  (rule=rename_ref)
        │
        ├── Schema fields match ORMModel fields by name
        │   → SERIALIZES edge  (rule=rename_ref)
        │
        ├── Endpoint return annotation matches Schema name
        │   → RETURNS edge  (rule=passthrough)
        │
        ├── Component fetch("/api/X") matches Endpoint "/api/X"
        │   → CONSUMES edge  (rule=passthrough)
        │
        ├── TSField.name matches API Field.name in same-named parent
        │   → TYPED_AS edge  (rule=rename_ref)
        │
        └── Dashboard source column matches SQLModel column
            → dependency edge for SUPPORTS traversal
        │
        ▼
GraphStore.build(nodes, edges) → Neo4j + ChromaDB
        │
        ├── Neo4j: one node per GraphNode, one rel per GraphEdge
        │   Constraint: UNIQUE on node.id
        │
        └── ChromaDB: embed each node's summary string
            using GoogleGenerativeAIEmbeddings (Gemini)
        │
        ▼
═══════════════════════════════════════════════════════
PASS 3 — AG2 Cartographers  (enrich_node in LangGraph)
Speed: ~30-60s  |  Confidence: medium  |  Source: bob
═══════════════════════════════════════════════════════
        │
        7 CartographerGroupChats run in parallel (asyncio.gather)
        Each gets: layer files + nodes + unresolved_refs
        Each returns: [{from, to, type, rule, evidence, confidence}]
        Validator rejects any edge without "file:line" evidence
        │
        Key finding: dynamic SQL trap
        export_job.py:8  f"SELECT {col} FROM orders"
        Cartographer returns:
        {
          from: "pipe:sparkjob:export_job",
          to: "db:column:orders.cust_id",
          type: "READS",
          rule: "rename_ref",
          evidence: "pipelines/export_job.py:8",
          confidence: "medium",
          source: "bob"
        }
        → shows "Found by Bob" badge in Agent City UI
        │
        DocUnderstandingAgent reads:
        • data_dictionary.pdf  (LangChain PyPDFLoader)
        • docs/adr-*.md        (LangChain TextLoader)
        Returns patches: [{node_id, owner, pii, criticality}]
        Applied to Neo4j nodes
        │
        ▼
FINAL GRAPH stored in Neo4j
  ~30+ nodes, ~40+ edges for ShopFlow
  GET /graph returns JSON matching types.ts Graph interface exactly
```

## Node id format

```
layer:type:qualified_name

Examples:
  db:column:orders.cust_id
  pipe:sqlmodel:stg_orders
  be:orm:Order
  be:field:Order.cust_id
  api:endpoint:get_orders
  fe:tsfield:Order.cust_id
  biz:revenue_close
  qa:test:test_routes
```

## The 3 traps (why grep fails, why SystemDNA succeeds)

```
Trap 1 — Alias chain (sql_scan catches it)
  stg_orders.sql: SELECT cust_id AS customer_key
  → DERIVES_FROM edge with rule=keep_alias
  → Impact engine stops walk at stg_orders
  → Downstream (fct_revenue, revenue dashboard) is SAFE
  → grep would mark them affected — SystemDNA doesn't

Trap 2 — Dynamic SQL (Cartographer catches it)
  export_job.py:8: f"SELECT {col} FROM orders"
  → parser can't see it (variable in string)
  → Cartographer returns READS edge, confidence=medium
  → Impact engine marks export_job breaking
  → grep misses it entirely

Trap 3 — Cross-language (Linker catches it)
  Python API field OrderOut.cust_id
    → SERIALIZES → Order.cust_id
    → RETURNS → GET /api/orders
    → CONSUMES → OrdersTable (React)
    → TYPED_AS → TS Order.cust_id
  → 5-hop chain across 4 languages
  → grep finds none of these links
```
