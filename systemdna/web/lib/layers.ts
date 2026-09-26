import type { Graph, LayerDef, LayerId, Severity } from "@/lib/types";

// Each repo brings its own layers in graph.json.

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
