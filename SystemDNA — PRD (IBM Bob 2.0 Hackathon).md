# SystemDNA — Product Requirements Document

Sep 26, 2026 · @Krishil Agrawal

## 1. Summary

SystemDNA shows what a code change will break across a whole system, then has a governed crew of IBM Bob agents fix every affected part and prove the change is complete.

**Tagline:** Find References for your whole system, and fix them all.

**How it works, in five steps:**

1. **Map.** It scans a repo and builds a knowledge graph of every component across 7 layers: database, data pipelines, backend, API, frontend, dashboards and business processes.
2. **Predict.** A developer picks one change, such as renaming a column. SystemDNA shows the ripple: what breaks, how badly, in what order, and which business process is hit.
3. **Fix.** Parallel Bob agents fix every affected component in dependency order. Each agent may only edit the files on its permit.
4. **Govern and observe.** An Agent City map shows every agent live. City rules are enforced by Bob lifecycle hooks, not just drawn.
5. **Prove.** A re-scan of the graph shows 0 dangling references. Tests pass. The output is one PR, an impact report and a full audit trail.

**Event:** IBM Bob 2.0 Hackathon on lablab.ai, 25 to 27 September 2026 (48 hours, online). Submission is due 27 September 2026.

**Workflow improved:** application maintenance and release. Specifically, making safe changes that cross many languages and layers.

**Hosting:** AWS. One EC2 host runs the engine and the Bob workers. S3 and CloudFront host the dashboard. DynamoDB, S3, Secrets Manager and CloudWatch handle data, secrets and logs. We use no IBM Cloud services. IBM Bob is the only IBM product in the build.

**Team:** 6 people. 2 Cloud and Platform engineers and 4 Forward Deployed Engineers (section 16).

## 2. Problem

Changes that cross languages and layers are traced by hand today, so they are slow, incomplete and break things in production.

"Find references" in a code editor only works inside one language. Real systems mix SQL, PySpark, Python, TypeScript, YAML configs and docs. One small change travels through all of them.

**Example.** A developer renames the column `orders.cust_id` to `customer_id`. That one change can break:

- a SQL transform, and every model built on its alias `customer_key`
- a PySpark job, including one that builds SQL from a string at runtime
- the Python ORM model and the API response schema
- the TypeScript type and the React table that shows it
- a revenue dashboard, and the Finance month-end close that uses it
- tests and docs

**What developers do today:**

1. Search the repo with grep for `cust_id`. This misses aliases, dynamic SQL and renamed fields.
2. Ask teammates who "might know".
3. Fix what they found, one file at a time.
4. Find the rest when a job fails or a dashboard shows wrong numbers.

**The cost.** Impact analysis takes hours per change and still misses dependencies. The misses show up later as failed jobs, wrong reports and rework. We will measure the exact numbers with a timed manual baseline on our sample repo (see section 11).

**Why now.** Teams now use AI agents to make changes faster. But one agent works file by file, and many agents at once are invisible and clash with each other. Nobody can see or control what a swarm of agents is doing in the code.

## 3. Goals, non-goals and success metrics

The hackathon build must do one change type (rename a field) perfectly from start to finish, on our own sample repo, with real numbers to prove it.

**Goals**

1. Build a cross-layer knowledge graph of a repo with 7 layers and 19 node types.
2. Predict the full impact of a change, including links that grep cannot find.
3. Fix every affected component with parallel Bob agents, in dependency order.
4. Enforce governance rules on the agents for real, using Bob hooks.
5. Prove completeness with a graph re-scan (0 dangling references) and passing tests.
6. Show all of this live on a visual Agent City map.
7. Use Bob 2.0 inside the product: Agent mode, Plan mode, parallel subagents, document understanding, custom modes, Skills, hooks, MCP and Bob Shell.

**Non-goals for the hackathon**

- Scanning any public GitHub repo. We use our own sample repo, ShopFlow.
- Governing external agents by URL. This is on the roadmap (section 17).
- A 3D city. We build a 2D layered map first.
- Neo4j or any graph database. We use NetworkX and JSON files.
- Change types other than rename working end to end. Type change and delete are stretch goals.
- User accounts, login or multi-tenant hosting.

**Success metrics**

| Metric | Target | How we measure |
| --- | --- | --- |
| Affected components found | 100% of the known list (about 17 of 17) | Compare with a hand-made answer key for ShopFlow |
| Components found by grep alone | Show the gap (expected about half) | Timed manual baseline by a teammate |
| Time to find the impact | Under 1 second | Timer in the impact API |
| Time to apply all fixes | Under 10 minutes | Trace timeline |
| Dangling references after the change | 0 | Graph re-scan |
| Tests passing after the change | 100% | Test runner output |
| Edits blocked outside a permit | At least 1 shown live in the demo | Hook audit log |
| Bobcoins per change | Under 20 | Bob usage summary |
| Bob sessions exported | 100% of build and demo tasks | `bob_sessions/` folder |

## 4. Users and user stories

The main user is the developer making the change. Reviewers, data owners and engineering leads use the outputs.

| User | What they need | What SystemDNA gives them |
| --- | --- | --- |
| Developer or data engineer (main user) | Change something safely without breaking other teams | Impact before the change, automatic fixes after it |
| Code reviewer | Trust that a big cross-layer PR is complete and correct | Impact report, graph diff, test results, audit trail |
| Data or API owner | Know when a change touches their assets or personal data | Owner and PII flags, approval gates |
| New team member | Understand how the system fits together | The city map and the "what depends on this" view |
| Engineering lead | Control cost and risk of AI agents | Budget limits, blocked actions, cost and time metrics |

**User stories (must have)**

1. As a developer, I can scan the repo and see every component and dependency on one map.
2. As a developer, I can click a field and see everything that depends on it, across all layers.
3. As a developer, I can request "rename X to Y" from Bob IDE and get an impact report in seconds.
4. As a developer, I can see which business processes and owners a change affects.
5. As a developer, I can approve a fix plan and watch Bob agents apply it in waves.
6. As a developer, I can see each agent live on the map: where it is and what state it is in.
7. As a reviewer, I get one PR with an impact report, test results and 0 dangling references.
8. As an engineering lead, I can see that agents were blocked from editing outside their permits.

**User stories (should have)**

9. As a data owner, I must approve any change to a database or PII building before an agent edits it.
10. As a developer, I can compare manual search with SystemDNA to see what grep missed.
11. As a lead, I can see time and Bobcoin cost per change and per agent.
12. As a new team member, I can zoom from layers down to files and fields.

## 5. Feature list

We will build 63 features: 43 Must, 15 Should and 5 Stretch. Must features make the demo work end to end on AWS. Should features make it convincing. Stretch features happen only if every Must is done by hour 20.

**Owners (team of 6).** CP1 = Cloud and platform: infrastructure and delivery. CP2 = Cloud and platform: runtime, data and security. FDE1 = Graph engine. FDE2 = Impact, orchestration and sample repo. FDE3 = Bob agents and governance. FDE4 = Frontend and demo. The full task split is in the separate team plan file.

