// Builds the markdown change report (impact + audit) for download or a PR body.

import { indexGraph } from "@/lib/impact";
import { layerLabel, SEVERITY_LABEL } from "@/lib/layers";
import { formatDuration, type RunView } from "@/lib/run-state";
import type { Change, Graph } from "@/lib/types";

export function buildReport(change: Change, graph: Graph, view: RunView): string {
  const { byId } = indexGraph(graph);
  const r = change.report;
  const lines: string[] = [];
  lines.push(`# ${change.title}`, "");
  lines.push(`- Change: ${change.id}`);
  lines.push(`- Repository: ${graph.repo}`);
  lines.push(`- Mode: ${change.mode === "demo" ? "Simulated run (demo data)" : "Live run"}`);
  lines.push(`- Status: ${view.status}`);
  lines.push(`- Elapsed: ${formatDuration(view.elapsedMs)}`);
  lines.push(`- Files changed: ${r.fixUnits.length} in ${r.waveCount} waves`);
  lines.push(`- Dangling references: ${view.danglingBefore ?? r.danglingRefs} before, ${view.danglingAfter ?? "not yet re-scanned"} after`);
  lines.push(`- Bobcoins: ${view.bobcoins.toFixed(2)}`, "");

  if (r.risk) {
    lines.push("## Risk assessment", "", `**${r.risk.score} / 100, ${r.risk.level} risk.**`, "");
    for (const d of r.risk.drivers) lines.push(`- **${d.label}:** ${d.detail}`);
    lines.push("", "What to do:", "");
    r.risk.recommendations.forEach((t, k) => lines.push(`${k + 1}. ${t}`));
    lines.push("");
  }

  lines.push("## Affected components", "", "| Component | District | Impact | Risk | Why |", "| --- | --- | --- | --- | --- |");
  for (const i of r.items.filter((x) => x.depth > 0)) {
    const n = byId.get(i.nodeId);
    const why = (i.factors ?? []).filter((f) => f.points > 0).slice(0, 3).map((f) => f.label).join(", ");
    lines.push(`| ${n?.name} | ${n ? layerLabel(graph, n.layer) : ""} | ${SEVERITY_LABEL[i.severity]} | ${i.risk} | ${why || "—"} |`);
  }

  lines.push("", "## Business impact", "");
  for (const b of r.business) lines.push(`- ${b.name} (${b.owner}): ${b.severity === "safe" ? "safe" : "affected"}`);

  lines.push("", "## Grep comparison", "");
  lines.push(`A text search for "${r.oldName}" missed ${r.grep.missed.length} of ${r.fixUnits.length} files:`);
  for (const file of r.grep.missed) lines.push(`- ${file}`);

  lines.push("", "## Agents", "", "| Agent | File | Wave | State | Retries | Blocked |", "| --- | --- | --- | --- | --- | --- |");
  for (const a of view.agents) lines.push(`| ${a.id} | ${a.file} | ${a.wave} | ${a.state} | ${a.retries} | ${a.blocked} |`);

  lines.push("", "## Audit log", "");
  for (const ev of change.events) {
    lines.push(`- ${ev.ts} ${ev.event}${ev.agent_id ? ` ${ev.agent_id}` : ""}${ev.file ? ` ${ev.file}` : ""}${ev.permit_ok === false ? " (outside permit)" : ""}${ev.detail ? `: ${ev.detail}` : ""}`);
  }
  return lines.join("\n") + "\n";
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
