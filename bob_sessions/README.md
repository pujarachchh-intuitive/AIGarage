# Bob Sessions

This directory contains evidence and exports from each IBM Bob IDE session, tracking progress across the SystemDNA frontend build.

## Session Overview

| Task | Claude work (before/after) | Bob session | Evidence folder | Commit | Bobcoins used |
|------|----------------------------|-------------|-----------------|--------|---------------|
| T1 | Scaffold (T0), review of types | B1 contracts + mock data | fe-01-contracts-mock-data/ | | |
| T3 | 3D city scene (T4), zoom (T5) on top | B2 3D city layout engine | fe-02-city-layout-engine/ | | |
| T6 | Synapse glow polish, view crossfade | B7 3D synapse neural view | fe-07-synapse-neural-view/ | | |
| T7 | Store wiring, ripple + worker visuals (T8) | B3 state machine + ripple | fe-03-state-machine-ripple/ | | |
| T10 | HUD panel restyle | B4 observability panels + 3D diff | fe-04-observability-panels/ | | |
| T11 | Mode switch styling | B5 cinematic replay + live source | fe-05-replay-live-source/ | | |
| T13 | Env switch, live smoke test | B8 backend integration | fe-08-backend-integration/ | | |
| T12 | Final QA | B6 review + hardening | fe-06-review-hardening/ | | |

**Total target**: ~35 Bobcoins (5 reserved)

## What Goes in Each Folder

1. **Task history** - Exact export from Bob IDE (Markdown, unedited)
2. **consumption-summary.png** - Screenshot of Bob's consumption summary
3. **NOTES.md** - Your notes: goal, files changed, commit hash

## Export Checklist

After each Bob session:

- [ ] Session finished or stopped deliberately
- [ ] Task history exported to Markdown into session folder
- [ ] Consumption-summary screenshot saved
- [ ] Export read through for secrets before committing
- [ ] NOTES.md written, table row above filled in
- [ ] Code and evidence committed together with `Tn: ... (Bob Bn)` message