| ID | Area | Feature | What it does | Priority | Owner |
| --- | --- | --- | --- | --- | --- |
| F01 | Graph | Python scanner | Uses Python `ast` to find modules, classes, functions, imports, calls, FastAPI routes, Pydantic schemas, SQLAlchemy models and PySpark reads, selects and writes | Must | FDE1 |
| F02 | Graph | SQL scanner | Uses sqlglot to find tables, columns and column-level lineage, including aliases | Must | FDE1 |
| F03 | Graph | TypeScript scanner | Finds interface fields, `fetch()` URLs and field use in components (regex or tree-sitter) | Must | FDE1 |
| F04 | Graph | Config scanner | Reads dashboard YAML and `processes.yaml` | Must | FDE1 |
| F05 | Graph | Cross-layer linker | Links ORM to table, schema to ORM, route to fetch URL, TS field to API field, dashboard to model | Must | FDE1 |
| F06 | Graph | Graph store | Holds the graph in NetworkX and saves `graph.json` (to S3) with evidence and confidence per edge | Must | FDE1 |
| F07 | Graph | Cartographer subagents | Parallel Bob subagents, one per layer, find links parsers miss, such as dynamic SQL | Must | FDE3 |
| F08 | Graph | Document understanding | Bob reads the data dictionary PDF and ADR to add owners, PII flags and business meaning | Must | FDE3 |
| F09 | Graph | Confidence badges | Shows whether each link came from a parser or from Bob | Should | FDE4 |
| F10 | Impact | Change request intake | Turns a Bob IDE request or a change document into `{node, change, to}` | Must | FDE2 |
| F11 | Impact | Ripple traversal | Walks downstream and marks each node Breaking, Needs update or Safe, using edge rules | Must | FDE2 |
| F12 | Impact | Business impact | Lists affected business processes and owners | Must | FDE2 |
| F13 | Impact | Risk score | Scores each node 0 to 100 from fan-out, criticality, PII and test coverage | Should | FDE2 |
| F14 | Impact | Wave planner | Groups fixes into waves with a topological sort, upstream first | Must | FDE2 |
| F15 | Impact | Impact report | Produces the report as JSON for the UI and markdown for the PR | Must | FDE2 |
| F16 | Impact | Grep comparison | Runs grep for the old name and shows which affected nodes it missed | Should | FDE1 |
| F17 | Agents | SystemDNA MCP server | Gives Bob the tools `get_impact`, `plan_change`, `start_wave`, `get_status` and `verify` | Must | FDE3 |
| F18 | Agents | Custom Bob modes | Cartographer, Change Planner, Fixer and Inspector modes | Must | FDE3 |
| F19 | Agents | propagate-rename Skill | Fix recipes for each file type: SQL, PySpark, ORM, Pydantic, TS, YAML, tests, docs | Must | FDE3 |
| F20 | Agents | Orchestrator | Issues permits, runs waves and starts `bob -p` workers in parallel with a concurrency limit | Must | FDE2 |
| F21 | Agents | Permit hook | A `PreToolUse` hook blocks any edit outside the agent's permit | Must | FDE3 |
| F22 | Agents | Per-node verify | Runs sqlglot parse, ruff, tsc and the related tests after each fix | Must | FDE2 |
| F23 | Agents | Retry on failure | Retries a failed fix once, with the error message | Should | FDE2 |
| F24 | Agents | Graph re-scan and diff | Re-scans the repo after the change and counts dangling references | Must | FDE1 |
| F25 | Agents | Inspector agent | Reviews the full diff against the impact report | Should | FDE3 |
| F26 | Agents | PR and change report | Creates a branch and PR with the impact report, test results and audit summary | Must | FDE2 |
| F27 | Governance | Human approval gate | Database and PII buildings wait for a person to approve | Should | FDE3 |
| F28 | Governance | Quarantine | After 2 blocked actions, the agent stops and its changes roll back | Stretch | FDE3 |
| F29 | Observability | Event hooks | `SessionStart`, `PostToolUse` and `Stop` hooks send events to the server | Must | FDE3 |
| F30 | Observability | Event server | FastAPI server with a WebSocket feed; stores events in DynamoDB (SQLite locally) | Must | CP2 |
| F31 | Governance | Audit log | Records agent, time, file, permit and result for every action | Must | FDE3 |
| F32 | Observability | Trace timeline | Shows change, waves, agents and tool calls as a tree with times | Must | FDE4 |
| F33 | Observability | Metrics panel | Time, Bobcoins, agents, retries, and serial time against wave time | Should | FDE4 |
| F34 | Governance | Governance panel | Blocked actions, approvals and PII nodes touched | Should | FDE4 |
| F35 | Governance | Budget limits | `--max-cost` per agent plus a total cost meter for the change | Must | FDE3 |
| F36 | Governance | PII spread check | Follows PII tags along lineage and flags any new place personal data reaches | Should | FDE1 |
| F37 | Visual | City map | Layered districts, buildings and roads, using a Cytoscape preset layout | Must | FDE4 |
| F38 | Visual | Semantic zoom | Zoom from layers to files to fields | Should | FDE4 |
| F39 | Visual | Node detail panel | Shows depends-on, used-by, evidence, owner and PII for a node | Must | FDE4 |
| F40 | Visual | Ripple animation | The impact spreads wave by wave in red, amber and grey | Must | FDE4 |
| F41 | Visual | Live agents and building states | Workers appear on the building they edit; buildings change state | Must | FDE4 |
| F42 | Visual | Graph diff view | Before and after, with removed and added links | Should | FDE4 |
| F43 | Visual | Replay mode | Plays back a recorded run from S3, clearly labelled as a replay | Must | FDE4 |
| F44 | Visual | Isometric city | PixiJS isometric version of the map | Stretch | FDE4 |
| F45 | Delivery | ShopFlow sample repo | 7-layer sample system with 3 traps and tests | Must | FDE2 |
| F46 | Delivery | Answer key and baseline | Hand-made list of all affected nodes, plus a timed manual search | Must | FDE2 |
| F47 | Delivery | Bob session export | All task histories and usage screenshots in `bob_sessions/` (everyone exports; CP1 checks) | Must | CP1 |
| F48 | Delivery | README and diagram | Problem, architecture, Bob usage, metrics and one-command run | Must | CP1 |
| F49 | Delivery | 3-minute video | The demo story from section 15 | Must | FDE4 |
| F50 | Stretch | CI guard | A GitHub Action that comments the impact on every PR | Stretch | CP1 |
| F51 | Stretch | More change types | Type change and delete field, end to end | Stretch | FDE1 |
| F52 | Stretch | Bedrock summary | Amazon Bedrock writes a plain-English impact summary for business readers | Stretch | CP2 |
| F53 | Platform | Infrastructure as code | AWS CDK or Terraform for VPC, subnets, load balancer, EC2, S3, CloudFront, DynamoDB and IAM | Must | CP1 |
| F54 | Platform | Dashboard hosting | Static site on S3 behind CloudFront, HTTPS only | Must | CP1 |
| F55 | Platform | Load balancer | ALB with an ACM certificate; routes `/api`, `/ws`, `/mcp` and `/events`; WebSocket support | Must | CP1 |
| F56 | Platform | CI/CD pipeline | GitHub Actions runs tests, builds images to ECR and deploys to the EC2 host | Should | CP1 |
| F57 | Platform | Cost guard and teardown | AWS Budgets alert and a one-command teardown script | Should | CP1 |
| F58 | Platform | EC2 app host | Docker Compose, Bob Shell installed and signed in, ShopFlow checked out, EBS volume | Must | CP2 |
| F59 | Platform | Event and audit tables | DynamoDB tables for events and the audit log | Must | CP2 |
| F60 | Platform | Artifact bucket | S3 for graph versions, replay recordings and reports | Must | CP2 |
| F61 | Platform | Secrets and access | Secrets Manager, a least-privilege IAM role, and a secret scan in CI | Must | CP2 |
| F62 | Platform | Logs and alarms | CloudWatch log groups for every container, plus error alarms | Should | CP2 |
| F63 | Platform | Remote MCP endpoint | MCP server reachable over HTTPS for Bob IDE, protected by a demo token | Should | CP2 |

