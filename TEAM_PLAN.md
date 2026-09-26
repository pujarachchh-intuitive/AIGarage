# SystemDNA: team plan (6 people)

This file splits the SystemDNA hackathon build across our team of 6:

- **2 Cloud and Platform engineers** (CP1, CP2). They own everything on AWS.
- **4 Forward Deployed Engineers** (FDE1 to FDE4). They own the product: the graph, the impact engine, the Bob agents and the dashboard.

It goes with the PRD. Feature IDs (F01 to F63) match the PRD feature list.

- **Event:** IBM Bob 2.0 Hackathon (lablab.ai)
- **Submission due:** 27 September 2026
- **Build time left:** about 28 hours
- **Hour 0:** the moment we start building
- **Feature freeze:** hour 20
- **Submit:** hour 27, one hour before the deadline

---

## 1. Roles at a glance

| Person | Team | Role | In one line | Features owned |
|---|---|---|---|---|
| **CP1** | Cloud and Platform | Infrastructure and delivery | Builds the AWS stack, the website hosting, the load balancer and the deploy pipeline | F47, F48, F50, F53, F54, F55, F56, F57 |
| **CP2** | Cloud and Platform | Runtime, data and security | Builds the EC2 host with Bob Shell, the event server, DynamoDB, S3, secrets and logs | F30, F52, F58, F59, F60, F61, F62, F63 |
| **FDE1** | FDE | Graph engine | Turns the repo into a knowledge graph and proves the change is complete | F01, F02, F03, F04, F05, F06, F16, F24, F36, F51 |
| **FDE2** | FDE | Impact, orchestration and sample repo | Builds ShopFlow, works out the ripple, and runs the agent waves | F10, F11, F12, F13, F14, F15, F20, F22, F23, F26, F45, F46 |
| **FDE3** | FDE | Bob agents and governance | Sets up Bob (modes, Skill, MCP, hooks) and enforces the city rules | F07, F08, F17, F18, F19, F21, F25, F27, F28, F29, F31, F35 |
| **FDE4** | FDE | Frontend and demo | Builds the Agent City dashboard and records the video | F09, F32, F33, F34, F37, F38, F39, F40, F41, F42, F43, F44, F49 |

**Load balance note:** FDE4 has the most features. CP1 moves to help FDE4 with frontend polish from hour 14, once the AWS stack is stable.

---

## 2. Hand-off contracts (agree these in the first hour)

People work in parallel, so they must agree on the shape of the data they pass to each other. Each contract has one owner. The owner writes it down in the repo by the time shown, and nobody changes it without telling the people who use it.

| Contract | Owner | Used by | Due | Where it lives |
|---|---|---|---|---|
| `graph.json` format: node and edge fields (PRD section 7) | FDE1 | FDE2, FDE4, FDE3 | Hour 1 | `docs/contracts/graph.md` + a sample file |
| Impact report format (PRD section 8) | FDE2 | FDE3, FDE4 | Hour 3 | `docs/contracts/impact.md` + a sample file |
| Event format (PRD section 13) | CP2 | FDE3, FDE4, FDE2 | Hour 1 | `docs/contracts/events.md` |
| Permit file format (PRD section 9) | FDE2 | FDE3 | Hour 3 | `docs/contracts/permit.md` |
| REST and WebSocket API paths (PRD section 13) | CP2 | FDE4, FDE3 | Hour 2 | `docs/contracts/api.md` |
| Public URLs: dashboard, API, MCP | CP1 | Everyone | Hour 6 | README, top section |

Until the real data exists, everyone builds against the **sample files**. For example, FDE4 builds the map from `sample_graph.json` before FDE1's scanner is ready.

---

## 3. Person-by-person plan

### CP1: Cloud and Platform, infrastructure and delivery

**Mission:** anyone can open a public HTTPS link and see the working dashboard, and new code reaches AWS with one command.

**Owns:** F53 infrastructure as code, F54 dashboard hosting, F55 load balancer, F56 CI/CD, F57 cost guard and teardown, F47 Bob session export check, F48 README and architecture diagram, F50 CI guard (stretch).

