# Architecture Diagram 6 — Orchestrator & Permit System

How the wave-by-wave fix execution works, how permits are enforced,
and how all events stream to the UI.

```
Orchestrator.run_change(change_id, report, graph_store, emitter)
        │
        ├── Step 1: Approval gate
        │   For each FixUnit where needsApproval=True:
        │     emitter.emit("awaiting_approval", node=unit.id,
        │                   file=unit.file, detail="database node")
        │     → UI shows amber approval banner
        │     Wait for POST /changes/{id}/approve
        │     emitter.emit("approved", node=unit.id)
        │     → UI clears banner
        │
        ├── Step 2: For each wave (topological order, wave 1 first):
        │
        │   PermitWriter.write(unit, change_id) for each unit in wave
        │   Creates: .systemdna/permits/{unit.id}.json
        │   {
        │     "agent_id":      "fix-stg_orders",
        │     "change_id":     "chg-012",
        │     "node":          "pipe:sqlmodel:stg_orders",
        │     "allowed_files": ["transforms/stg_orders.sql",
        │                       "tests/test_transforms.py"],
        │     "max_cost":      2,
        │     "max_turns":     12,
        │     "needs_approval": false
        │   }
        │
        │   emitter.emit("wave_started", wave=wave_num)
        │   → UI: wave counter increments
        │
        │   asyncio.gather([run_unit(u) for u in wave], limit=MAX_WORKERS)
        │
        │   run_unit(unit):
        │   ┌─────────────────────────────────────────────────────┐
        │   │  Primary: bob -p worker                             │
        │   │  SYSTEMDNA_AGENT_ID=fix-{unit.id}                   │
        │   │  bob -p prompts/{unit.id}.md                        │
        │   │    --mode agent                                     │
        │   │    --max-cost 2                                     │
        │   │    --max-turns 12                                   │
        │   │    --format stream-json                             │
        │   │                                                     │
        │   │  hooks/report.py fires:                             │
        │   │    SessionStart → agent_started RunEvent            │
        │   │    PostToolUse  → tool_call RunEvent                │
        │   │    Stop         → done/check_failed RunEvent        │
        │   │                                                     │
        │   │  hooks/permit_check.py fires on PreToolUse:         │
        │   │    Read permit from .systemdna/permits/{agent_id}   │
        │   │    If file not in allowed_files:                    │
        │   │      emit blocked RunEvent                          │
        │   │      exit 2  → Bob refuses the tool call            │
        │   │    Else: emit tool_call, exit 0                     │
        │   │                                                     │
        │   │  Fallback (bob unavailable):                        │
        │   │    AG2 FixerAgent.run()                             │
        │   │    Same RunEvents emitted via EventEmitter          │
        │   └─────────────────────────────────────────────────────┘
        │
        │   Verifier.verify_node(unit, repo_path):
        │     SQL:    sqlglot.parse (syntax check)
        │     Python: ruff check {file}
        │     TS:     tsc --noEmit
        │     Tests:  pytest -x -k {node_name}
        │     Returns {passed: bool, detail: str}
        │
        │   If check_failed:
        │     emitter.emit("check_failed", detail=error)
        │     Retry once with error in prompt
        │     emitter.emit("retrying")
        │     Re-run worker
        │     If still fails: emitter.emit("quarantined")
        │
        │   emitter.emit("wave_completed", wave=wave_num)
        │
        ├── Step 3: Re-scan
        │   scan_repo(repo_path) → nodes2, edges2
        │   GraphStore.diff(nodes1, nodes2) → {before, after}
        │   emitter.emit("rescan",
        │     data={"before": dangling_before, "after": dangling_after})
        │   → UI: KPI "Dangling references: 0" turns green
        │
        ├── Step 4: Inspector
        │   diff_text = git diff HEAD
        │   InspectorAgent.run(diff_text, report) → {verdict, issues}
        │   emitter.emit("inspector",
        │     data={"verdict": "approved", "issues": 0})
        │
        ├── Step 5: PR creation
        │   PRCreator.create_pr(repo_path, change_id, report, diff)
        │   → Creates branch fix/chg-012
        │   → Commits with message "[SystemDNA] rename orders.cust_id"
        │   → Opens GitHub PR with impact report in body
        │   emitter.emit("pr_created",
        │     data={"branch": "fix/chg-012", "simulated": false})
        │
        └── Step 6: Complete
            emitter.emit("change_completed")
            → UI: all buildings green, status=Completed
```

## Permit enforcement diagram

```
Bob agent tries to write backend/routes.py
        │
        ▼
Bob fires PreToolUse hook
        │
        ▼
hooks/permit_check.py
  reads stdin: {tool: "write_to_file", path: "backend/routes.py",
                session_id: "abc123"}
        │
        ▼
Load permit: .systemdna/permits/fix-stg_orders.json
  allowed_files: ["transforms/stg_orders.sql", "tests/test_transforms.py"]
        │
        ▼
"backend/routes.py" NOT in allowed_files
        │
        ▼
POST /events {event: "blocked", agent_id: "fix-stg_orders",
              file: "backend/routes.py", detail: "out of permit"}
        │
exit 2
        │
Bob refuses the tool call
Agent sees "Error: hook rejected this action"
        │
GovernancePanel in UI:
  Blocked actions: 1
  fix-stg_orders tried to edit backend/routes.py (out of permit)
```
