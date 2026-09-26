"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { type Core, type EdgeSingular, type ElementDefinition, type Position } from "cytoscape";
import { Expand, LocateFixed, Minus, Plus, RotateCcw, Shrink, Sparkles } from "lucide-react";
import { registerSnapshot } from "@/lib/city-export";
import { useFullscreen } from "@/lib/use-fullscreen";
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
  /** Show a full-screen button on the map. Off when the page has its own (Agent City toolbar). */
  fullscreen?: boolean;
  /** Node id the AI is analysing from. While set, the map plays the "scanning the graph" effect. */
  scanning?: string | null;
  className?: string;
}

// ---------------------------------------------------------------------------
// Effects layer: a canvas on top of the map for ripple rings and sparks that
// run along edges. Effects point at node and edge ids, so they follow pan and zoom.
// ---------------------------------------------------------------------------

interface Ring {
  id: string;
  t0: number;
  dur: number;
  color: string;
  /** Final radius in graph units. */
  max: number;
  width: number;
}

interface Spark {
  edge: string;
  t0: number;
  dur: number;
  color: string;
  /** Run from target to source. */
  reverse: boolean;
}

interface Fx {
  rings: Ring[];
  sparks: Spark[];
  /** The changed node: sends out a ring every so often while the impact is shown. */
  epicenter: string | null;
  lastEpicenter: number;
  /** The node the AI scan starts from. */
  scanSource: string | null;
  lastScan: number;
  reduced: boolean;
}

function edgePath(e: EdgeSingular): Position[] {
  const pts = [e.renderedSourceEndpoint()];
  try {
    pts.push(...(e.renderedSegmentPoints() ?? []));
  } catch {
    // Straight edges have no segment points.
  }
  pts.push(e.renderedTargetEndpoint());
  return pts;
}

function pointAlong(pts: Position[], p: number): Position {
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    lens.push(l);
    total += l;
  }
  let d = Math.max(0, Math.min(1, p)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const f = lens[i] ? d / lens[i] : 0;
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f };
    }
    d -= lens[i];
  }
  return pts[0];
}

const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