## 6. System architecture

SystemDNA runs in one AWS account and one region. One EC2 host runs the whole engine in Docker Compose. Managed AWS services handle the website, storage, secrets and logs.

&#91;embedded content: SystemDNA on AWS · one EC2 app host, managed storage around it\]

The developer starts a change in Bob IDE on their laptop. Bob IDE reaches the MCP server through the load balancer over HTTPS. The orchestrator on the EC2 host starts Bob Shell workers on the same host, wave by wave. Every worker tool call passes through the Bob hooks, which check the permit and post an event to the event server. Events and the audit log go to DynamoDB. The graph, replays and reports go to S3. The dashboard is a static site on CloudFront and S3. It reads the API and a live WebSocket feed through the load balancer. GitHub Actions builds container images into ECR and deploys them to the EC2 host.

**Why one EC2 host and not serverless.** Bob Shell workers need a real file system with the repo checked out, the Bob CLI installed and signed in, and long-running processes. Lambda and Fargate make that harder. One EC2 host is the simplest setup that works in 28 hours. The managed services around it keep data safe if the host restarts.

**Components**

| # | Component | What it does | AWS service / built with |
| --- | --- | --- | --- |
| 1 | Bob IDE | Where the developer asks for a change. Holds the 4 custom modes, the Skill and the hook config | IBM Bob IDE 2.0.2+ on each laptop |
| 2 | Load balancer | HTTPS entry for the API, the WebSocket feed, the MCP endpoint and hook events | Application Load Balancer + ACM certificate |
| 3 | Dashboard site | The Agent City web app (static files) | S3 + CloudFront |
| 4 | EC2 app host | Runs all engine containers with Docker Compose | EC2 (t3.xlarge or similar), EBS volume, IAM role |
| 5 | API + event server | REST API, WebSocket feed, receives hook events | FastAPI container |
| 6 | MCP server | Gives Bob the SystemDNA tools over HTTPS | FastMCP container |
| 7 | Orchestrator | Issues permits, starts workers per wave, limits concurrency and budget | Python container |
| 8 | Graph + impact engine | Scanner, linker, graph store, impact engine, verifier | Python container (NetworkX, sqlglot) |
| 9 | Bob workers + hooks | Fix one node each, in parallel; hooks enforce permits and send events | Bob Shell (`bob -p`) on the EC2 host |
| 10 | Event and audit store | Stores every event and the audit log | DynamoDB (on-demand). SQLite for local development |
| 11 | Artifact store | `graph.json` versions, replay recordings, impact reports, ShopFlow snapshots | S3 bucket |
| 12 | Secrets | Bob credentials, GitHub token | AWS Secrets Manager |
| 13 | Logs and alarms | Container logs, error alarms, cost alarm | CloudWatch + AWS Budgets |
| 14 | Build and deploy | Builds images, runs tests and secret scan, deploys to EC2 | GitHub Actions + ECR |
| 15 | ShopFlow repo | The sample system we change in the demo | Git repo, checked out on the EC2 host |

**Main data flow for one change**

1. Scan: the graph engine reads ShopFlow on the EC2 host and writes `graph.json` to S3.
2. Enrich: Cartographer subagents add links parsers missed. Bob reads the data dictionary PDF for owners and PII.
3. Request: the developer asks Bob IDE to rename a field.
4. Analyse: Bob calls the MCP server through the load balancer. The impact engine returns affected nodes, severity, risk and waves.
5. Approve: the developer approves the plan. Database and PII nodes need extra approval.
6. Fix: the orchestrator starts one Bob Shell worker per node on the EC2 host, wave by wave. Each worker has a permit.
7. Guard: hooks check every edit against the permit and post events. Events land in DynamoDB and stream to the dashboard.
8. Verify: checks run per node. After the last wave, the repo is re-scanned, the graph diff is saved to S3, and dangling references are counted.
9. Ship: the Inspector reviews the diff. The orchestrator opens a PR on GitHub with the report.

**Network and security**

- VPC with 2 public subnets for the load balancer. The EC2 host sits in a private subnet and only accepts traffic from the load balancer.
- The EC2 host has an IAM role limited to one S3 bucket, one DynamoDB table, its secrets and CloudWatch logs. No access keys on the host.
- Secrets come from Secrets Manager at start-up. Nothing secret is stored in the repo or in container images.
- The dashboard and API use HTTPS only. A shared demo token protects write endpoints (`POST /changes`, approve, run).
- An AWS Budgets alert fires at a set spend. A teardown script removes everything after judging.

## 7. Knowledge graph data model

The graph has 7 layers, 19 node types and 13 edge types. Parsers build most of it for free. Bob fills the gaps and adds business context.

**Node types**

| Layer | Node types | Example |
| --- | --- | --- |
| Database | `Table`, `Column` | `orders`, `orders.cust_id` |
| Data pipelines | `SQLModel`, `SparkJob`, `Column` (derived) | `stg_orders`, `churn_job`, `stg_orders.customer_key` |
| Backend | `Module`, `Class`, `Function`, `ORMModel`, `Schema`, `Field` | `Order.cust_id`, `OrderOut.cust_id` |
| API | `Endpoint` | `GET /api/orders` |
| Frontend | `TSType`, `TSField`, `Component` | `Order.cust_id` (TS), `OrdersTable` |
| Consumers | `Dashboard`, `Test`, `Doc` | `revenue.yaml`, `test_routes.py` |
| Business | `BusinessProcess`, `Owner` | Monthly Revenue Close, Finance team |

**Edge types**

| Edge | Meaning | Example |
| --- | --- | --- |
| `DERIVES_FROM` | A column is built from another column | `stg_orders.customer_key` from `orders.cust_id` |
| `READS` | A job or model reads a column or table | `churn_job` reads `orders.cust_id` |
| `WRITES` | A job writes a table | `export_job` writes `exports.orders_csv` |
| `MAPS_TO` | An ORM field maps to a table column | `Order.cust_id` to `orders.cust_id` |
| `SERIALIZES` | An API schema field comes from an ORM field | `OrderOut.cust_id` from `Order.cust_id` |
| `RETURNS` | An endpoint returns a schema | `GET /api/orders` returns `OrderOut` |
| `CONSUMES` | A frontend component calls an endpoint | `OrdersTable` calls `GET /api/orders` |
| `TYPED_AS` | A TS field matches an API field | TS `Order.cust_id` to `OrderOut.cust_id` |
| `IMPORTS` / `CALLS` | Python module and function links | `routes.py` imports `schemas.py` |
| `TESTS` / `DOCUMENTS` | A test or doc covers a node | `test_routes.py` tests `GET /api/orders` |
| `SUPPORTS` | A dashboard supports a business process | `revenue.yaml` supports Monthly Revenue Close |

