"use client";

import { useEffect, useMemo, useRef } from "react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { Maximize2, Minus, Plus } from "lucide-react";
import { indexGraph } from "@/lib/impact";
import type { AgentState, BuildingState } from "@/lib/run-state";
import { useIsDark } from "@/lib/theme";
import { readTokens, type Tokens } from "@/lib/tokens";
import type { Graph, LayerId, Severity } from "@/lib/types";
import { cn } from "@/lib/cn";

export interface CityAgent {
  id: string;
  label: string;
  unit: string;
  state: AgentState;
}

interface CityMapProps {
  graph: Graph;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Severity per node id. */
  severity?: Record<string, Severity>;
  /** Node ids grouped by depth. When set, severity is revealed wave by wave. */
  revealLevels?: string[][];
  /** Change this value to replay the ripple. */
  rippleKey?: string | number;
  /** Building state per fix unit (asset id). */
  buildingState?: Record<string, BuildingState>;
  agents?: CityAgent[];
  layerFilter?: LayerId | "all";
  className?: string;
}

// Layout constants (graph units).
const COL_W = 210;
const GAP = 76;
const FIELD_H = 26;
const FIELD_STEP = 34;

function buildStyle(t: Tokens) {
  const s: { selector: string; style: Record<string, unknown> }[] = [
    {
      selector: "node",
      style: {
        "font-family": t.font,
        "font-size": 11,
        "font-weight": 600,
        color: t.textPrimary,
        "text-wrap": "ellipsis",
        "overlay-opacity": 0,
        "transition-property": "background-color, border-color, opacity",
        "transition-duration": 250,
      },
    },
    {
      selector: "node.district",
      style: {
        shape: "round-rectangle",
        "corner-radius": 16,
        "background-color": t.surface,
        "background-opacity": 0.55,
        "border-width": 1,
        "border-color": t.border,
        label: "data(label)",
        "text-transform": "uppercase",
        "font-size": 11,
        color: t.textTertiary,
        "text-valign": "top",
        "text-halign": "center",
        "text-margin-y": -8,
        padding: 18,
      },
    },
    {
      selector: "node.asset.compound",
      style: {
        shape: "round-rectangle",
        "corner-radius": 10,
        "background-color": t.surface,
        "border-width": 1,
        "border-color": t.borderStrong,
        label: "data(label)",
        "text-valign": "top",
        "text-halign": "center",
        "text-margin-y": -5,
        "font-size": 11.5,
        padding: 8,
      },
    },
    {
      selector: "node.asset.leaf",
      style: {
        shape: "round-rectangle",
        "corner-radius": 10,
        width: "data(w)",
        height: "data(h)",
        "background-color": t.surface,
        "border-width": 1,
        "border-color": t.borderStrong,
        label: "data(label)",
        "text-valign": "center",
        "text-halign": "center",
        "text-max-width": 168,
        "font-size": 11.5,
      },
    },
    {
      selector: "node.field",
      style: {
        shape: "round-rectangle",
        "corner-radius": 6,
        width: 168,
        height: FIELD_H,
        "background-color": t.surfaceSecondary,
        "border-width": 1,
        "border-color": t.border,
        label: "data(label)",
        "text-valign": "center",
        "text-halign": "center",
        "font-size": 10.5,
        "font-weight": 500,
        color: t.textSecondary,
      },
    },
    { selector: "node.untested", style: { "background-opacity": 0.55 } },
    { selector: "node.pii", style: { "border-style": "double", "border-width": 3 } },
    {
      selector: "edge",
      style: {
        width: 1.25,
        "line-color": t.borderStrong,
        "target-arrow-color": t.borderStrong,
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.75,
        "curve-style": "taxi",
        "taxi-direction": "auto",
        "taxi-turn": "50%",
        "taxi-turn-min-distance": 12,
        opacity: "data(op)",
      },
    },
    { selector: "edge.bob", style: { "line-style": "dotted" } },

    // Severity (impact analysis).
    { selector: "node.sev-breaking", style: { "border-color": t.error, "border-width": 2, "background-color": t.errorSoft, "background-opacity": 1, color: t.textPrimary } },
    { selector: "node.sev-needs_update", style: { "border-color": t.warning, "border-width": 2, "background-color": t.warningSoft, "background-opacity": 1, color: t.textPrimary } },
    { selector: "node.sev-update", style: { "border-color": t.info, "border-width": 2, "background-color": t.infoSoft, "background-opacity": 1, color: t.textPrimary } },
    { selector: "node.sev-safe", style: { opacity: 0.45 } },
    { selector: "edge.impacted", style: { "line-color": t.error, "target-arrow-color": t.error, width: 2, "line-style": "dashed", "line-dash-pattern": [6, 4], opacity: 1 } },
    { selector: "edge.safe-edge", style: { opacity: 0.3 } },

    // Building states (live run). Listed after severity so they win.
    { selector: "node.bs-awaiting_approval", style: { "border-color": t.warning, "border-width": 2, "background-color": t.warningSoft, "background-opacity": 1 } },
    { selector: "node.bs-under_construction", style: { "border-color": t.warning, "border-width": 2, "border-style": "dashed", "background-color": t.warningSoft, "background-opacity": 1 } },
    { selector: "node.bs-inspecting", style: { "border-color": t.info, "border-width": 2, "background-color": t.infoSoft, "background-opacity": 1 } },
    { selector: "node.bs-blocked", style: { "border-color": t.error, "border-width": 3, "background-color": t.errorSoft, "background-opacity": 1 } },
    { selector: "node.bs-needs_human", style: { "border-color": t.warning, "border-width": 3, "background-color": t.warningSoft, "background-opacity": 1 } },
    { selector: "node.bs-fixed", style: { "border-color": t.success, "border-width": 2, "border-style": "solid", "background-color": t.successSoft, "background-opacity": 1 } },
    { selector: "edge.fixed-edge", style: { "line-color": t.success, "target-arrow-color": t.success, "line-style": "solid", width: 1.5 } },

    // Agents (Bob workers).
    {
      selector: "node.agent",
      style: {
        shape: "ellipse",
        width: 20,
        height: 20,
        "background-color": t.textTertiary,
        "border-width": 2,
        "border-color": t.surface,
        label: "data(label)",
        color: "#FFFFFF",
        "font-size": 8,
        "font-weight": 700,
        "text-valign": "center",
        "text-halign": "center",
        "z-index": 999,
        "z-compound-depth": "top",
        events: "no",
      },
    },
    { selector: "node.agent.st-reading, node.agent.st-verifying", style: { "background-color": t.info } },
    { selector: "node.agent.st-editing, node.agent.st-retrying", style: { "background-color": t.warning } },
    { selector: "node.agent.st-blocked, node.agent.st-quarantined", style: { "background-color": t.error } },
    { selector: "node.agent.st-done", style: { "background-color": t.success, width: 14, height: 14, label: "" } },

    // Focus and filters.
    { selector: "node.focus", style: { "border-color": t.textPrimary, "border-width": 2.5 } },
    { selector: "edge.near", style: { opacity: 0.95, width: 1.75, "line-color": t.textSecondary, "target-arrow-color": t.textSecondary } },
    { selector: ".faded", style: { opacity: 0.12 } },
  ];
  return s as unknown as cytoscape.StylesheetStyle[];
}