| Hours | Tasks |
|---|---|
| 0 to 1 | Pick AWS CDK or Terraform. Pick the region. Create the AWS Budgets alert first. Agree the public URLs with CP2. |
| 1 to 6 | Write the infrastructure code: VPC (2 public subnets, 1 private), load balancer with ACM certificate, S3 + CloudFront for the dashboard, security groups. Deploy an empty "hello" page and a health endpoint. |
| 6 to 10 | Load balancer path rules: `/api`, `/ws` (WebSocket), `/mcp`, `/events`. Test WebSocket through the load balancer. Share the final URLs. |
| 10 to 14 | GitHub Actions: run tests, build images, push to ECR, deploy to EC2, upload the dashboard to S3, clear the CloudFront cache. Write `make infra`, `make deploy`, `make teardown`. |
| 14 to 20 | Help FDE4 with frontend polish (panels, styling). Keep deploys green. |
| 20 to 24 | Write the README: problem, architecture diagram (AWS version), Bob feature table, metrics table, how to run. |
| 24 to 28 | Check that `bob_sessions/` holds every teammate's exports and screenshots. Scan the repo for secrets. Package the submission. |

**Done when:**
- the dashboard loads at a public HTTPS URL
- `make deploy` updates it in under 10 minutes
- a budget alert exists
- `make teardown` removes everything

**Depends on:** CP2 for the EC2 host and container list.
**Unblocks:** FDE4 (public site), FDE3 (public MCP URL), everyone (deploys).

---

### CP2: Cloud and Platform, runtime, data and security

**Mission:** the engine and the Bob workers run reliably on AWS, and every event is stored safely and streamed live.

**Owns:** F58 EC2 app host, F30 event server, F59 DynamoDB tables, F60 S3 artifact bucket, F61 secrets and access, F62 logs and alarms, F63 remote MCP endpoint, F52 Bedrock summary (stretch).

| Hours | Tasks |
|---|---|
| 0 to 3 | **Joint risk test with FDE3.** Install Bob Shell on a test EC2 host. Sign in. Check that `bob -p` runs without a person present, that 3 to 5 workers can run at once, and that hooks fire and receive the payload. Save a real hook payload to `docs/contracts/hook_payload_sample.json`. Write the event contract. |
| 3 to 8 | Event server: FastAPI with `POST /events`, `WS /ws`, and a storage layer that writes to DynamoDB in the cloud and SQLite on laptops. Create the DynamoDB tables and the S3 bucket (versioning on). |
| 8 to 12 | EC2 app host: `bootstrap.sh` installs Docker, Docker Compose and Bob Shell. `docker-compose.yml` runs api, mcp, orchestrator and engine. The IAM role gives access to one bucket, one table, its secrets and CloudWatch only. Secrets load from Secrets Manager at start-up. |
| 12 to 16 | Remote MCP endpoint over HTTPS, protected by a demo token. Test it from Bob IDE on a laptop. CloudWatch log groups for each container, plus error alarms. |
| 16 to 20 | Run the full flow on AWS with FDE2 and FDE3. Fix slow or failing parts (timeouts, disk space, worker limits). |
| 20 to 24 | Make replay recordings save to S3 and load from S3. Load-test the WebSocket with a recorded run. Stretch: Bedrock summary (F52). |
| 24 to 28 | Keep the demo environment stable. Nobody deploys after hour 26 without CP2's OK. |

**Done when:**
- a full change runs on the EC2 host with parallel Bob workers
- events appear in DynamoDB and on the dashboard within 1 second
- no secret is in the repo or in an image

**Depends on:** CP1 for the network and load balancer; FDE3 for the hook scripts.
**Unblocks:** FDE2 (a place to run workers), FDE4 (live events), FDE3 (MCP over HTTPS).

---

### FDE1: Graph engine

**Mission:** turn ShopFlow into a correct cross-layer knowledge graph, and prove after the change that nothing still points at the old name.

**Owns:** F01 to F06 (scanners, linker, graph store), F16 grep comparison, F24 re-scan and graph diff, F36 PII spread check, F51 more change types (stretch).

| Hours | Tasks |
|---|---|
| 0 to 1 | Write the `graph.json` contract and a hand-made `sample_graph.json` so FDE2 and FDE4 can start. |
| 1 to 4 | Python scanner with `ast`: modules, classes, functions, imports, FastAPI routes, Pydantic, SQLAlchemy, PySpark calls. SQL scanner with sqlglot, including column lineage and aliases. |
| 4 to 8 | TypeScript scanner (regex: interfaces, `fetch()` URLs, field use). Config scanner (dashboard YAML, `processes.yaml`). Cross-layer linker. Real `graph.json`, saved locally and to S3. |
| 8 to 12 | Check the graph against FDE2's answer key. Fix missing links. Merge edges from FDE3's Cartographers (medium confidence, with evidence). |
| 12 to 16 | Re-scan and graph diff: count dangling references, list removed and added edges. PII spread check. |
| 16 to 20 | Grep comparison: run grep for the old name and list what it missed. Speed check: scan under 5 seconds. |
| 20 to 24 | Bug fixes only. Stretch: type change and delete (F51). |
| 24 to 28 | Help record the demo. Export Bob sessions. |