**Attributes**

- Every node: `id`, `type`, `layer`, `name`, `file`, `line`, `owner`, `pii` (true or false), `criticality` (low, medium, high), `tested` (true or false).
- Every edge: `source` (`parser` or `bob`), `confidence` (high, medium, low), `evidence` (file and line), `rule` (how to fix this edge when the upstream side changes: `rename_ref`, `keep_alias`, `update_type`, `update_doc`).
- Node id format: `layer:type:qualified_name`, for example `db:column:orders.cust_id`.

**How the graph is built: 3 passes**

| Pass | What runs | What it finds | Confidence | Cost |
| --- | --- | --- | --- | --- |
| 1. Parse | Python `ast`, sqlglot, TS regex or tree-sitter, YAML loader | Nodes and in-language edges, about 85% of all edges | High | Free, under 5 seconds |
| 2. Link | Cross-layer rules: ORM to table, schema to ORM, route path to `fetch()` URL, TS field to API field, dashboard source to model column | Edges between languages | High | Free |
| 3. Enrich | Cartographer subagents in parallel, one per layer. One more subagent reads `data_dictionary.pdf` and the ADR | Dynamic SQL, string references, owners, PII flags, business meaning | Medium | A few Bobcoins |

**Rules for pass 3.** Each Cartographer gets its layer's files and a list of unresolved references. It must return JSON edges with evidence (file and line). The scanner rejects any edge without evidence. Bob-found edges show a "found by Bob" badge in the UI.

## 8. Impact engine

The impact engine takes one change and returns every affected node, how badly it is affected, its risk score and the order to fix it in. It must answer in under 1 second.

**Input**

```json
{"node": "db:column:orders.cust_id", "change": "rename", "to": "customer_id"}
```

**Step 1: walk downstream.** Start at the changed node and follow outgoing dependency edges. Each edge's `rule` decides what happens to the next node:

| Situation | Result | Keep walking? |
| --- | --- | --- |
| The node uses the old name directly | Breaking | Yes |
| The node aliases the column (`cust_id AS customer_key`) | Needs update: only the source side of the alias changes | No. Nodes that use `customer_key` are Safe |
| The node is a test or a doc that mentions the name | Update | No |
| The node only passes data through without naming the column | Safe | No |
| Edge confidence is medium (found by Bob) | Same result, plus a "check this" flag | Yes |

The alias rule matters. Renaming at the source does not force renaming `customer_key` everywhere. The engine knows this, so it avoids needless edits. We call this out in the demo.

**Step 2: business impact.** Walk on from affected dashboards along `SUPPORTS` edges. List every affected business process and its owner.

**Step 3: risk score (0 to 100) per node.**

```latex
\text{risk} = 35 \cdot \text{fanout} + 30 \cdot \text{criticality} + 20 \cdot \text{pii} + 15 \cdot \text{untested}
```

Each factor is scaled from 0 to 1. Fan-out is the number of downstream nodes divided by the largest fan-out in the graph. Criticality is 0, 0.5 or 1 for low, medium or high. PII and untested are 0 or 1.

**Step 4: plan waves.** Take the affected nodes that need edits. Sort them with a topological sort, so each node comes after the nodes it depends on. Nodes at the same depth form one wave and can be fixed in parallel.

| Wave | Typical nodes in ShopFlow |
| --- | --- |
| 1 | Database migration, ORM model |
| 2 | SQL transforms, Spark jobs, Pydantic schema |
| 3 | API endpoint, TypeScript type |
| 4 | React component, dashboard, tests, docs |

**Output: the impact report.** JSON for the UI and markdown for the PR. It holds:

- affected nodes grouped by layer, with severity, risk, evidence and confidence
- affected business processes and owners
- the waves and the number of agents needed
- nodes that need human approval (database and PII)
- the grep comparison: which affected nodes a plain text search for the old name would miss

## 9. Change propagation

One approved change becomes a set of small, fenced jobs. One Bob agent fixes one node, inside a permit, wave by wave, and every fix is checked before the next wave starts.

**The 9 steps**

| Step | What happens | Who does it | Bob feature |
| --- | --- | --- | --- |
| 1. Request | Developer types "Rename orders.cust\_id to customer\_id" in the Change Planner mode | Developer in Bob IDE | Custom mode |
| 2. Analyse | Bob calls `get_impact` and `plan_change` on the MCP server and shows the report and waves | Bob + impact engine | Plan mode, MCP |
| 3. Approve | Developer approves the plan. Database and PII nodes need a second approval | Developer | Human gate |
| 4. Permits | The orchestrator writes one permit per node | Orchestrator | Governance |
| 5. Fix | Agents in the current wave run in parallel. Each uses the `propagate-rename` Skill | Bob agents | Agent mode, subagents, Skill, Bob Shell |
| 6. Guard | Every tool call passes the permit hook. Out-of-permit edits are blocked with exit code 2 | Bob hooks | Lifecycle hooks |
| 7. Verify node | Scripted checks run: SQL parse, ruff, tsc and related tests. A failure gets 1 retry with the error | Verifier | Workflow (script steps) |
| 8. Verify system | After the last wave, re-scan the repo and diff the graph. The goal is 0 dangling references | Verifier |  |
| 9. Inspect and ship | The Inspector reviews the whole diff against the report. Then a branch and PR are created | Inspector agent + orchestrator | Subagent |

**A permit** is a small JSON file the orchestrator writes to `.systemdna/permits/<agent_id>.json`:

```json
{
  "agent_id": "fix-stg_orders",
  "change_id": "chg-012",
  "node": "pipe:sqlmodel:stg_orders",
  "allowed_files": ["transforms/stg_orders.sql", "tests/test_transforms.py"],
  "max_cost": 2,
  "max_turns": 12,
  "needs_approval": false
}
```

**How one agent is started**

```bash
SYSTEMDNA_AGENT_ID=fix-stg_orders bob -p "$(cat prompts/fix-stg_orders.md)" --mode agent --max-cost 2 --max-turns 12 --format stream-json
```

The prompt file holds: the change, the node, its evidence lines, the edge rule, the upstream change already made, and the permit. The hook reads `SYSTEMDNA_AGENT_ID` to find the right permit. If environment variables do not reach hooks, the hook matches on the session ID that the orchestrator records at start.

**Concurrency.** The orchestrator runs at most N agents at once. N is set from the hour-0 test (planned: 3 to 5). Waves wait until every node in the wave above is green.

**No clashes.** Permits give each agent different files, so all agents work in the same folder without git worktrees. One agent per file at a time is enforced by a lock in the orchestrator.

**Fallback.** If `bob -p` workers cannot run in parallel, the Change Planner mode spawns Bob IDE subagents, one per node, and the orchestrator only tracks them.

## 10. Agent City: visual design, states and rules

The Agent City draws the knowledge graph as a city and the Bob agents as workers moving through it. Every shape, colour and movement comes from real data: the graph, hook events or test results.

**Layout.** Districts are laid out left to right in the direction data flows:

Database, Pipelines, Backend, API, Frontend, Dashboards, Business.