function buildElements(graph: Graph) {
  const { out } = indexGraph(graph);
  const children = new Map<string, string[]>();
  for (const n of graph.nodes) {
    if (n.parent) children.set(n.parent, [...(children.get(n.parent) ?? []), n.id]);
  }
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const els: ElementDefinition[] = [];
  let maxY = 0;

  const placeAsset = (id: string, district: string, cx: number, top: number): number => {
    const n = byId.get(id)!;
    const kids = children.get(id) ?? [];
    const flags = [n.pii ? "pii" : "", n.tested ? "" : "untested"].filter(Boolean).join(" ");
    if (kids.length > 0) {
      els.push({ data: { id, label: n.name, parent: district }, classes: `asset compound ${flags}` });
      kids.forEach((kid, i) => {
        const k = byId.get(kid)!;
        const short = k.name.includes(".") ? k.name.split(".").slice(1).join(".") : k.name;
        els.push({
          data: { id: kid, label: short, parent: id },
          position: { x: cx, y: top + 24 + i * FIELD_STEP },
          classes: `field ${k.pii ? "pii" : ""}`,
        });
      });
      return 24 + kids.length * FIELD_STEP + 22;
    }
    // Building height shows fan-out: how many things depend on it.
    const fan = (out.get(id) ?? []).length;
    const h = 34 + Math.min(fan, 6) * 6;
    els.push({
      data: { id, label: n.name, parent: district, w: 184, h },
      position: { x: cx, y: top + h / 2 },
      classes: `asset leaf ${flags}`,
    });
    return h + 26;
  };

  // Districts left to right. A tall district wraps into more sub-columns
  // so the city keeps a sensible shape.
  const columns = graph.layers.filter((l) => l.column >= 0).sort((a, b) => a.column - b.column);
  const tallest = Math.max(...columns.map((l) => graph.nodes.filter((n) => n.layer === l.id).length));
  const maxColumnHeight = Math.max(900, Math.min(1500, tallest * 22));
  const estimate = (id: string) => {
    const kids = children.get(id)?.length ?? 0;
    return kids > 0 ? 24 + kids * FIELD_STEP + 22 : 34 + Math.min((out.get(id) ?? []).length, 6) * 6 + 26;
  };
  let x = 0;
  for (const layer of columns) {
    const district = `district:${layer.id}`;
    els.push({ data: { id: district, label: layer.label }, classes: "district", selectable: false });
    let cx = x + COL_W / 2;
    let y = 0;
    for (const n of graph.nodes.filter((nd) => nd.layer === layer.id && !nd.parent)) {
      if (y > 0 && y + estimate(n.id) > maxColumnHeight) {
        cx += COL_W + 24;
        y = 0;
      }
      y += placeAsset(n.id, district, cx, y);
      maxY = Math.max(maxY, y);
    }
    x = cx + COL_W / 2 + GAP;
  }

  // Tests and docs sit in a row under the city.
  const qDistrict = "district:quality";
  els.push({ data: { id: qDistrict, label: "Tests and docs" }, classes: "district", selectable: false });
  const qLabel = graph.layers.find((l) => l.column < 0)?.label ?? "Tests and docs";
  els[els.length - 1].data.label = qLabel;
  graph.nodes
    .filter((n) => n.layer === "quality" && !n.parent)
    .forEach((n, i) => placeAsset(n.id, qDistrict, i * (COL_W + GAP) + COL_W / 2, maxY + 90));

  // Big graphs get quieter roads; focus and impact bring them forward.
  const op = graph.edges.length > 150 ? 0.35 : 0.85;
  for (const e of graph.edges) {
    els.push({
      data: { id: e.id, source: e.from, target: e.to, type: e.type, op },
      classes: e.source === "bob" ? "bob" : "",
    });
  }
  return els;
}

