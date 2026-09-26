# Architecture Diagram 4 — RunEvent Flow (UI Live Integration)

How every agent action becomes visible in the Agent City UI in real time.
The frontend is never modified — it reads from WS /ws automatically in live mode.

```
Agent action occurs
(Bob hook, AG2 tool call, orchestrator state change)
        │
        ▼
EventEmitter.emit(event_type, **fields)
        │
        │  Constructs RunEvent dict (exact types.ts schema):
        │  {
        │    "ts":        "2026-09-27T10:15:02Z",
        │    "change_id": "chg-012",
        │    "event":     "tool_call",          ← one of 17 RunEventType values
        │    "agent_id":  "fix-stg_orders",
        │    "wave":      2,
        │    "tool":      "write_to_file",
        │    "file":      "transforms/stg_orders.sql",
        │    "node":      "pipe:sqlmodel:stg_orders",
        │    "permit_ok": true,
        │    "bobcoins":  0.2
        │  }
        │
        ▼
POST http://api:8080/events
  Bearer: DEMO_TOKEN
        │
        ▼
server/app.py  POST /events handler
  1. store.save_event(ev)        ← persists to SQLite / DynamoDB
  2. ws.broadcast(json(ev))      ← pushes to ALL connected WS clients
        │
        ▼
WS /ws  →  Browser (systemdna/web)
        │
        ▼
api.ts  subscribeEvents(onEvent, onStatus)
  onEvent(ev) called with each message
        │
        ▼
store.ts  appendEvent(ev)
  Zustand state updated:
  change.events = [...change.events, ev]
        │
        ▼
run-state.ts  deriveRun(change, now)
  Derives RunView from all events:
  • agents[]       ← AgentsTable rows
  • unitState      ← building states on CityMap
  • pendingApprovals
  • blocked[]      ← GovernancePanel
  • bobcoins total ← KPI tile
  • danglingAfter  ← KPI tile "Dangling references: 0"
        │
        ▼
React re-render — Agent City UI updates live:

  ┌─────────────────────────────────────────────────────────────┐
  │  CityMap                                                    │
  │  • severity colours (red=breaking, amber=needs_update)      │
  │  • buildingState per asset:                                 │
  │    affected → under_construction → inspecting → fixed       │
  │    blocked → needs_human                                    │
  │  • agents[] dots moving across buildings                    │
  └─────────────────────────────────────────────────────────────┘
  ┌─────────────────────────────────────────────────────────────┐
  │  TraceTimeline                                              │
  │  • one row per RunEvent, with timestamp                     │
  │  • shows: wave_started, agent_started, tool_call,           │
  │    blocked, check_passed, done, rescan, inspector, pr       │
  └─────────────────────────────────────────────────────────────┘
  ┌─────────────────────────────────────────────────────────────┐
  │  AgentsTable                                                │
  │  • agent_id, state, lastAction, bobcoins, retries, blocked  │
  └─────────────────────────────────────────────────────────────┘
  ┌─────────────────────────────────────────────────────────────┐
  │  GovernancePanel                                            │
  │  • blocked actions (permit violations)                      │
  │  • pending approvals (db/PII nodes)                         │
  │  • PII nodes touched                                        │
  └─────────────────────────────────────────────────────────────┘
  ┌─────────────────────────────────────────────────────────────┐
  │  KPI Tiles                                                  │
  │  Elapsed | Agents done | Wave | Bobcoins | Dangling refs    │
  └─────────────────────────────────────────────────────────────┘
```

## Event sequence for one complete change

```
POST /changes                        → impact_ready
                                     (ripple animation starts)
POST /changes/{id}/run
  orchestrate_node begins
  ├── awaiting_approval              (db node amber, approval banner shows)
  ├── approved                       (approval banner clears)
  │
  ├── wave_started (wave=1)
  │   ├── agent_started (fix-migration)
  │   ├── tool_call (read_file)
  │   ├── tool_call (write_to_file)  (building turns amber, scaffolding)
  │   ├── check_passed               (building shows spinner)
  │   └── done                       (building turns green)
  │   ├── agent_started (fix-orm)
  │   └── ... (same pattern)
  ├── wave_completed (wave=1)
  │
  ├── wave_started (wave=2)
  │   ├── agent_started (fix-stg_orders)
  │   ├── tool_call (write_to_file, permit_ok=false)
  │   ├── blocked                    (building flashes red, governance panel++)
  │   └── done
  └── wave_completed (wave=2)
  ... waves 3 and 4 ...
  ├── rescan (data.before=3, data.after=0)   (KPI: "0 Dangling refs")
  ├── inspector (data.verdict="approved")
  ├── pr_created (data.branch="fix/chg-012")
  └── change_completed               (all buildings green, status=Completed)
```