Tests and docs sit as a row along the bottom. We use a fixed column layout, not a force layout, so the map is tidy and the same every time.

**What each shape means**

| City element | Represents |
| --- | --- |
| District | One layer of the system |
| Building | One asset: table, SQL model, Spark job, module, endpoint, component, dashboard |
| Floors | Columns, fields or functions inside that asset |
| Road | A dependency edge. Moving dots show the direction data flows |
| Building height | Fan-out: how many things depend on it |
| Padlock | Holds personal data (PII) |
| Dim building | Has no tests |
| City hall (far right) | A business process, such as Monthly Revenue Close |
| Worker | One Bob agent |

**Zoom levels**

1. System view: 7 districts, each with a health colour and a count of affected nodes.
2. District view: files as buildings, with height, padlocks and test status.
3. File view: columns, fields and functions as floors, with the edges between them.

**The ripple animation.** The developer clicks a node and picks Rename. A shockwave spreads out wave by wave: red for Breaking, amber for Needs update, grey for Safe. Affected business processes flash last. During the fix, workers appear on buildings. Buildings turn amber while being edited and green when verified. The last frame shows the whole city green and "Dangling references: 0".

**Agent states**

&#91;embedded content: agent states · 10 states, 2 failure paths\]

The main path runs from Queued to Done. Database and PII nodes stop for approval first. An edit outside the permit sends the agent to Blocked, and a second strike sends it to Quarantined. A failed check allows one retry.

| State | Rule to enter | Rule while in it | Look on the map |
| --- | --- | --- | --- |
| Queued | Assigned one affected node | Cannot act | Grey worker at the city gate |
| Permitted | Its wave opened and all upstream nodes are green | May edit only the files on its permit | Worker holding a badge |
| Awaiting approval | Its node is a database or PII node | Paused until a person approves | Worker waiting at a checkpoint |
| Reading | Permitted, and approved if needed | May read anything, write nothing | Blue worker walking to its building |
| Editing | Reading done | Writes only inside the permit, within budget and turn limits | Amber worker, scaffolding on the building |
| Verifying | Agent reports done | No more edits. Checks and tests run | Spinner on the building |
| Retrying | A check failed and a retry is left (max 1) | Gets the error message and edits again | Amber again, with a retry badge |
| Blocked | The hook rejected an action | Must return to its permit | Red flash, stop sign |
| Quarantined | 2 blocked actions, budget exceeded or timeout | Changes rolled back, a person is told | Worker inside a fence |
| Done | Checks passed and the Inspector approved | Permit expires | Green worker leaves the building |

**Building states**

| State | Meaning | Look |
| --- | --- | --- |
| Healthy | Not affected by the change | Normal colour |
| Breaking or Needs update | Inside the blast radius | Red or orange outline |
| Safe | Downstream but needs no edit, for example behind an alias | Faded, with a shield |
| Under construction | Locked by one agent. Only one agent per building | Scaffolding |
| Inspecting | Checks running | Spinner |
| Fixed | Verified | Green glow |
| Needs a human | Failed after retry, or waiting for approval | Yellow sign |

**District rules**

| District | Rule | How it is enforced |
| --- | --- | --- |
| Database | Needs human approval. Must add a new migration file, never edit old ones | Approval gate + hook blocks edits to existing migrations |
| PII buildings | Read allowed. Write needs approval. No new place for personal data to flow | Hook checks permit and PII flag; re-scan flags new PII edges |
| Pipelines | Output column names and types must match the plan | sqlglot parse and lineage re-check |
| API | No breaking change to a public endpoint without a versioning note | Inspector checks the diff |
| Frontend | TypeScript must compile | `tsc` in verify |
| Dashboards | Change only the data source lines, never the maths | Hook allows edits only to `source:` lines |
| Tests | May add or update tests, never delete or skip them | Hook blocks deletes; diff check blocks `skip` |
| Docs | Open to edits | Normal permit |
| Business | Read-only for all agents | Hook blocks all writes |

**City-wide laws**

| Law | Rule | Enforced by |
| --- | --- | --- |
| Permit law | Edit only files on your permit | `PreToolUse` hook, exit code 2 |
| One builder per building | No two agents on one file | Orchestrator lock |
| Traffic lights | A wave starts only when the wave above is all green | Orchestrator |
| Budget law | Bobcoin cap per agent and per change | `--max-cost` + total cost meter |
| Turn and time limits | Max turns and max minutes per agent | `--max-turns` + orchestrator timeout |
| Crowd limit | At most N agents at once | Orchestrator |
| Two-strike law | 2 blocked actions means quarantine and rollback | Hook counter + orchestrator |
| Inspection law | Nothing merges without passing checks and Inspector approval | Workflow |
| Completeness law | Done only when the re-scan shows 0 dangling references | Verifier |
| Record law | Every action is logged | Hooks to SQLite audit log |

**Scope for the hackathon.** Must have: permit law, one builder per building, traffic lights, budget law, the Tests and Database rules, the completeness and record laws, and the states Queued, Editing, Blocked, Verifying and Done. Everything else in this section is Should or Stretch.

## 11. Governance, observability and metrics

Every change is recorded as a trace: change, waves, agents, tool calls and checks. The same data feeds the city map, the governance panel and the metrics panel.

**The four layers, applied to this workflow**

| Layer | What it means in SystemDNA | Features |
| --- | --- | --- |
| Governance | Agents can only do what the plan allows | Permits, approval gates, district rules, city laws, audit log (F21, F27, F28, F31, F35, F36) |
| Monitoring | See every agent live | Live workers, building states, trace timeline (F29, F30, F32, F41) |
| Evaluation | Prove each fix and the whole change are correct | Per-node checks, Inspector, re-scan, grep comparison (F16, F22, F24, F25) |
| Optimization | Fix in the smart order at the lowest cost | Waves, skip Safe nodes, cheap `explore` agents for reading, cost per node (F14, F33) |

**Trace view (example of what the timeline shows)**

```text
Change chg-012  rename orders.cust_id -> customer_id
  Impact analysis                17 nodes, 4 waves, 2 need approval
  Wave 1 (2 agents)              fix-migration, fix-orm
  Wave 2 (5 agents)              fix-stg_orders, fix-churn_job, fix-export_job, ...
    fix-export_job               BLOCKED: tried to edit backend/routes.py
  Wave 3 ... Wave 4 ...
  Graph re-scan                  dangling references before and after
  Inspector                      verdict
```

Times and counts in the real trace come from the run. The lines above only show the shape.

**Audit log fields:** `time`, `change_id`, `agent_id`, `wave`, `event` (tool call, blocked, approved, check passed, check failed, done), `tool`, `file`, `permit_ok`, `result`, `bobcoins`.

**Dashboard panels**

1. City map with live workers and building states.
2. Impact report: nodes by layer and severity, business processes, owners.
3. Trace timeline.
4. Graph diff: removed edges, added edges, dangling reference count.
5. Governance: blocked actions, approvals, PII nodes touched, audit log.
6. Metrics: total time, time per wave, serial estimate against wave time, Bobcoins, agents, retries, tests passed.

**Baseline experiment (proves the impact).** Before seeing the tool, one teammate gets the task "rename `orders.cust_id` and list everything affected". They use grep and an IDE, with a timer. We record time taken and nodes found. Then we run SystemDNA on the same task and compare against the answer key.