**Done when:**
- the graph covers all 7 layers
- it finds every node in the answer key except the dynamic SQL one (Bob finds that)
- the re-scan reports 0 dangling references after a correct change

**Depends on:** FDE2 for ShopFlow (hour 3).
**Unblocks:** FDE2 (impact engine), FDE4 (real map).

---

### FDE2: Impact, orchestration and sample repo

**Mission:** build the sample system, work out exactly what a change breaks, and run the agent waves that fix it.

**Owns:** F45 ShopFlow, F46 answer key and baseline, F10 change request intake, F11 to F15 (traversal, business impact, risk, waves, report), F20 orchestrator, F22 per-node verify, F23 retry, F26 PR and change report.

| Hours | Tasks |
|---|---|
| 0 to 3 | Build ShopFlow (PRD section 15) with the 3 traps and working tests. Write `answer_key.json`. Get one teammate who has not seen the answer key to run the timed manual baseline. |
| 3 to 8 | Impact engine: traversal with edge rules, severity, business impact, risk score, wave planner, impact report (JSON and markdown). Write the impact and permit contracts. |
| 8 to 14 | Orchestrator: create a change, write permits, start `bob -p` workers per wave with a concurrency limit, wait for each wave to be green, send orchestrator events. |
| 14 to 18 | Per-node verify (sqlglot parse, ruff, tsc, tests), retry once with the error, branch and PR with the change report. |
| 18 to 22 | End-to-end runs on AWS with CP2 and FDE3. Tune prompts and limits so the demo run is under 10 minutes. |
| 22 to 28 | Record the clean demo run with FDE4. Fill the metrics table with real numbers. Export Bob sessions. |

**Done when:**
- renaming `orders.cust_id` produces the right impact report in under 1 second
- the waves fix every node
- all ShopFlow tests pass
- a PR is created

**Depends on:** FDE1 (graph), FDE3 (Fixer mode, Skill, hooks), CP2 (EC2 host).
**Unblocks:** FDE4 (impact data, run events), FDE3 (permits).

---

### FDE3: Bob agents and governance

**Mission:** make Bob the heart of the product, and make sure agents can only do what the plan allows.

**Owns:** F17 MCP server, F18 custom modes, F19 propagate-rename Skill, F07 Cartographer subagents, F08 document understanding, F21 permit hook, F29 event hooks, F31 audit log, F35 budget limits, F25 Inspector, F27 approval gate, F28 quarantine (stretch).

| Hours | Tasks |
|---|---|
| 0 to 3 | **Joint risk test with CP2** (see CP2). Confirm the hook payload fields, and whether environment variables reach hook scripts. Confirm the file format for custom modes and Skills in the Bob docs. |
| 3 to 8 | Permit hook (`permit_check.py`): read the payload, find the permit, block out-of-permit edits with exit code 2, post events. Report hook for `SessionStart`, `PostToolUse` and `Stop`. |
| 8 to 12 | Custom modes: Cartographer, Change Planner, Fixer, Inspector. The `propagate-rename` Skill with fix recipes per file type. Fixer prompt template (with FDE2). |
| 12 to 16 | MCP server with `scan_repo`, `get_impact`, `plan_change`, `start_wave`, `get_status`, `approve`, `verify`. Cartographer subagents (one per layer). Document understanding on `data_dictionary.pdf`. |
| 16 to 20 | Approval gate for database and PII nodes. Budget limits (`--max-cost`, total meter). Audit log fields. Inspector review. District rules for the Tests and Database districts. |
| 20 to 24 | Stage the "blocked" moment for the demo: a real agent tries to edit outside its permit and is stopped. Stretch: quarantine. |
| 24 to 28 | Export Bob sessions for the whole team's Bob work. Write the "How Bob is used" part of the README with CP1. |

**Done when:**
- the developer can start a change from Bob IDE using the Change Planner mode
- a real out-of-permit edit is blocked and logged
- every agent action is in the audit log

**Depends on:** CP2 (EC2, event server), FDE2 (permits, orchestrator).
**Unblocks:** FDE2 (Fixer mode, Skill), FDE4 (governance data).

---

### FDE4: Frontend and demo

**Mission:** make the Agent City beautiful and truthful, and turn the run into a 3-minute video that wins.

**Owns:** F37 city map, F38 semantic zoom, F39 node detail panel, F40 ripple animation, F41 live agents and building states, F32 trace timeline, F33 metrics panel, F34 governance panel, F42 graph diff view, F43 replay mode, F09 confidence badges, F44 isometric city (stretch), F49 video.

