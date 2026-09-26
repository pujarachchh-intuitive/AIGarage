---
name: propagate-rename
description: >-
  Use when the user wants to rename a field, column, or identifier across all
  layers of a codebase (SQL, Python, TypeScript, YAML) using the SystemDNA
  engine. Walks through impact analysis, wave planning, approval gates, and
  agent-driven file fixes.
---

# propagate-rename

Follow these steps to propagate a rename across all codebase layers using
the SystemDNA engine.

## Step 1 - Confirm the Change

Ask the user (via `ask_followup_question` if not already provided):
- What is the node id to rename? (e.g. `db:column:orders.cust_id`)
- What is the new name? (e.g. `customer_id`)

## Step 2 - Analyse Impact

Call the `get_impact` MCP tool:
```
get_impact(node="db:column:orders.cust_id", change="rename", to="customer_id")
```
Display a summary:
- Total affected nodes
- Nodes by severity (breaking / needs_update / update / safe)
- Business processes impacted
- Wave count
- Any PII or database-layer nodes requiring approval

## Step 3 - Show the Wave Plan

Call `plan_change(change_id=...)` and display:
- Wave 1: database + PII files (requires approval)
- Wave 2: pipelines + backend
- Wave 3: API + frontend
- Wave 4: dashboards + business + quality

## Step 4 - Request Approval for Wave 1

For each FixUnit with `needsApproval=true`:
- Show the file path, layer, and approval reason
- Ask the user to confirm: `approve(change_id=..., node=...)`

## Step 5 - Execute the Waves

Call `start_wave(change_id=..., wave=<n>)` for each wave in order.
Watch for `check_failed` or `quarantined` events in `get_status`.
If any agent fails, report the detail and ask the user whether to retry or skip.

## Step 6 - Verify

Call `verify(change_id=...)` and report:
- Dangling reference count (should be 0)
- Graph diff (before vs after edge counts)

## Step 7 - Done

Summarise what was changed, which waves ran, and the final verification result.