export function CityMap({
  graph,
  selectedId,
  onSelect,
  severity,
  revealLevels,
  rippleKey,
  buildingState,
  agents,
  layerFilter = "all",
  className,
}: CityMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const onSelectRef = useRef(onSelect);
  const isDark = useIsDark();
  const elements = useMemo(() => buildElements(graph), [graph]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Create the map once per graph.
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      layout: { name: "preset" },
      style: buildStyle(readTokens()),
      minZoom: 0.25,
      maxZoom: 2.2,
      boxSelectionEnabled: false,
      autoungrabify: true,
    });
    cyRef.current = cy;
    cy.fit(undefined, 36);

    cy.on("tap", "node", (evt) => {
      const n = evt.target;
      if (n.hasClass("district") || n.hasClass("agent")) return;
      onSelectRef.current?.(n.id());
    });
    cy.on("tap", (evt) => {
      if (evt.target === cy) onSelectRef.current?.(null);
    });

    // Moving "traffic" on impacted roads.
    let offset = 0;
    let frame = 0;
    const tick = () => {
      offset = (offset - 0.6) % 1000;
      const impacted = cy.edges(".impacted");
      if (impacted.nonempty()) impacted.style("line-dash-offset", offset);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => cy.resize());
    ro.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, [elements]);

  // Re-theme when light/dark changes.
  useEffect(() => {
    cyRef.current?.style(buildStyle(readTokens()));
  }, [isDark]);

  // Severity, with an optional wave-by-wave ripple.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const sevClasses = "sev-breaking sev-needs_update sev-update sev-safe";
    cy.batch(() => {
      cy.nodes().removeClass(sevClasses);
      cy.edges().removeClass("impacted safe-edge");
    });
    if (!severity) return;

    const paintEdges = () => {
      cy.batch(() => {
        cy.edges().forEach((e) => {
          const s = severity[e.source().id()];
          const t = e.target();
          if (!t.hasClass("sev-breaking") && !t.hasClass("sev-needs_update") && !t.hasClass("sev-update") && !t.hasClass("sev-safe")) return;
          const ts = severity[t.id()];
          if (s === "breaking" && ts && ts !== "safe") e.addClass("impacted");
          else if (ts === "safe") e.addClass("safe-edge");
        });
      });
    };
    const paint = (ids: string[]) =>
      cy.batch(() => {
        for (const id of ids) {
          const s = severity[id];
          if (s) cy.getElementById(id).addClass(`sev-${s}`);
        }
      });

    if (!revealLevels) {
      paint(Object.keys(severity));
      paintEdges();
      return;
    }
    const timers = revealLevels.map((ids, i) =>
      setTimeout(() => {
        paint(ids);
        paintEdges();
      }, i * 420),
    );
    return () => timers.forEach(clearTimeout);
  }, [severity, revealLevels, rippleKey, elements]);

  // Building states from a live run.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const all =
      "bs-affected bs-awaiting_approval bs-under_construction bs-inspecting bs-blocked bs-fixed bs-needs_human";
    cy.batch(() => {
      cy.nodes().removeClass(all);
      cy.edges().removeClass("fixed-edge");
      for (const [unit, state] of Object.entries(buildingState ?? {})) {
        const el = cy.getElementById(unit);
        if (el.empty()) continue;
        el.addClass(`bs-${state}`);
        el.children().addClass(`bs-${state}`);
        if (state === "fixed") {
          el.union(el.children()).incomers("edge.impacted").addClass("fixed-edge");
        }
      }
    });
  }, [buildingState, elements]);

  // Agents walk from the city gate to the building they work on.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const wanted = new Set((agents ?? []).map((a) => `agent:${a.id}`));
    cy.nodes(".agent").forEach((n) => {
      if (!wanted.has(n.id())) n.remove();
    });
    const gate = { x: -COL_W, y: -40 };
    for (const a of agents ?? []) {
      const target = cy.getElementById(a.unit);
      if (target.empty()) continue;
      const bb = target.boundingBox({ includeLabels: false });
      const pos = { x: bb.x2 - 4, y: bb.y1 + 4 };
      const id = `agent:${a.id}`;
      let node = cy.getElementById(id);
      const cls = `agent st-${a.state}`;
      if (node.empty()) {
        node = cy.add({ group: "nodes", data: { id, label: a.label }, position: gate, classes: cls });
        node.animate({ position: pos }, { duration: 750, easing: "ease-in-out-cubic" });
      } else {
        node.classes(cls);
      }
    }
  }, [agents, elements]);

  // Focus: selected node, its neighbours, and the layer filter.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass("faded focus near");
      if (layerFilter !== "all") {
        cy.nodes().forEach((n) => {
          if (n.hasClass("agent")) return;
          const districtId = n.hasClass("district") ? n.id() : n.ancestors(".district").first().id();
          if (districtId !== `district:${layerFilter}`) n.addClass("faded");
        });
        cy.edges().addClass("faded");
      }
      if (selectedId) {
        const n = cy.getElementById(selectedId);
        if (n.nonempty()) {
          n.addClass("focus");
          const group = n.union(n.children());
          const keep = group
            .union(group.connectedEdges())
            .union(group.connectedEdges().connectedNodes());
          const withParents = keep.union(keep.nodes().ancestors());
          cy.elements().not(withParents).not(".agent").addClass("faded");
          withParents.removeClass("faded");
          group.connectedEdges().addClass("near");
        }
      }
    });
    // Bring the selected node and its neighbours into view.
    if (selectedId) {
      const n = cy.getElementById(selectedId);
      if (n.nonempty()) {
        const group = n.union(n.children());
        const around = group.union(group.connectedEdges().connectedNodes());
        cy.animate({ fit: { eles: around, padding: 60 }, duration: 350, easing: "ease-in-out-cubic" });
      }
    }
  }, [selectedId, layerFilter, elements]);

  const zoomBy = (factor: number) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  };

  const iconBtn =
    "cursor-pointer flex items-center justify-center size-9 bg-surface border border-border rounded-lg text-icon-secondary hover:text-text-primary hover:bg-surface-hover hover:border-border-strong shadow-2xs active:scale-95 transition-all duration-150";

  return (
    <div className={cn("relative rounded-xl border border-border overflow-hidden city-canvas", className)}>
      {/* Cytoscape sets its own container to position: relative, so it needs a sized wrapper. */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="w-full h-full" />
      </div>
      <div className="absolute bottom-3 right-3 flex flex-col gap-2 select-none">
        <button className={iconBtn} onClick={() => zoomBy(1.2)} aria-label="Zoom in">
          <Plus className="size-4" />
        </button>
        <button className={iconBtn} onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">
          <Minus className="size-4" />
        </button>
        <button className={iconBtn} onClick={() => cyRef.current?.fit(undefined, 36)} aria-label="Fit to screen">
          <Maximize2 className="size-4" />
        </button>
      </div>
    </div>
  );
}