| Hours | Tasks |
|---|---|
| 0 to 3 | Vite + React + Tailwind + Cytoscape set-up. District columns from `sample_graph.json`. Pick the colour system: one colour per layer; red, amber, grey and green for states. |
| 3 to 8 | Buildings, roads, padlocks and dim untested buildings. Node detail panel. Connect to the real `GET /graph`. |
| 8 to 14 | Ripple animation wave by wave from the impact report. Impact report panel. Confidence badges. |
| 14 to 20 | Live agents from the WebSocket: workers on buildings, building states, trace timeline, graph diff view. |
| 20 to 24 | Metrics and governance panels. Replay mode (clearly labelled). Polish with CP1. |
| 24 to 28 | Record and edit the 3-minute video (PRD section 15). Make a backup recording. |

**Done when:**
- the dashboard shows the whole flow live: scan, ripple, agents, green city, "Dangling references: 0"
- replay mode works
- the video is under 3 minutes

**Depends on:** FDE1 (graph), FDE2 (impact report), CP2 (WebSocket), CP1 (hosting).
**Unblocks:** the demo and the submission.

---

## 4. Timeline at a glance

| Hours | CP1 | CP2 | FDE1 | FDE2 | FDE3 | FDE4 |
|---|---|---|---|---|---|---|
| 0 to 3 | Budget alert, IaC set-up | Risk test with FDE3, event contract | Graph contract, sample graph, Python + SQL scanners | ShopFlow, answer key, baseline | Risk test with CP2, hook payload | UI set-up, districts from sample |
| 3 to 8 | VPC, ALB, S3 + CloudFront | Event server, DynamoDB, S3 | TS + config scanners, linker, real graph | Impact engine | Permit and report hooks | Buildings, roads, detail panel |
| 8 to 14 | ALB paths, WebSocket, CI/CD | EC2 host, Docker Compose, IAM, secrets | Check against answer key, merge Bob edges | Orchestrator | Modes, Skill, prompts | Ripple, impact panel |
| 14 to 20 | Help FDE4 | Remote MCP, logs, full run on AWS | Re-scan, diff, PII, grep | Verify, retry, PR | MCP server, Cartographers, approvals, budget | Live agents, trace, diff view |
| 20 to 24 | README | Replays in S3, WebSocket load test | Bug fixes | End-to-end tuning | Demo "blocked" moment | Metrics, governance, replay |
| 24 to 28 | Submission package, secret scan | Keep demo stable | Demo help | Record clean run, metrics | Bob session export, README Bob part | Video |

---

## 5. Checkpoints (whole team)

| Hour | What must be true | If not |
|---|---|---|
| 3 | Bob hooks fire from `bob -p` on EC2, and 3 or more workers run at once | Switch to Bob IDE subagents for fixing; drive the map from orchestrator events |
| 6 | Dashboard reachable on a public HTTPS URL | Demo from a laptop; keep AWS for the backend only |
| 8 | Real `graph.json` covers all 7 layers | Drop tree-sitter; regex only; one Cartographer layer |
| 14 | One rename works end to end, even with no visuals | Cut every Should and Stretch feature right away |
| 20 | Full flow runs twice in a row on AWS | Freeze; polish; record the replay |
| 27 | Submission uploaded | Submit what works; the replay covers the demo |

---

## 6. Team rules

1. **Contracts first.** Build against the sample files. Never wait for a teammate's real output.
2. **Export Bob sessions as you go.** When a Bob task ends, export its history as markdown and screenshot its usage summary into `bob_sessions/<your-id>/`. Judges require this.
3. **No secrets in git.** Keys live in Secrets Manager or a local `.env` listed in `.gitignore`. CI runs a secret scan. IBM disables accounts that leak Bob credentials.
4. **Stand-up every 4 hours**, 10 minutes: done, next, blocked.
5. **One main branch, small pull requests.** CI must be green before merge. Nobody deploys after hour 26 without CP2's OK.
6. **Real numbers only.** The metrics table and the video use measured numbers. Any replay is labelled as a replay.
7. **Budget.** Each person watches their own Bobcoins. If the first event's rule still applies (40 per person, no top-ups), the team has about 240. Save the final demo run for last and record it early.

---

## 7. Demo day roles

| Person | Role in the demo and video |
|---|---|
| FDE4 | Drives the dashboard and edits the video |
| FDE2 | Narrates the problem and the metrics |
| FDE3 | Shows Bob IDE: the Change Planner, the approval, the blocked agent |
| FDE1 | Shows the grep comparison and the "0 dangling references" proof |
| CP2 | Watches the AWS environment live; switches to replay if needed |
| CP1 | Submits: repo link, video, README, `bob_sessions/` check |
