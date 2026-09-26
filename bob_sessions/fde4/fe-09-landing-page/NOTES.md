# Landing page (public marketing page)

**Mode:** Agent · **Bobcoins:** 32.88 (from the export's `costs.cost`) · **Status:** stopped by Bob with
`BudgetExceededError` (the 40-Bobcoin allowance ran out during the final build check)

## Goal
A public landing page for SystemDNA: DNA-helix hero, "One rename. Seven layers." problem chain, 5-step
how-it-works timeline, the three grep traps as flip cards, an Agent City preview, the city laws, the
Bob 2.0 feature grid, target metric tiles ("Measured live in the demo"), an architecture diagram and a footer.
Buttons go to `/city` and `/city?mode=replay`.

## What is in this folder
| File | What it is |
|---|---|
| `bob-task-f8173974…-2026-09-26.json` | The task as Bob's full JSON export (unedited). It includes the prompt. |

## What Bob did
1. Found the prompt still described the old Vite `web/` app and adapted it to the Next.js `systemdna/web` app.
2. Wrote 11 section components plus `metrics.ts` and `siteConfig.ts` under `systemdna/web/app/landing/`,
   made `/` show the landing page, and added a replay title to `/city?mode=replay`.
3. Added 14 tests (data contract + render tests). `tsc`, `vitest` (35/35) and `next build` passed.
4. On request, split it into a standalone app in `systemdna/landing/`. The budget ran out while its
   build was failing on a UTF-8 BOM in `tsconfig.json`.

## Changes made after the Bob session (review)
- The standalone `systemdna/landing/` app was dropped; the landing page lives in one folder of the
  dashboard, `systemdna/web/app/landing/`, served at `/landing` (`/` redirects there).
- Landing styles and fonts are scoped to that route (`landing/layout.tsx`, `landing/landing.css`) so they
  do not leak into the dashboard.
- Lint fixes: unescaped apostrophe, unused variables, and `setState` inside an effect in the hero
  (now `useSyncExternalStore`).

## Commit
`5b90432` Add landing page at /landing and make it the home page (branch `feature/frontend`)
