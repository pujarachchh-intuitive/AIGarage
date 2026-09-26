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

The dashboard is `systemdna/web`. The code for these sessions is on branch `feature/frontend`.

| Session | Feature slice | Evidence folder | Commit | Bobcoins |
|---|---|---|---|---|
| B1 | Contracts + mock data (checks now run as `systemdna/web/lib/__tests__/contracts.test.ts`) | `fde4/fe-01-contracts-mock-data/` | 17ba11b | 5.83 |
| Landing | Public landing page at `/landing` | `fde4/fe-09-landing-page/` | 5b90432 | 32.88 |

**Budget:** 40 Bobcoins per person. The FDE4 allowance is used up: the landing-page task ended with
Bob's `BudgetExceededError`.

## Other sessions

| File | Owner |
|---|---|
| `bob-tasks-AIGarage-2026-09-26.md` | Krishil Agrawal (task history export, kept as committed) |

## Export checklist (after every session)

- [ ] Session finished or stopped deliberately
- [ ] Task history exported (Markdown, and JSON if offered) into the session folder
- [ ] Consumption-summary screenshot saved in the same folder
- [ ] Export read through for secrets before committing
- [ ] `NOTES.md` written and the table row above filled in
- [ ] Code and evidence committed together with a `Tn: ... (Bob Bn)` message
