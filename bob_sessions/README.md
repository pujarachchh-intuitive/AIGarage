# Bob Sessions

Evidence from every IBM Bob session, as the hackathon rules require. Each teammate has a folder named
after their role (`cp1`, `cp2`, `fde1` … `fde4`, see `TEAM_PLAN.md`), with one sub-folder per session.

```text
bob_sessions/
  fde4/
    fe-01-contracts-mock-data/
      bob-task-<id>-<date>.md      task history, exported from Bob, unedited
      bob-task-<id>-<date>.json    the same task as Bob's JSON export, unedited
      consumption-summary.png      screenshot of the task's usage summary
      NOTES.md                     goal, files changed, commit, work done outside Bob
      prompt.txt                   the prompt given to Bob
```

## FDE4 (frontend) sessions

The dashboard is `systemdna/web`. The sessions after B1 target that app.

| Session | Feature slice | Evidence folder | Commit | Bobcoins |
|---|---|---|---|---|
| B1 | Contracts + mock data (checks now run as `systemdna/web/lib/__tests__/contracts.test.ts`) | `fde4/fe-01-contracts-mock-data/` | 17ba11b | 5.83 |
| B2 | 3D city layout engine + tests | `fde4/fe-02-city-layout-engine/` | | |
| B7 | 3D synapse (neural mind-map) view | `fde4/fe-07-synapse-neural-view/` | | |
| B3 | Ripple scheduler + building/agent state tests | `fde4/fe-03-state-machine-ripple/` | | |
| B4 | Trace, metrics, governance, graph diff panels | `fde4/fe-04-observability-panels/` | | |
| B5 | Replay mode + live WebSocket backfill | `fde4/fe-05-replay-live-source/` | | |
| B8 | Backend integration adapters + contract tests | `fde4/fe-08-backend-integration/` | | |
| B6 | Performance, accessibility and security review | `fde4/fe-06-review-hardening/` | | |

**Budget:** 40 Bobcoins per person, about 35 planned, 5 in reserve.

## Export checklist (after every session)

- [ ] Session finished or stopped deliberately
- [ ] Task history exported (Markdown, and JSON if offered) into the session folder
- [ ] Consumption-summary screenshot saved in the same folder
- [ ] Export read through for secrets before committing
- [ ] `NOTES.md` written and the table row above filled in
- [ ] Code and evidence committed together with a `Tn: ... (Bob Bn)` message