| Measure | Manual | SystemDNA |
| --- | --- | --- |
| Time to find impact | measured | measured |
| Affected nodes found (of the answer key) | measured | measured |
| Missed: alias, dynamic SQL, TypeScript | measured | measured |
| Time to apply all changes | estimated by the teammate | measured |
| Dangling references after the change | unknown | measured by re-scan |

We fill this table with real numbers only. It goes into the README, the video and the submission text.

## 12. How IBM Bob 2.0 is used

Bob is inside the product, not only the tool we build with. Bob IDE is the front door, Bob agents build the graph and apply every fix, and Bob hooks enforce the rules.

| Bob 2.0 feature | Where SystemDNA uses it |
| --- | --- |
| Agent mode | Fixer agents edit real files in ShopFlow |
| Plan mode, then hand-off to Agent | Change Planner builds the plan; the fixers carry it out |
| Parallel subagents | Cartographers (one per layer) while building the graph; fixers (one per node) in each wave |
| Document understanding | Bob reads `data_dictionary.pdf` and the ADR for owners, PII and business meaning |
| Custom modes | Cartographer, Change Planner, Fixer, Inspector |
| Skills | `propagate-rename`: fix recipes per file type |
| Lifecycle hooks | `PreToolUse` blocks out-of-permit edits; `SessionStart`, `PostToolUse` and `Stop` stream events |
| MCP | The SystemDNA MCP server gives Bob the graph tools |
| Bob Shell, non-interactive | `bob -p` workers with `--max-cost` and `--max-turns` |
| Workflows | Scripted steps (scan, checks, re-scan) mixed with AI steps (enrich, fix, inspect) |
| Bob as builder | Every build task is exported to `bob_sessions/` |

**The 4 custom modes**

| Mode | Job | Tools allowed |
| --- | --- | --- |
| Cartographer | Find links parsers missed in one layer. Return JSON edges with evidence | Read only |
| Change Planner | Take a change request, call the MCP tools, show the impact and plan, get approval, start waves | Read, MCP |
| Fixer | Fix one node inside its permit using the Skill, then report done | Read, edit (permit-limited), run tests |
| Inspector | Review the full diff against the impact report and list any problems | Read only |

**Judging requirement.** The rules require Bob IDE as a core part of the solution. They also require exported task session reports in a `bob_sessions/` folder. Each teammate exports every relevant task as markdown, plus a screenshot of its usage summary.

**Bobcoin budget.** Each person gets 40 Bobcoins, with no top-ups. Planned use per person:

| Use | Planned Bobcoins |
| --- | --- |
| Building SystemDNA with Bob | 20 |
| Graph enrichment runs (Cartographers) | 4 |
| Test runs of the fix flow | 8 |
| Final demo run | 4 |
| Reserve | 4 |

## 13. Interfaces

Three interfaces connect the parts: MCP tools for Bob, a REST and WebSocket API for the dashboard, and hook events from Bob to the event server.

**MCP tools (SystemDNA MCP server)**

| Tool | Input | Output |
| --- | --- | --- |
| `scan_repo` | `path` | Node and edge counts, path to `graph.json` |
| `get_impact` | `node`, `change`, `to` | Impact report JSON |
| `plan_change` | `change_id` | Waves, permits, approvals needed |
| `start_wave` | `change_id`, `wave` | Agent ids started |
| `get_status` | `change_id` | State of every agent and node |
| `approve` | `change_id`, `node` | Approval recorded |
| `verify` | `change_id` | Check results, dangling reference count, graph diff |

**REST and WebSocket API (FastAPI, behind the load balancer)**

| Method and path | Purpose |
| --- | --- |
| `GET /graph` | Full graph for the map |
| `GET /node/{id}` | One node: depends-on, used-by, evidence, owner |
| `POST /changes` | Create a change request; returns `change_id` and impact report |
| `GET /changes/{id}` | Change status, waves, agents |
| `POST /changes/{id}/approve` | Approve the plan or one node |
| `POST /changes/{id}/run` | Start the waves |
| `GET /changes/{id}/diff` | Graph diff and dangling references |
| `GET /changes/{id}/metrics` | Time, cost, agents, retries, tests |
| `POST /events` | Hooks and orchestrator send events here |
| `WS /ws` | Pushes every new event to the dashboard |
| `GET /replay/{id}` | Recorded events for replay mode |

**Event schema**

```json
{
  "ts": "2026-09-27T10:15:02Z",
  "change_id": "chg-012",
  "agent_id": "fix-stg_orders",
  "session_id": "bob-session-id",
  "wave": 2,
  "event": "tool_call | blocked | approved | check_passed | check_failed | done | quarantined",
  "tool": "write_to_file",
  "file": "transforms/stg_orders.sql",
  "node": "pipe:sqlmodel:stg_orders",
  "permit_ok": true,
  "detail": "short text",
  "bobcoins": 0.2
}
```

