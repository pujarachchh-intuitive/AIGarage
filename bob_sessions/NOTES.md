# B1: Contracts + mock data layer

**Task:** T1 · **PRD:** F37, F43 · **Mode:** Agent · **Bobcoins:** 5.83 (from the export's `costs.cost`; confirm against the screenshot)

## Goal
Typed data contracts matching PRD sections 7, 8, 10, 11 and 13, realistic ShopFlow mock fixtures and a
Mock `DataSource`, so the whole frontend can be built before the backend exists.

## What is in this folder
| File | What it is |
|---|---|
| `prompt.txt` | The prompt given to Bob |
| `validate.py` | Bob's own Python check of the fixtures (Node.js wasn't installed during the session, so Bob couldn't run `tsc`/`vitest`) |
| `bob-task-3857f60a…-2026-09-26.md` | The task history as exported from Bob (unedited) |
| `bob-task-3857f60a…-2026-09-26.json` | The same task as Bob's full JSON export (unedited) |
| `consumption-summary.png` | _To add:_ screenshot of the task's consumption summary |

The session was stopped by hand during its "run tsc" step: Node.js was not installed, so Bob could not run
`tsc` or `vitest`. Those checks were run after the session (see below).

## Files Bob created
- `web/src/contracts/types.ts`
- `web/src/data/DataSource.ts`, `web/src/data/MockSource.ts`
- `web/src/data/fixtures/graph.json` (68 nodes, 46 edges, all 19 node types, all 13 edge types)
- `web/src/data/fixtures/impact-chg-012.json` (17 affected nodes, 4 waves of 2/5/3/6, 2 approvals)
- `web/src/data/fixtures/events-chg-012.json` (97 events over 3 minutes)
- `web/src/data/fixtures.test.ts`

## Changes made after the Bob session (review)
Bob's 6 tests passed and `tsc` was clean once Node was available. These changes fixed problems the review found:

1. **MockSource playback.** Each event waited for the gap to the *next* event before firing, so timing was
   shifted by one. `pause()` followed by `resume()` could leave two timers running and emit duplicate
   events. Calling `run()` twice doubled playback. All three are fixed.
2. **`createChange` returns the impact report.** The PRD says POST /changes "returns change_id and impact
   report". Added an optional `impact` field to `ChangeRecord`. The mock returns `chg-012` with the fixture
   report.
3. **Metrics matched the events.** `getMetrics` hardcoded 7.6 Bobcoins while the event script sums to 7.2.
   It now derives Bobcoins, agent count, retries, test counts and wave timings from the event script.
4. **Grep comparison.** `dim_customer` was listed as a "cross_language" miss, but it joins on `cust_id`
   literally, so grep would find it. The two API endpoints were in neither the found list nor the missed
   list. The comparison now assumes the baseline grep runs over `*.py, *.sql` (a new `scope` field). That
   gives 8 found out of 17. The misses are labelled alias chain (3), dynamic SQL (1), cross-language
   (3, the TS/React side) and no literal reference (3).
5. **Event order.** One event was out of timestamp order. Events are now sorted.
6. **Tests.** Added 7 fixture tests and a new `MockSource.test.ts` (6 tests). There are now 19 tests and all pass.

## Commit
`17ba11b` T1: contracts + mock data (Bob B1)

## Where this work lives now
The team chose `systemdna/web` (Next.js) as the single dashboard, so the Vite `web/` app was removed.
The files above are kept in commit `17ba11b`. `systemdna/web` already had its own ShopFlow graph, impact
engine and run simulator, so the B1 acceptance checks were ported as tests against that code instead:
`systemdna/web/lib/__tests__/contracts.test.ts` (21 tests, run with `npm test`). They cover graph integrity,
the three PRD traps, the alias stop, the Bob-found check flag, approvals, business impact, one agent per file,
wave order, the grep misses, and a full simulated run (one block, one retry, green finish).
