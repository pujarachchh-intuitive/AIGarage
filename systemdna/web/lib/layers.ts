import type { Graph, LayerDef, LayerId, Severity } from "@/lib/types";

// Layers for the ShopFlow demo repo (PRD section 15).
// Other repos bring their own layers in graph.json.
export const SHOPFLOW_LAYERS: LayerDef[] = [
  { id: "database", label: "Database", column: 0, requiresApproval: true, check: "Migration applies on a scratch database" },
  { id: "pipelines", label: "Pipelines", column: 1, check: "sqlglot parse and lineage re-check passed" },
  { id: "backend", label: "Backend", column: 2, check: "ruff and pytest passed" },
  { id: "api", label: "API", column: 3, check: "API contract tests passed" },
  { id: "frontend", label: "Frontend", column: 4, check: "tsc and vitest passed" },
  { id: "dashboards", label: "Dashboards", column: 5, check: "Dashboard source columns resolve" },
  { id: "business", label: "Business", column: 6, check: "Read-only" },
  { id: "quality", label: "Tests and docs", column: -1, check: "Tests pass; doc links resolve" },
];

export function layerLabel(graph: Graph | null | undefined, id: LayerId): string {
  return graph?.layers.find((l) => l.id === id)?.label ?? id;
}

export function layerDef(graph: Graph | null | undefined, id: LayerId): LayerDef | undefined {
  return graph?.layers.find((l) => l.id === id);
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  breaking: "Breaking",
  needs_update: "Needs update",
  update: "Update",
  safe: "Safe",
};

export const SEVERITY_RANK: Record<Severity, number> = {
  breaking: 3,
  needs_update: 2,
  update: 1,
  safe: 0,
};
