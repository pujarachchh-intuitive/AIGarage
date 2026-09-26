// Real numbers and shapes for the landing page.
//
// Everything here comes from the sample repo's graph (marketplace-dashboard) and the
// real impact engine, so the landing page never shows made-up figures. It runs on the
// server; the browser only gets this small summary, not the whole graph.

import { buildCityData, layoutCity } from "@/lib/city";
import { computeImpact } from "@/lib/impact";
import { SEVERITY_RANK } from "@/lib/layers";
import marketplaceGraph from "@/lib/mock/marketplace-dashboard.graph.json";
import type { Graph, Severity } from "@/lib/types";

const DEMO_FIELD = "field:Deployment.successRate";
const DEMO_TO = "deploySuccessRate";

export interface LandingBuilding {
  path: string;
  dir: string;
  x: number;
  z: number;
  h: number;
}

export interface LandingData {
  repo: string;
  stats: { files: number; lines: number; components: number; links: number; layers: number; folders: number };
  /** Node counts per type, biggest first. */
  nodeTypes: { type: string; label: string; count: number }[];
  /** Node counts per layer, in the graph's layer order. */
  layers: { label: string; count: number }[];
  change: {
    field: string;
    oldName: string;
    to: string;
    /** File that holds the renamed field. */
    source: string;
    files: number;
    waves: number;
    risk: number;
    approvals: number;
    computedMs: number;
    fixUnits: { file: string; name: string; wave: number; layer: string; severity: Severity; needsApproval: boolean }[];
    business: { name: string; owner?: string }[];
    grep: { found: string[]; missed: string[]; falsePositives: string[] };
  };
  city: {
    buildings: LandingBuilding[];
    districts: { dir: string; x: number; z: number; w: number; d: number }[];
    links: { from: string; to: string }[];
    size: { w: number; d: number };
  };
}

const TYPE_LABEL: Record<string, string> = {
  TSField: "Fields",
  Function: "Functions",
  TSType: "Types",
  Component: "Components",
  Page: "Pages",
  Dataset: "Datasets",
  BusinessProcess: "Business uses",
  Doc: "Docs",
  Constant: "Constants",
};

let cached: LandingData | null = null;

export function getLandingData(): LandingData {
  if (cached) return cached;
  const graph = marketplaceGraph as Graph;
  const city = buildCityData(graph);
  const layout = layoutCity(city);

  const field = graph.nodes.find((n) => n.id === DEMO_FIELD);
  const report = computeImpact(graph, { node: DEMO_FIELD, change: "rename", to: DEMO_TO });
  const itemByNode = new Map(report.items.map((i) => [i.nodeId, i]));
  const layerLabel = new Map(graph.layers.map((l) => [l.id, l.label]));

  const typeCounts = new Map<string, number>();
  for (const n of graph.nodes) typeCounts.set(n.type, (typeCounts.get(n.type) ?? 0) + 1);

  cached = {
    repo: graph.repo,
    stats: {
      files: city.stats.files,
      lines: city.stats.lines,
      components: graph.nodes.length,
      links: graph.edges.length,
      layers: graph.layers.length,
      folders: city.stats.districts,
    },
    nodeTypes: [...typeCounts.entries()]
      .map(([type, count]) => ({ type, label: TYPE_LABEL[type] ?? type, count }))
      .sort((a, b) => b.count - a.count),
    layers: graph.layers.map((l) => ({ label: l.label, count: graph.nodes.filter((n) => n.layer === l.id).length })),
    change: {
      field: field?.name ?? "Deployment.successRate",
      oldName: report.oldName,
      to: DEMO_TO,
      source: field?.file ?? "",
      files: report.fixUnits.length,
      waves: report.waveCount,
      risk: Math.max(0, ...report.items.map((i) => i.risk)),
      approvals: report.fixUnits.filter((u) => u.needsApproval).length,
      computedMs: report.computedMs,
      fixUnits: report.fixUnits.map((u) => {
        // The worst severity of the nodes this file holds.
        const severity = u.nodes
          .map((id) => itemByNode.get(id)?.severity ?? "update")
          .sort((a, b) => SEVERITY_RANK[b] - SEVERITY_RANK[a])[0] ?? "update";
        return { file: u.file, name: u.assetName, wave: u.wave, layer: layerLabel.get(u.layer) ?? u.layer, severity, needsApproval: u.needsApproval };
      }),
      business: report.business.map((b) => ({ name: b.name, owner: b.owner })),
      grep: report.grep,
    },
    city: {
      buildings: city.files.flatMap((f) => {
        const p = layout.positions.get(f.path);
        return p ? [{ path: f.path, dir: f.dir, x: p.x, z: p.z, h: p.h }] : [];
      }),
      districts: layout.districts,
      links: city.links,
      size: layout.size,
    },
  };
  return cached;
}