function drawFx(cy: Core, ctx: CanvasRenderingContext2D, fx: Fx, now: number) {
  const zoom = Math.max(cy.zoom(), 0.45);
  fx.rings = fx.rings.filter((r) => now - r.t0 < r.dur);
  fx.sparks = fx.sparks.filter((s) => now - s.t0 < s.dur);
  for (const r of fx.rings) {
    if (now < r.t0) continue;
    const n = cy.getElementById(r.id);
    if (n.empty()) continue;
    const p = (now - r.t0) / r.dur;
    const { x, y } = n.renderedPosition();
    const radius = (14 + easeOut(p) * r.max) * zoom;
    ctx.globalAlpha = (1 - p) * 0.12;
    ctx.fillStyle = r.color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = (1 - p) * 0.75;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.width * (1 - p) + 0.6;
    ctx.stroke();
  }
  for (const s of fx.sparks) {
    if (now < s.t0) continue;
    const e = cy.getElementById(s.edge);
    if (e.empty() || !e.isEdge()) continue;
    const pts = edgePath(e as EdgeSingular);
    if (s.reverse) pts.reverse();
    const p = easeOut((now - s.t0) / s.dur);
    ctx.fillStyle = s.color;
    ctx.shadowColor = s.color;
    // A bright head and a short fading tail.
    for (let k = 6; k >= 0; k--) {
      const at = pointAlong(pts, p - k * 0.035);
      ctx.globalAlpha = k === 0 ? 1 : 0.5 * (1 - k / 7);
      ctx.shadowBlur = k === 0 ? 12 : 0;
      ctx.beginPath();
      ctx.arc(at.x, at.y, (k === 0 ? 3.6 : 2.6 - k * 0.25) * Math.min(1.4, zoom + 0.3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

/** What the scan HUD says as the scan moves along. */
const SCAN_PHASES = [
  "Reading the knowledge graph",
  "Tracing every reference",
  "Following imports, types and docs",
  "Scoring risk and planning fix waves",
];

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

    // AI scan: everything dims, then lights up as the scan reaches it.
    { selector: ".scan-dim", style: { opacity: 0.28 } },
    { selector: "node.scan-hit", style: { opacity: 1, "border-color": t.info, "border-width": 2, "underlay-color": t.info, "underlay-padding": 5, "underlay-opacity": 0.14, "underlay-shape": "round-rectangle" } },
    { selector: "edge.scan-edge", style: { opacity: 0.9, "line-color": t.info, "target-arrow-color": t.info, width: 1.75 } },
    // Breaking nodes glow; the glow pulses (see the animation loop).
    { selector: "node.sev-breaking", style: { "underlay-color": t.error, "underlay-padding": 7, "underlay-opacity": 0.16, "underlay-shape": "round-rectangle" } },

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
  fullscreen = true,
  scanning = null,
  className,
}: CityMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<Fx>({ rings: [], sparks: [], epicenter: null, lastEpicenter: 0, scanSource: null, lastScan: 0, reduced: false });
  const colors = useRef<Tokens | null>(null);
  const { ref: fsRef, isFullscreen, toggle: toggleFullscreen } = useFullscreen<HTMLDivElement>();
  const [replay, setReplay] = useState(0);
  const [ripple, setRipple] = useState<{ wave: number; waves: number; hit: number; total: number } | null>(null);
  const [scan, setScan] = useState<{ nodes: number; edges: number; totalEdges: number; progress: number } | null>(null);
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

    const fx = fxRef.current;
    fx.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canvas = fxCanvasRef.current;
    const ctx = canvas?.getContext("2d") ?? null;
    const sizeCanvas = () => {
      if (!canvas || !containerRef.current) return;
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth: w, clientHeight: h } = containerRef.current;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    sizeCanvas();

    // Moving "traffic" on impacted roads, pulsing glow on breaking nodes, rings and sparks.
    let offset = 0;
    let frame = 0;
    let wasDrawing = false;
    const tick = () => {
      const now = performance.now();
      offset = (offset - 0.6) % 1000;
      const impacted = cy.edges(".impacted");
      if (impacted.nonempty()) impacted.style("line-dash-offset", offset);
      const tokens = colors.current;
      if (!fx.reduced && tokens) {
        const breaking = cy.nodes(".sev-breaking");
        if (breaking.nonempty()) breaking.style("underlay-opacity", 0.1 + 0.14 * (0.5 + 0.5 * Math.sin(now / 260)));
        if (fx.epicenter && now - fx.lastEpicenter > 1500) {
          fx.lastEpicenter = now;
          fx.rings.push({ id: fx.epicenter, t0: now, dur: 1700, color: tokens.error, max: 150, width: 2.5 });
        }
        if (fx.scanSource && now - fx.lastScan > 650) {
          fx.lastScan = now;
          fx.rings.push({ id: fx.scanSource, t0: now, dur: 1400, color: tokens.info, max: 260, width: 2 });
        }
      }
      if (ctx && canvas) {
        const drawing = fx.rings.length > 0 || fx.sparks.length > 0;
        if (drawing || wasDrawing) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (drawing) drawFx(cy, ctx, fx, now);
        }
        wasDrawing = drawing;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // Redraw straight away after a resize (for example when a scrollbar appears),
    // so the map never shows a blank frame.
    const ro = new ResizeObserver(() => {
      cy.resize();
      cy.forceRender();
      sizeCanvas();
    });
    ro.observe(containerRef.current);

    const unregister = registerSnapshot(() =>
      cy.png({ output: "base64uri", full: true, scale: 2, bg: readTokens().background }),
    );

    return () => {
      unregister();
      cancelAnimationFrame(frame);
      ro.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, [elements]);

  // Entering or leaving full screen changes the size: refit once the new size has settled.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const t = setTimeout(() => {
      cy.resize();
      cy.stop(true, true);
      cy.fit(undefined, 36);
    }, 120);
    return () => clearTimeout(t);
  }, [isFullscreen]);

  // Re-theme when light/dark changes. The effects layer reads its colours from here.
  useEffect(() => {
    colors.current = readTokens();
    cyRef.current?.style(buildStyle(colors.current));
  }, [isDark]);

  // Severity, with an optional wave-by-wave ripple.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const fx = fxRef.current;
    const sevClasses = "sev-breaking sev-needs_update sev-update sev-safe";
    cy.batch(() => {
      cy.nodes().removeClass(sevClasses).removeStyle("underlay-opacity");
      cy.edges().removeClass("impacted safe-edge");
    });
    fx.epicenter = null;
    fx.rings = fx.rings.filter((r) => r.id === fx.scanSource);
    fx.sparks = [];
    setRipple(null);
    if (!severity) return;
    const tokens = colors.current ?? readTokens();
    const sevColor: Record<Severity, string> = { breaking: tokens.error, needs_update: tokens.warning, update: tokens.info, safe: tokens.textTertiary };
    const affected = Object.values(severity).filter((v) => v !== "safe").length;

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

    // Each hit node sends out a ring in its colour and "pops". Sparks run down the
    // roads into the nodes this wave reaches, so the ripple visibly travels.
    const burst = (ids: string[], wave: number) => {
      if (fx.reduced) return;
      const now = performance.now();
      const hit = new Set(ids);
      for (const id of ids) {
        const s = severity[id];
        if (!s || s === "safe") continue;
        fx.rings.push({ id, t0: now + Math.random() * 120, dur: 1100, color: sevColor[s], max: wave === 0 ? 120 : 70, width: wave === 0 ? 3 : 2 });
        const n = cy.getElementById(id);
        if (n.nonempty() && !n.isParent()) {
          n.animate(
            { style: { "border-width": 5 } },
            { duration: 160, complete: () => void n.animate({ style: { "border-width": 2 } }, { duration: 280, complete: () => void n.removeStyle("border-width") }) },
          );
        }
      }
      if (wave === 0) return;
      let count = 0;
      cy.edges().forEach((e) => {
        if (count > 60) return;
        const src = e.source().id();
        const tgt = e.target().id();
        const into = hit.has(tgt) && severity[src] && severity[src] !== "safe" && !hit.has(src);
        const back = hit.has(src) && severity[tgt] && severity[tgt] !== "safe" && !hit.has(tgt);
        if (!into && !back) return;
        const s = severity[into ? tgt : src]!;
        fx.sparks.push({ edge: e.id(), t0: now, dur: 520, color: sevColor[s], reverse: Boolean(back) });
        count++;
      });
    };

    if (!revealLevels) {
      paint(Object.keys(severity));
      paintEdges();
      return;
    }
    fx.epicenter = revealLevels[0]?.[0] ?? null;
    // Zoom to the part of the city the change reaches, so the ripple is easy to follow.
    const reach = cy.collection();
    for (const id of Object.keys(severity)) {
      if (severity[id] === "safe") continue;
      const n = cy.getElementById(id);
      if (n.nonempty()) reach.merge(n.isChild() && n.parent().nonempty() && !n.parent().first().hasClass("district") ? n.parent() : n);
    }
    if (reach.nonempty()) cy.animate({ fit: { eles: reach, padding: 70 }, duration: 650, easing: "ease-in-out-cubic" });
    fx.lastEpicenter = performance.now() + revealLevels.length * 420;
    const waves = revealLevels.length;
    let hitSoFar = 0;
    const timers = revealLevels.map((ids, i) =>
      setTimeout(() => {
        paint(ids);
        paintEdges();
        burst(ids, i);
        hitSoFar += ids.filter((id) => severity[id] && severity[id] !== "safe").length;
        setRipple({ wave: i + 1, waves, hit: Math.min(hitSoFar, affected), total: affected });
      }, i * 420),
    );
    return () => timers.forEach(clearTimeout);
  }, [severity, revealLevels, rippleKey, elements, replay]);

  // AI scan: a wave of light spreads out from the node through every link,
  // while rings pulse from the start node. Plays while `scanning` is set.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const fx = fxRef.current;
    const info = (colors.current ?? readTokens()).info;
    const clear = () => {
      cy.batch(() => cy.elements().removeClass("scan-dim scan-hit scan-edge"));
      fx.scanSource = null;
      fx.rings = fx.rings.filter((r) => r.color !== info);
      fx.sparks = fx.sparks.filter((sp) => sp.color !== info);
    };
    // Leaving the scan is handled by the cleanup below; the HUD hides when `scanning` is null.
    if (!scanning) return;
    const start = cy.getElementById(scanning);
    if (start.empty()) return;
    fx.scanSource = scanning;
    fx.lastScan = 0;

    // Breadth-first, in both directions, one step at a time.
    type Step = { nodes: cytoscape.NodeCollection; edges: cytoscape.EdgeCollection };
    let frontier: cytoscape.NodeCollection = start.union(start.children()).union(start.parent().not(".district")).nodes();
    let seen = frontier as unknown as cytoscape.Collection;
    const steps: Step[] = [{ nodes: frontier, edges: cy.collection().edges() }];
    while (steps.length < 14) {
      const edges = frontier.connectedEdges().filter((e) => !seen.has(e));
      if (edges.empty()) break;
      const raw = edges.connectedNodes().not(seen);
      const next = raw.union(raw.parent().not(".district")).not(seen).nodes();
      seen = seen.union(edges).union(next);
      steps.push({ nodes: next, edges });
      if (next.empty()) break;
      frontier = next.union(next.children()).nodes();
    }

    const totalEdges = cy.edges().length;
    cy.batch(() => cy.elements().not(".district, .agent").addClass("scan-dim"));
    const stepMs = Math.max(160, Math.min(420, 2200 / steps.length));
    let nodes = 0;
    let links = 0;
    const timers = steps.map((st, i) =>
      setTimeout(() => {
        cy.batch(() => {
          st.nodes.removeClass("scan-dim").addClass("scan-hit");
          st.edges.removeClass("scan-dim").addClass("scan-edge");
        });
        nodes += st.nodes.filter((n) => !n.isParent()).length;
        links += st.edges.length;
        if (!fx.reduced) {
          const now = performance.now();
          const reached = new Set(st.nodes.map((n) => n.id()));
          st.edges.slice(0, 70).forEach((e) => {
            fx.sparks.push({ edge: e.id(), t0: now + Math.random() * 90, dur: stepMs + 160, color: info, reverse: reached.has(e.source().id()) });
          });
        }
        setScan({ nodes, edges: links, totalEdges, progress: (i + 1) / steps.length });
      }, i * stepMs),
    );
    // After the walk, every link has been checked.
    timers.push(setTimeout(() => setScan({ nodes, edges: totalEdges, totalEdges, progress: 1 }), steps.length * stepMs + 200));
    return () => {
      timers.forEach(clearTimeout);
      clear();
    };
  }, [scanning, elements]);

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
          // A fixed building stops glowing red.
          el.union(el.children()).removeClass("sev-breaking").removeStyle("underlay-opacity");
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
  const phase = scan ? SCAN_PHASES[Math.min(SCAN_PHASES.length - 1, Math.floor(scan.progress * SCAN_PHASES.length))] : "";

  return (
    <div
      ref={fsRef}
      className={cn(
        "relative rounded-xl border border-border overflow-hidden city-canvas",
        className,
        isFullscreen && "!h-auto rounded-none border-0 bg-background",
      )}
    >
      {/* Cytoscape sets its own container to position: relative, so it needs a sized wrapper. */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="w-full h-full" />
      </div>
      <canvas ref={fxCanvasRef} className="absolute inset-0 pointer-events-none" aria-hidden />

      {/* AI scan HUD. */}
      {scanning && scan ? (
        <div className="absolute top-3 left-3 right-16 sm:right-auto flex flex-col gap-2 sm:w-80 px-3.5 py-3 rounded-xl border border-border bg-surface/90 backdrop-blur-sm shadow-xs select-none animate-in fade-in slide-in-from-top-1 duration-300">
          <div className="flex items-center gap-2">
            <span className="relative flex size-5 items-center justify-center rounded-md bg-info-soft text-info">
              <Sparkles className="size-3.5 animate-pulse" />
              <span className="absolute inset-0 rounded-md ring-2 ring-info/40 animate-ping" />
            </span>
            <span className="text-body font-semibold text-text-primary">AI is analysing the graph</span>
          </div>
          <span key={phase} className="type-caption animate-in fade-in duration-300">
            {phase}…
          </span>
          <div className="h-1.5 rounded-full bg-surface-secondary overflow-hidden">
            <div className="h-full rounded-full bg-info transition-[width] duration-300 ease-out ai-bar" style={{ width: `${Math.round(8 + scan.progress * 92)}%` }} />
          </div>
          <span className="type-caption tabular-nums">
            {scan.edges} of {scan.totalEdges} links checked · {scan.nodes} components reached
          </span>
        </div>
      ) : ripple ? (
        <div className="absolute top-3 left-3 flex items-center gap-2.5 pl-3 pr-1.5 py-1.5 rounded-xl border border-border bg-surface/90 backdrop-blur-sm shadow-xs select-none animate-in fade-in slide-in-from-top-1 duration-300">
          <span className="relative flex size-2.5">
            {ripple.wave < ripple.waves ? <span className="absolute inset-0 rounded-full bg-error animate-ping" /> : null}
            <span className="relative size-2.5 rounded-full bg-error" />
          </span>
          <span className="text-body text-text-secondary tabular-nums">
            {ripple.wave < ripple.waves ? (
              <>
                Ripple spreading · step <span className="font-semibold text-text-primary">{ripple.wave}</span> of {ripple.waves} ·{" "}
                <span className="font-semibold text-text-primary">{ripple.hit}</span> hit
              </>
            ) : (
              <>
                Ripple reached <span className="font-semibold text-text-primary">{ripple.total}</span> components in {ripple.waves} {ripple.waves === 1 ? "step" : "steps"}
              </>
            )}
          </span>
          <button
            className="cursor-pointer flex items-center justify-center size-7 rounded-lg text-icon-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
            onClick={() => setReplay((r) => r + 1)}
            aria-label="Replay the ripple"
            title="Replay the ripple"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      ) : null}

      {/* Full screen, zoom and fit. */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-2 select-none">
        {fullscreen ? (
          <button
            className={iconBtn}
            onClick={() => void toggleFullscreen()}
            aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
            title={isFullscreen ? "Exit full screen (Esc)" : "Full screen"}
          >
            {isFullscreen ? <Shrink className="size-4" /> : <Expand className="size-4" />}
          </button>
        ) : null}
        <button className={iconBtn} onClick={() => zoomBy(1.2)} aria-label="Zoom in" title="Zoom in">
          <Plus className="size-4" />
        </button>
        <button className={iconBtn} onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out" title="Zoom out">
          <Minus className="size-4" />
        </button>
        <button
          className={iconBtn}
          onClick={() => cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 36 }, duration: 300 })}
          aria-label="Fit to screen"
          title="Fit everything in view"
        >
          <LocateFixed className="size-4" />
        </button>
      </div>
      {isFullscreen ? (
        <span className="absolute bottom-3 left-3 type-caption px-2 py-1 rounded-lg bg-surface/85 border border-border select-none">Esc to exit full screen</span>
      ) : null}
    </div>
  );
}