**Hook config (`.bob/settings.json`)**

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "python hooks/report.py", "timeout": 5 }] }],
    "PreToolUse":   [{ "matcher": ".*", "hooks": [{ "type": "command", "command": "python hooks/permit_check.py", "timeout": 5 }] }],
    "PostToolUse":  [{ "matcher": ".*", "hooks": [{ "type": "command", "command": "python hooks/report.py", "timeout": 5 }] }],
    "Stop":         [{ "hooks": [{ "type": "command", "command": "python hooks/report.py", "timeout": 5 }] }]
  }
}
```

**What `permit_check.py` does**

1. Reads the hook JSON from standard input: event name, tool name, tool input with file path, session ID.
2. Finds the agent's permit by agent ID or session ID.
3. If the tool writes a file that is not on the permit, or breaks a district rule, it sends a `blocked` event and exits with code 2. Bob then refuses the tool call.
4. Otherwise it sends a `tool_call` event and exits with code 0.
5. If the agent has no permit (a normal developer session), it allows everything and only reports.

Tool names and payload field names must be checked against a real hook payload in the hour-0 test. The article we used lists both `tool` and `tool_name`, and both `path` and `file_path`, so the script accepts either.

## 14. Tech stack and repo layout

We pick tools the team already knows: Python for the engine, React for the UI, and a small set of AWS services around one EC2 host.

**Application stack**

| Part | Choice | Why |
| --- | --- | --- |
| Language (engine) | Python 3.11+ | Fast to write; `ast` is built in |
| SQL lineage | sqlglot | Parses SQL and traces column lineage out of the box |
| TypeScript parsing | Regex first; tree-sitter if time allows | Regex is enough for ShopFlow's interfaces and `fetch()` calls |
| Graph | NetworkX + `graph.json` | No graph database to run |
| MCP server | FastMCP (Python), HTTP transport | Bob IDE reaches it through the load balancer |
| API and events | FastAPI + WebSocket | One service for REST, live feed and hook events |
| Orchestrator | Python `asyncio` + subprocess | Runs `bob -p` workers in parallel on the host |
| Checks | sqlglot, ruff, tsc, pytest, vitest | Standard, fast |
| Frontend | React 18, Vite, TypeScript, Tailwind | Quick to build; builds to static files |
| Map | Cytoscape.js, preset column layout | Handles 500+ nodes; reliable styling and animation |
| Stretch map | PixiJS isometric | Only after the core works |
| Containers | Docker + Docker Compose | Same setup on laptops and on EC2 |

**AWS stack**

| Need | AWS service | Notes |
| --- | --- | --- |
| Compute for engine and Bob workers | EC2 (t3.xlarge or similar, Amazon Linux 2023 or Ubuntu) | Private subnet, EBS volume for the workspace |
| HTTPS entry, WebSocket | Application Load Balancer + ACM | Path rules for `/api`, `/ws`, `/mcp`, `/events` |
| Dashboard hosting | S3 + CloudFront | Static site, HTTPS |
| Events and audit log | DynamoDB, on-demand | Key: `change_id`; sort key: `ts` |
| Graph, replays, reports | S3 | Versioning on |
| Secrets | Secrets Manager | Bob credentials, GitHub token, demo token |
| Access control | IAM role for the EC2 host | Least privilege; no access keys on disk |
| Logs and alarms | CloudWatch | One log group per container |
| Cost control | AWS Budgets | Alert at a set spend |
| Images | ECR | Built by GitHub Actions |
| Infrastructure as code | AWS CDK (TypeScript or Python) or Terraform | CP1 picks one at hour 0 |
| Optional AI summary | Amazon Bedrock | Stretch feature F52 |

**Product repo layout**

```text
systemdna/
  core/
    scanner/            python_scan.py, sql_scan.py, ts_scan.py, config_scan.py
    linker.py           cross-layer rules
    graph.py            NetworkX build, load, save (local or S3)
    impact.py           traversal, risk, waves, report
    verify.py           checks, re-scan, graph diff
  mcp_server.py         SystemDNA MCP tools
  orchestrator.py       permits, waves, bob -p workers
  server/
    app.py              FastAPI + WebSocket
    store.py            DynamoDB (cloud) or SQLite (local)
  hooks/
    permit_check.py     PreToolUse: permit and district rules
    report.py           SessionStart, PostToolUse, Stop
  prompts/              fixer prompt templates
  web/                  React + Vite + Cytoscape dashboard
  infra/                CDK or Terraform stacks
  deploy/
    docker-compose.yml  api, mcp, orchestrator, engine
    bootstrap.sh        installs Docker and Bob Shell on EC2
    teardown.sh         removes all AWS resources
  .github/workflows/    test, build, deploy, secret scan
  .bob/
    settings.json       hook config
    modes/              Cartographer, Change Planner, Fixer, Inspector
    skills/propagate-rename/
  samples/shopflow/     the sample system (section 15)
  answer_key.json       expected impact for the hero change
  bob_sessions/         exported Bob task histories and screenshots
  README.md
```

The exact file format for custom modes and Skills must follow the Bob docs. The folder names above are our own convention.

**Run commands (target)**

```bash
make local     # run everything on a laptop with SQLite
make infra     # create or update the AWS stack
make deploy    # build images, push to ECR, deploy to EC2, upload the dashboard to S3
make demo      # scan ShopFlow and open the dashboard
make teardown  # remove all AWS resources
```

## 15. Sample repo ShopFlow and demo script

ShopFlow is a small online-shop system we build ourselves. It crosses all 7 layers and hides 3 traps that grep cannot see. The hero change is renaming `orders.cust_id` to `customer_id`, which should reach about 15 to 20 nodes.

**ShopFlow layout**

```text
shopflow/
  db/schema.sql                 orders(id, cust_id, amount, created_at), customers(...)
  db/migrations/                001_init.sql
  transforms/
    stg_orders.sql              SELECT cust_id AS customer_key ...   (alias trap)
    fct_revenue.sql             uses customer_key
    dim_customer.sql
  pipelines/
    churn_job.py                PySpark: spark.table("orders").select("cust_id")
    export_job.py               f"SELECT {col} FROM orders"          (dynamic SQL trap)
  backend/
    models.py                   SQLAlchemy Order.cust_id
    schemas.py                  Pydantic OrderOut.cust_id
    routes.py                   GET /api/orders, GET /api/customers/{id}/orders
  frontend/src/
    types.ts                    interface Order { cust_id: string }   (cross-language trap)
    OrdersTable.tsx             fetch("/api/orders") ... row.cust_id
  dashboards/revenue.yaml       source: fct_revenue.customer_key
  tests/                        test_routes.py, test_transforms.py, OrdersTable.test.tsx
  docs/
    data_dictionary.pdf         owners, PII flags, business meaning
    adr-003-customer-model.md
  processes.yaml                Monthly Revenue Close (Finance) uses revenue dashboard
