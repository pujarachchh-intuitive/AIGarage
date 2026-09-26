# Architecture Diagram 2 — LangGraph Pipeline

The three-node durable pipeline. Redis stores state after every node so a crash
at any point can resume from the last completed node.

```
POST /changes/{id}/run
        │
        ▼
PipelineRunner.start(change_id, repo_path, request)
        │
        ▼  thread_id = change_id  (Redis checkpoint key)
┌───────────────────────────────────────────────────────────────────────┐
│                     LangGraph  StateGraph                             │
│                                                                       │
│   PipelineState = {                                                   │
│     change_id, repo_path, request,                                    │
│     nodes[], edges[], report,                                         │
│     scan_done, enrich_done, orchestrate_done,                         │
│     error, error_node                                                 │
│   }                                                                   │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │  scan_node                                                  │     │
│  │  • python_scan  + sql_scan + ts_scan + config_scan          │     │
│  │  • Linker.link() → cross-layer edges                        │     │
│  │  • GraphStore.build() → Neo4j                               │     │
│  │  • ChromaStore.upsert() → ChromaDB                          │     │
│  │  • emits tool_call RunEvents (visible in TraceTimeline)     │     │
│  │  • saves: state.nodes, state.edges, scan_done=True          │     │
│  └─────────────────────┬───────────────────────────────────────┘     │
│                        │ Redis checkpoint saved                       │
│                        ▼                                              │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │  enrich_node                                                │     │
│  │  • CartographerOrchestrator.enrich()                        │     │
│  │    – 7 AG2 GroupChats in parallel (one per layer)           │     │
│  │    – Gemini finds missed edges                              │     │
│  │    – validates evidence (file:line required)                │     │
│  │    – merges bob-edges into Neo4j                            │     │
│  │  • DocUnderstandingOrchestrator.enrich()                    │     │
│  │    – reads data_dictionary.pdf + ADR markdown               │     │
│  │    – patches owner, pii, criticality on nodes               │     │
│  │  • emits agent_started / done per Cartographer              │     │
│  │  • saves: enrich_done=True                                  │     │
│  └─────────────────────┬───────────────────────────────────────┘     │
│                        │ Redis checkpoint saved                       │
│                        ▼                                              │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │  orchestrate_node                                           │     │
│  │  • Orchestrator.run_change()                                │     │
│  │    – awaiting_approval for db/PII nodes                     │     │
│  │    – for each wave:                                         │     │
│  │        write permits → wave_started                         │     │
│  │        spawn bob -p workers (or AG2 Fixer fallback)         │     │
│  │        hooks → POST /events → WS → UI live                  │     │
│  │        verify each node → retry once on fail                │     │
│  │        wave_completed                                       │     │
│  │    – re-scan → Neo4j diff → rescan event                    │     │
│  │    – InspectorAgent.run() → inspector event                 │     │
│  │    – PRCreator.create_pr() → pr_created event               │     │
│  │    – change_completed event                                 │     │
│  │  • saves: orchestrate_done=True                             │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                                                                       │
│  ON ERROR at any node:                                                │
│    state.error = exception message                                    │
│    state.error_node = "scan_node" | "enrich_node" | "orchestrate_node│
│    → conditional edge → END                                           │
│                                                                       │
│  ON RESUME:                                                           │
│    PipelineRunner.resume(change_id)                                   │
│    LangGraph loads Redis checkpoint for thread_id=change_id           │
│    Skips already-completed nodes                                      │
│    Re-enters at the failed node                                       │
└───────────────────────────────────────────────────────────────────────┘
```

## Crash-resume example

```
Timeline:
  T=0   scan_node starts
  T=12s scan_node completes → Redis saves scan_done=True
  T=13s enrich_node starts (Cartographer for "database" layer running)
  T=45s CRASH — container dies

On restart:
  PipelineRunner.resume("chg-001")
  LangGraph reads Redis: scan_done=True, enrich_done=False
  Skips scan_node entirely
  Restarts enrich_node from scratch (Cartographers re-run)
  Continue → orchestrate_node → done
```