```

**The 3 traps**

| Trap | Where | Why grep misses it | Who finds it |
| --- | --- | --- | --- |
| Alias chain | `stg_orders.sql` renames `cust_id` to `customer_key` | Downstream files never mention `cust_id` | sqlglot lineage |
| Dynamic SQL | `export_job.py` builds SQL from a string at runtime | The column name is in a variable | Cartographer subagent (medium confidence) |
| Cross-language | Python API field to TS type to React | No single-language tool links them | Cross-layer linker |

**Answer key.** Before building the engine, teammate D writes `answer_key.json`: every node the hero change affects, with its severity. The impact engine is tested against it.

**Demo script (3 minutes)**

| Time | On screen | What we say |
| --- | --- | --- |
| 0:00 to 0:20 | A broken dashboard and a chat message | "Someone renamed one column. The revenue report broke, and it took two days to find out why." |
| 0:20 to 0:45 | Scan ShopFlow. The city appears. Zoom from districts to files to fields | "SystemDNA maps every component across 7 layers into one knowledge graph." |
| 0:45 to 1:05 | "Found by Bob" badges; owners and PII from the PDF | "Parsers find the certain links. Bob agents find the hidden ones and read our docs." |
| 1:05 to 1:30 | Bob IDE: "Rename cust\_id". Ripple spreads. Business process flashes. Grep side by side | "This many components, 7 layers, one Finance process. Grep found only part of it." |
| 1:30 to 2:15 | Waves of workers. One agent blocked. Database approval click. Buildings turn green | "Parallel Bob agents fix everything in order. Each one can only touch its own files." |
| 2:15 to 2:40 | Graph diff, "Dangling references: 0", tests green, the PR | "The re-scan proves the change is complete." |
| 2:40 to 3:00 | The metrics table with real numbers | "Hours of risky guesswork down to minutes, verified. That is SystemDNA." |

**Demo safety.** We record one full clean run. If the live run fails, we switch to replay mode, which is clearly labelled "Replay of run chg-012".

## 16. Timeline and team plan

We have about 28 working hours before submission on Sep 27, 2026. Features freeze at hour 20. We submit 1 hour before the deadline.

**Team (6 people).** Two Cloud and Platform engineers own AWS. Four Forward Deployed Engineers (FDEs) own the product. The detailed plan, with hour-by-hour tasks, hand-off contracts and "done when" checks for each person, is in the separate file `TEAM_PLAN.md`.

| Person | Team | Role | Owns features |
| --- | --- | --- | --- |
| CP1 | Cloud and Platform | Infrastructure and delivery: IaC, load balancer, CloudFront site, CI/CD, cost guard, README | F47, F48, F50, F53 to F57 |
| CP2 | Cloud and Platform | Runtime, data and security: EC2 host with Bob Shell, event server, DynamoDB, S3, secrets, logs, remote MCP | F30, F52, F58 to F63 |
| FDE1 | FDE | Graph engine: scanners, linker, graph store, re-scan and diff, grep comparison, PII check | F01 to F06, F16, F24, F36, F51 |
| FDE2 | FDE | Impact, orchestration and sample repo: ShopFlow, answer key, impact engine, orchestrator, verify, PR | F10 to F15, F20, F22, F23, F26, F45, F46 |
| FDE3 | FDE | Bob agents and governance: modes, Skill, MCP server, hooks, Cartographers, approvals, audit | F07, F08, F17 to F19, F21, F25, F27 to F29, F31, F35 |
| FDE4 | FDE | Frontend and demo: city map, ripple, live agents, panels, replay, video | F09, F32 to F34, F37 to F44, F49 |

**Hour-by-hour plan** (hour 0 = start of build)

| Hours | CP1 | CP2 | FDE1 | FDE2 | FDE3 | FDE4 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 to 3 | Budget alert, IaC set-up | Risk test with FDE3; event contract | Graph contract, sample graph, Python and SQL scanners | ShopFlow, answer key, baseline | Risk test with CP2; hook payload | UI set-up; districts from sample graph |
| 3 to 8 | VPC, load balancer, S3 + CloudFront | Event server, DynamoDB, S3 bucket | TS and config scanners, linker, real graph | Impact engine | Permit and report hooks | Buildings, roads, detail panel |
| 8 to 14 | Path rules, WebSocket, CI/CD | EC2 host, Docker Compose, IAM, secrets | Check against answer key; merge Bob edges | Orchestrator | Modes, Skill, prompts | Ripple, impact panel |
| 14 to 20 | Help FDE4 with frontend | Remote MCP, logs, full run on AWS | Re-scan, diff, PII, grep | Verify, retry, PR | MCP server, Cartographers, approvals, budget | Live agents, trace, diff view |
| 20 to 24 | README | Replays in S3; WebSocket load test | Bug fixes | End-to-end tuning | Demo "blocked" moment | Metrics, governance, replay |
| 24 to 28 | Submission package; secret scan | Keep demo environment stable | Demo help | Record clean run; metrics | Bob session export; README Bob part | Video |

**Checkpoints**

| Hour | Check | If it fails |
| --- | --- | --- |
| 3 | Hooks fire from `bob -p` on EC2 and 3 or more workers run at once | Use Bob IDE subagents for fixing; drive the map from orchestrator events |
| 6 | Dashboard reachable on a public HTTPS URL | Demo the UI from a laptop; keep AWS for the backend |
| 8 | `graph.json` covers all 7 layers | Drop tree-sitter; use regex; cut Cartographers to one layer |
| 14 | One rename works end to end, even without visuals | Cut every Should and Stretch feature now |
| 20 | Full demo flow runs twice in a row on AWS | Freeze and polish; record the replay |
| 27 | Submission uploaded | Submit what works; the replay covers the demo |

**Working rules**

- Everyone exports each Bob task to `bob_sessions/` when it ends, not at the end of the event.
- Nobody commits credentials. Keys live in a local `.env` that is in `.gitignore`.
- Stand-up every 4 hours: done, next, blocked.

## 17. Risks, open questions and future roadmap

The biggest risk is whether Bob hooks and parallel `bob -p` workers behave as the docs describe. We test that in the first 3 hours and have a fallback for every risk.

**Risks**

| Risk | Impact | Fallback |
| --- | --- | --- |
| Hooks do not fire from `bob -p`, or payload fields differ | No live map, no permits | Log real payloads at hour 0 and adapt; else drive events from the orchestrator and use Bob IDE subagents |
| Bob Shell cannot sign in without a person on EC2 | No workers in the cloud | Run workers on a teammate's laptop pointed at the AWS event server; keep everything else on AWS |
| Bob limits parallel sessions | Waves run slower | Run 3 at a time; waves still show parallel work |
| Bobcoins run out | Cannot re-run the demo | Budget per person (section 12); cheap read-only agents; `--max-cost`; record the clean run early |
| An agent makes a wrong fix | Tests fail | Verify catches it, 1 retry with the error; show the retry in the trace |
| WebSocket drops through the load balancer | Live map freezes | Raise the load balancer idle timeout; client reconnects and re-reads events from DynamoDB |
| AWS set-up takes longer than planned | Nothing public by hour 6 | Demo from a laptop with SQLite; CP1 and CP2 keep working on AWS in parallel |
| AWS costs run high | Surprise bill | Budgets alert; small instance; teardown script after judging |
| The live demo fails during judging | Weak submission | Labelled replay of the recorded run, loaded from S3 or a local copy |
| TypeScript parsing is slow to build | Missing frontend layer | Regex for interfaces and `fetch()` only |
| The map looks messy | Poor first impression | Preset column layout; hide Safe nodes by default |
| Credentials leak into the repo | IBM disables Bob accounts; AWS keys abused | Secrets Manager; `.env` in `.gitignore`; secret scan in CI before every merge |

**Open questions**

- [ ] Does the Bob 2.0 hackathon use the same 40 Bobcoins per person as the first Bob hackathon?
- [ ] What are the exact judging criteria and weights for this event? Check the lablab page at kick-off.
- [ ] What is the exact file format for custom modes and Skills in Bob 2.0?
- [ ] Do environment variables reach hook scripts, or must we match agents by session ID?
- [ ] Which AWS account and region do we use, and who holds admin access for CP1 and CP2?

**Future roadmap (after the hackathon)**

| Phase | What we add |
| --- | --- |
| 1 | Any public or private GitHub repo; more languages (Java, Go, dbt) |
| 2 | CI guard on every PR; more change types (type change, delete, split column) |
| 3 | Govern external agents: paste an A2A agent-card link and the agent enters the city under the same laws |
| 4 | Connect to data catalogs and runtime lineage (OpenLineage) for live data flows |
| 5 | Team features: owners get notified, approvals in chat, change history over time |

**Sources**

- [IBM Bob 2.0 Hackathon (lablab.ai)](https://lablab.ai/ai-hackathons/ibm-bob-2-hackathon)
- [IBM Bob Hackathon results, first event](https://lablab.ai/ai-hackathons/ibm-bob-hackathon/live)
- [IBM Bob Hackathon Guide PDF (May 2026)](https://watsonx-hackathons-2026.s3.us.cloud-object-storage.appdomain.cloud/Lablab-IBM-Bob-hackathon-guide-May-2026.pdf)
- [Bob subagents docs](https://bob.ibm.com/docs/ide/features/subagents)
- [Bob Shell non-interactive mode](https://bob.ibm.com/docs/shell/getting-started/start-bobshell-non-interactive)
- [IBM Bob lifecycle hooks](https://www.the-main-thread.com/p/ibm-bob-lifecycle-hooks-agentic-development)
- [Workflows and sub-agents in IBM Bob v2](https://heidloff.net/article/workflows-sub-agents-ibm-bob/)
- [InfoWorld: IBM Bob 2.0 features](https://www.infoworld.com/article/4195291/ibm-bob-expands-beyond-code-generation-to-orchestrate-the-entire-sdlc.html)
