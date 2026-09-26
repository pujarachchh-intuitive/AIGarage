"use client";

import { useEffect, useMemo, useRef } from "react";
import cytoscape, { type Collection, type Core, type ElementDefinition } from "cytoscape";
import { Minus, Plus, Scan, ShieldAlert } from "lucide-react";
import { registerSnapshot } from "@/lib/city-export";
import { BRAND, STATE, accentForLayer } from "@/lib/palette";
import type { AgentState, BuildingState } from "@/lib/run-state";
import { useIsDark } from "@/lib/theme";
import { readTokens, type Tokens } from "@/lib/tokens";
import type { Graph, GraphNode, LayerId, Severity } from "@/lib/types";
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
  /** Accepted for compatibility; full screen lives in the Agent City toolbar. */
  fullscreen?: boolean;
  /** Node id the AI is analysing from. While set, the map shows the scanning glow. */
  scanning?: string | null;
  className?: string;
}

// ---------------------------------------------------------------------------
// Layout (graph units). Cytoscape draws card bodies, bands and edges; an HTML
// overlay, kept in sync with the viewport, draws the typography and glyphs.
// ---------------------------------------------------------------------------
const CARD_W = 184;
const LEAF_H = 52;
const HEAD_H = 50;
const ROW_H = 26;
const ROW_GAP = 4;
const BOX_PAD = 8;
const CARD_GAP = 14;
const SUB_GAP = 14;
const COL_GAP = 44;
const BAND_PAD = 10;
const BAND_HEAD = 50;
const QUALITY_GAP = 48;

const TYPE_LABEL: Partial<Record<GraphNode["type"], string>> = {
  SQLModel: "sql model",
  SparkJob: "spark job",
  ORMModel: "orm model",
  TSType: "ts type",
  TSField: "field",
  BusinessProcess: "process",
};
const typeLabel = (t: GraphNode["type"]) => TYPE_LABEL[t] ?? t.toLowerCase();

interface Card {
  id: string;
  kind: "leaf" | "box" | "field";
  x: number;
  y: number;
  w: number;
  h: number;
  node: GraphNode;
  label: string;
  accent: string;
  bob: number;
  pii: boolean;
}

interface Header {
  id: string;
  label: string;
  count: number;
  accent: string;
  x: number;
  y: number;
  w: number;
}

function boxHeight(kids: number) {
  return HEAD_H + kids * (ROW_H + ROW_GAP) - ROW_GAP + BOX_PAD;
}

function buildLayout(graph: Graph) {
  const children = new Map<string, GraphNode[]>();
  for (const n of graph.nodes) {
    if (n.parent) children.set(n.parent, [...(children.get(n.parent) ?? []), n]);
  }
  const bobCount = new Map<string, number>();
  for (const e of graph.edges) {
    if (e.source !== "bob") continue;
    bobCount.set(e.from, (bobCount.get(e.from) ?? 0) + 1);
    bobCount.set(e.to, (bobCount.get(e.to) ?? 0) + 1);
  }
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const els: ElementDefinition[] = [];
  const cards: Card[] = [];
  const headers: Header[] = [];
  const heightOf = (n: GraphNode) => {
    const k = children.get(n.id)?.length ?? 0;
    return k > 0 ? boxHeight(k) : LEAF_H;
  };

  const place = (n: GraphNode, left: number, top: number, accent: string) => {
    const kids = children.get(n.id) ?? [];
    const h = heightOf(n);
    const cx = left + CARD_W / 2;
    const kind = kids.length > 0 ? "box" : "leaf";
    const bob = (bobCount.get(n.id) ?? 0) + kids.reduce((s, k) => s + (bobCount.get(k.id) ?? 0), 0);
    els.push({
      data: { id: n.id, w: CARD_W, h, layer: n.layer },
      position: { x: cx, y: top + h / 2 },
      classes: `asset ${kind}`,
    });
    cards.push({ id: n.id, kind, x: left, y: top, w: CARD_W, h, node: n, label: n.name, accent, bob, pii: n.pii });
    kids.forEach((k, i) => {
      const w = CARD_W - BOX_PAD * 2;
      const y = top + HEAD_H + i * (ROW_H + ROW_GAP);
      const short = k.name.includes(".") ? k.name.split(".").slice(1).join(".") : k.name;
      els.push({
        data: { id: k.id, w, h: ROW_H, layer: k.layer, owner: n.id },
        position: { x: cx, y: y + ROW_H / 2 },
        classes: "field",
      });
      cards.push({ id: k.id, kind: "field", x: left + BOX_PAD, y, w, h: ROW_H, node: k, label: short, accent, bob: bobCount.get(k.id) ?? 0, pii: k.pii });
    });
    return h;
  };

  // Layers left to right. A tall layer wraps into sub-columns so the map
  // keeps a landscape shape that fills a wide canvas.
  const columns = graph.layers.filter((l) => l.column >= 0).sort((a, b) => a.column - b.column);
  const roots = (layer: string) => graph.nodes.filter((n) => n.layer === layer && !n.parent);
  const totals = columns.map((l) => roots(l.id).reduce((s, n) => s + heightOf(n) + CARD_GAP, 0));
  const tallestCard = Math.max(LEAF_H, ...graph.nodes.filter((n) => !n.parent).map(heightOf));
  const maxH = Math.max(tallestCard, 520, Math.min(1300, Math.max(0, ...totals) / 3));

  let x = 0;
  let maxY = 0;
  const spans: { id: string; x0: number; x1: number }[] = [];
  for (const layer of columns) {
    const accent = accentForLayer(graph.layers, layer.id);
    let left = x;
    let y = 0;
    for (const n of roots(layer.id)) {
      const h = heightOf(n);
      if (y > 0 && y + h > maxH) {
        left += CARD_W + SUB_GAP;
        y = 0;
      }
      place(n, left, y, accent);
      y += h + CARD_GAP;
      maxY = Math.max(maxY, y - CARD_GAP);
    }
    const x1 = left + CARD_W;
    spans.push({ id: layer.id, x0: x, x1 });
    headers.push({
      id: layer.id,
      label: layer.label,
      count: graph.nodes.filter((n) => n.layer === layer.id).length,
      accent,
      x: x - BAND_PAD,
      y: -BAND_HEAD,
      w: x1 - x + BAND_PAD * 2,
    });
    x = x1 + COL_GAP;
  }
  const totalW = Math.max(CARD_W, x - COL_GAP);
  // Equal-height bands read as a calm grid.
  for (const s of spans) {
    const w = s.x1 - s.x0 + BAND_PAD * 2;
    const h = maxY + BAND_HEAD + BAND_PAD;
    els.push({
      data: { id: `band:${s.id}`, w, h, layer: s.id },
      position: { x: (s.x0 + s.x1) / 2, y: -BAND_HEAD + h / 2 },
      classes: "band",
      selectable: false,
    });
  }

  // Tests and docs sit in a row under the map.
  const qLayer = graph.layers.find((l) => l.column < 0);
  const qNodes = graph.nodes.filter((n) => n.layer === (qLayer?.id ?? "quality") && !n.parent);
  if (qNodes.length > 0) {
    const qid = qLayer?.id ?? "quality";
    const accent = accentForLayer(graph.layers, qid);
    const top = maxY + BAND_PAD + QUALITY_GAP;
    const perRow = Math.max(1, Math.floor((totalW + SUB_GAP) / (CARD_W + SUB_GAP)));
    let rowTop = top;
    let rowH = 0;
    let usedW = 0;
    qNodes.forEach((n, i) => {
      const col = i % perRow;
      if (col === 0 && i > 0) {
        rowTop += rowH + CARD_GAP;
        rowH = 0;
      }
      const left = col * (CARD_W + SUB_GAP);
      rowH = Math.max(rowH, place(n, left, rowTop, accent));
      usedW = Math.max(usedW, left + CARD_W);
    });
    const w = usedW + BAND_PAD * 2;
    const h = rowTop + rowH - top + BAND_HEAD + BAND_PAD;
    els.push({
      data: { id: `band:${qid}`, w, h, layer: qid },
      position: { x: usedW / 2, y: top - BAND_HEAD + h / 2 },
      classes: "band",
      selectable: false,
    });
    headers.push({
      id: qid,
      label: qLayer?.label ?? "Tests and docs",
      count: graph.nodes.filter((n) => n.layer === qid).length,
      accent,
      x: -BAND_PAD,
      y: top - BAND_HEAD,
      w,
    });
  }

  const quality = new Set(qNodes.flatMap((n) => [n.id, ...(children.get(n.id) ?? []).map((k) => k.id)]));
  for (const e of graph.edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    const cls = [e.source === "bob" ? "bob" : "parser"];
    if (quality.has(e.from) || quality.has(e.to)) cls.push("vert");
    else if (byId.get(e.from)!.layer === byId.get(e.to)!.layer) cls.push("same");
    els.push({ data: { id: e.id, source: e.from, target: e.to, type: e.type }, classes: cls.join(" ") });
  }
  return { els, cards, headers };
}

// ---------------------------------------------------------------------------
// Canvas styles
// ---------------------------------------------------------------------------
function buildStyle(t: Tokens, dark: boolean, dense: boolean) {
  const acid = dark ? BRAND.acid : BRAND.acidInk;
  const neutral = dark ? "#6E7068" : "#8C8E86";
  const card = dark ? mix(t.surface, "#FFFFFF", 0.02) : t.surface;
  const cardBorder = dark ? mix(t.surface, "#FFFFFF", 0.1) : mix(t.surface, "#000000", 0.1);
  const row = dark ? mix(t.surface, "#FFFFFF", 0.045) : mix(t.surface, "#000000", 0.035);
  const band = dark ? mix(t.background, "#FFFFFF", 0.022) : mix(t.background, "#000000", 0.022);
  const bandBorder = dark ? mix(t.background, "#FFFFFF", 0.06) : mix(t.background, "#000000", 0.06);
  const edgeOp = dense ? 0.28 : 0.6;

  const s: { selector: string; style: Record<string, unknown> }[] = [
    {
      selector: "node",
      style: {
        label: "",
        shape: "round-rectangle",
        width: "data(w)",
        height: "data(h)",
        "overlay-opacity": 0,
        "transition-property": "background-color, border-color, opacity, outline-width",
        "transition-duration": 220,
      },
    },
    {
      selector: "node.band",
      style: {
        "corner-radius": 18,
        "background-color": band,
        "border-width": 1,
        "border-color": bandBorder,
        events: "no",
        "z-index": 0,
      },
    },
    {
      selector: "node.asset",
      style: {
        "corner-radius": 10,
        "background-color": card,
        "border-width": 1,
        "border-color": cardBorder,
        "z-index": 10,
        "outline-color": acid,
        "outline-opacity": 0.35,
        "outline-offset": 2,
      },
    },
    {
      selector: "node.field",
      style: {
        "corner-radius": 6,
        "background-color": row,
        "border-width": 0,
        "border-color": cardBorder,
        "z-index": 20,
        "outline-color": acid,
        "outline-opacity": 0.35,
      },
    },
    {
      selector: "edge",
      style: {
        width: 1.2,
        "line-color": neutral,
        "target-arrow-color": neutral,
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.7,
        "curve-style": "round-taxi",
        "taxi-direction": "rightward",
        "taxi-turn": "50%",
        "taxi-turn-min-distance": 16,
        "taxi-radius": 12,
        "source-distance-from-node": 1,
        "target-distance-from-node": 2,
        opacity: edgeOp,
        "z-index": 5,
        "transition-property": "opacity, line-color, width",
        "transition-duration": 220,
      },
    },
    { selector: "edge.same", style: { "curve-style": "bezier", "control-point-step-size": 40 } },
    { selector: "edge.vert", style: { "taxi-direction": "vertical" } },
    {
      selector: "edge.bob",
      style: {
        "line-color": acid,
        "target-arrow-color": acid,
        "line-style": "dashed",
        "line-dash-pattern": [5, 4],
        opacity: Math.min(1, edgeOp + 0.2),
      },
    },

    // Severity (impact analysis).
    { selector: "node.sev-breaking", style: { "border-color": STATE.impact, "border-width": 1.5, "background-color": mix(card, STATE.impact, dark ? 0.16 : 0.1) } },
    { selector: "node.sev-needs_update", style: { "border-color": t.warning, "border-width": 1.5, "background-color": mix(card, t.warning, dark ? 0.14 : 0.1) } },
    { selector: "node.sev-update", style: { "border-color": t.info, "border-width": 1.5, "background-color": mix(card, t.info, dark ? 0.14 : 0.08) } },
    { selector: "node.sev-safe", style: { opacity: 0.45 } },
    { selector: "edge.impacted", style: { "line-color": STATE.impact, "target-arrow-color": STATE.impact, width: 2, "line-style": "dashed", "line-dash-pattern": [6, 4], opacity: 1, "z-index": 40 } },
    { selector: "edge.safe-edge", style: { opacity: 0.15 } },

    // Building states (live run). Listed after severity so they win.
    { selector: "node.bs-awaiting_approval", style: { "border-color": t.warning, "border-width": 2, "background-color": mix(card, t.warning, 0.14) } },
    { selector: "node.bs-under_construction", style: { "border-color": t.warning, "border-width": 2, "border-style": "dashed", "background-color": mix(card, t.warning, 0.14) } },
    { selector: "node.bs-inspecting", style: { "border-color": t.info, "border-width": 2, "background-color": mix(card, t.info, 0.12) } },
    { selector: "node.bs-blocked", style: { "border-color": STATE.blocked, "border-width": 2.5, "background-color": mix(card, STATE.blocked, 0.16) } },
    { selector: "node.bs-needs_human", style: { "border-color": t.warning, "border-width": 2.5, "background-color": mix(card, t.warning, 0.16) } },
    { selector: "node.bs-fixed", style: { "border-color": STATE.fixed, "border-width": 2, "border-style": "solid", "background-color": mix(card, STATE.fixed, 0.14) } },
    { selector: "edge.fixed-edge", style: { "line-color": STATE.fixed, "target-arrow-color": STATE.fixed, "line-style": "solid", width: 1.75 } },

    // Agents (Bob workers).
    {
      selector: "node.agent",
      style: {
        shape: "ellipse",
        width: 20,
        height: 20,
        "background-color": t.textTertiary,
        "border-width": 2,
        "border-color": card,
        label: "data(label)",
        color: "#FFFFFF",
        "font-family": t.font,
        "font-size": 8,
        "font-weight": 700,
        "text-valign": "center",
        "text-halign": "center",
        "z-index": 999,
        events: "no",
      },
    },
    { selector: "node.agent.st-reading, node.agent.st-verifying", style: { "background-color": t.info } },
    { selector: "node.agent.st-editing, node.agent.st-retrying", style: { "background-color": t.warning } },
    { selector: "node.agent.st-blocked, node.agent.st-quarantined", style: { "background-color": STATE.blocked } },
    { selector: "node.agent.st-done", style: { "background-color": STATE.fixed, width: 14, height: 14, label: "" } },

    // Focus, paths and the layer filter.
    { selector: "node.ctx", style: { opacity: 0.28 } },
    { selector: "node.ctx-near", style: { opacity: 0.72 } },
    { selector: "edge.ctx", style: { opacity: 0.08 } },
    { selector: "edge.lane", style: { opacity: 0.85 } },
    { selector: ".dim", style: { opacity: 0.2 } },
    { selector: "edge.dim", style: { opacity: 0.07 } },
    { selector: "node.hover", style: { "border-color": dark ? mix(t.surface, "#FFFFFF", 0.32) : mix(t.surface, "#000000", 0.32) } },
    { selector: "edge.hoverpath", style: { "line-color": t.textPrimary, "target-arrow-color": t.textPrimary, width: 1.6, opacity: 0.85, "z-index": 30 } },
    { selector: "edge.hoverpath.bob", style: { "line-color": acid, "target-arrow-color": acid } },
    { selector: "edge.path", style: { "line-color": acid, "target-arrow-color": acid, width: 2, opacity: 1, "z-index": 50 } },
    { selector: "node.onpath", style: { "border-color": dark ? mix(acid, t.surface, 0.45) : mix(acid, t.surface, 0.35) } },
    { selector: "node.focus", style: { "border-color": acid, "border-width": 1.5, "outline-width": 4 } },
  ];
  return s as unknown as cytoscape.StylesheetStyle[];
}

/** Mixes two #rrggbb colours. */
function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [ar, ag, ab] = p(a);
  const [br, bg, bb] = p(b);
  return (
    "#" +
    [ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]
      .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

// ---------------------------------------------------------------------------
// Overlay content
// ---------------------------------------------------------------------------
function Hatch() {
  return (
    <span
      aria-hidden
      title="No tests"
      className="absolute top-0 right-0 size-4 text-text-tertiary opacity-70"
      style={{
        clipPath: "polygon(0 0, 100% 0, 100% 100%)",
        backgroundImage: "repeating-linear-gradient(135deg, currentColor 0 1px, transparent 1px 4px)",
      }}
    />
  );
}

function Glyphs({ card, dark }: { card: Card; dark: boolean }) {
  const n = card.node;
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      {card.pii ? <ShieldAlert className="size-3" style={{ color: STATE.pii }} aria-label="Personal data" /> : null}
      {card.bob > 0 ? (
        <span
          className="font-mono text-[9.5px] leading-none px-1 py-[2px] rounded-[4px] border border-dashed"
          style={{ color: dark ? BRAND.acid : BRAND.acidInk, borderColor: dark ? "rgba(216,245,63,0.45)" : "rgba(107,127,0,0.45)" }}
          title={`${card.bob} links found by Bob`}
        >
          {card.bob}
        </span>
      ) : null}
      {n.criticality === "high" ? (
        <span
          className="size-[7px] rounded-full"
          style={{ background: BRAND.acid, boxShadow: dark ? undefined : "0 0 0 1px rgba(14,15,12,0.35)" }}
          title="High criticality"
        />
      ) : null}
    </span>
  );
}

function CardView({ card, dark }: { card: Card; dark: boolean }) {
  if (card.kind === "field") {
    return (
      <div className="h-full flex items-center justify-between gap-2 pl-2.5 pr-2">
        <span className="truncate text-[12px] font-medium text-text-secondary">{card.label}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          {card.pii ? <span className="size-[6px] rounded-full" style={{ background: STATE.pii }} title="Personal data" /> : null}
          {card.bob > 0 ? (
            <span className="font-mono text-[9.5px]" style={{ color: dark ? BRAND.acid : BRAND.acidInk }}>
              {card.bob}
            </span>
          ) : null}
          <span className="font-mono text-[9.5px] text-text-tertiary">{typeLabel(card.node.type)}</span>
        </span>
      </div>
    );
  }
  return (
    <div className="relative h-full rounded-[10px] overflow-hidden">
      <span className="absolute left-[5px] top-[10px] w-[3px] rounded-full" style={{ background: card.accent, height: card.kind === "box" ? HEAD_H - 20 : card.h - 20 }} />
      {!card.node.tested ? <Hatch /> : null}
      <div className="pl-[15px] pr-3 pt-[9px] flex flex-col gap-[3px]" style={{ height: card.kind === "box" ? HEAD_H : card.h }}>
        <span className="truncate text-[13.5px] leading-[18px] font-semibold text-text-primary tracking-[-0.005em]">{card.label}</span>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[10.5px] leading-[14px] text-text-tertiary">
            {typeLabel(card.node.type)}
            {card.kind === "box" ? ` · ${Math.round((card.h - HEAD_H - BOX_PAD + ROW_GAP) / (ROW_H + ROW_GAP))}` : ""}
          </span>
          <Glyphs card={card} dark={dark} />
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function CityMap({
  graph,
  selectedId,
  onSelect,
  severity,
  revealLevels,
  rippleKey,
  scanning = null,
  buildingState,
  agents,
  layerFilter = "all",
  className,
}: CityMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const onSelectRef = useRef(onSelect);
  const cardEls = useRef(new Map<string, HTMLDivElement>());
  const selectedRef = useRef<string | null | undefined>(selectedId);
  const layerRef = useRef<LayerId | "all">(layerFilter);
  const hoverRef = useRef<string | null>(null);
  const applyRef = useRef<() => void>(() => {});
  const fitRef = useRef<(animate: boolean) => void>(() => {});
  const userMovedRef = useRef(false);
  const isDark = useIsDark();
  const layout = useMemo(() => buildLayout(graph), [graph]);
  const dense = graph.edges.length > 150;

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Create the map once per graph.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const cy = cytoscape({
      container,
      elements: layout.els,
      layout: { name: "preset" },
      style: buildStyle(readTokens(), document.documentElement.classList.contains("dark"), dense),
      minZoom: 0.12,
      maxZoom: 2.4,
      boxSelectionEnabled: false,
      autoungrabify: true,
      wheelSensitivity: 0.35,
    });
    cyRef.current = cy;

    // Keep the overlay glued to the viewport.
    const syncViewport = () => {
      const o = overlayRef.current;
      if (!o) return;
      const p = cy.pan();
      const z = cy.zoom();
      o.style.transform = `translate(${p.x}px, ${p.y}px) scale(${z})`;
      o.dataset.lod = z < 0.3 ? "low" : "high";
    };
    let raf = 0;
    const syncOpacity = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        for (const [id, el] of cardEls.current) {
          const ele = cy.getElementById(id);
          if (ele.empty()) continue;
          el.style.opacity = String(ele.style("opacity"));
        }
      });
    };
    cy.on("viewport", syncViewport);
    cy.on("class style", "node", syncOpacity);

    const nodeOwner = (ids: Collection) => ids.union(cy.nodes().filter((n) => ids.some((m) => m.data("owner") === n.id())));

    // Focus: layer filter (context), then hover or selection paths.
    const apply = () => {
      const lf = layerRef.current;
      const sel = selectedRef.current;
      const hov = hoverRef.current;
      cy.batch(() => {
        cy.elements().removeClass("ctx ctx-near lane dim path hoverpath onpath focus hover");
        const content = cy.nodes(".asset, .field");
        if (lf !== "all") {
          const inLayer = content.filter((n) => n.data("layer") === lf);
          const lanes = inLayer.connectedEdges();
          let near = lanes.connectedNodes().difference(inLayer);
          near = near.union(near.map((n) => cy.getElementById(n.data("owner") ?? "")).reduce((c, e) => c.union(e), cy.collection()));
          content.difference(inLayer).addClass("ctx");
          near.removeClass("ctx").addClass("ctx-near");
          cy.nodes(".band").filter((b) => b.data("layer") !== lf).addClass("ctx");
          cy.edges().difference(lanes).addClass("ctx");
          lanes.addClass("lane");
        }
        const focusId = sel ?? hov;
        if (focusId) {
          const n = cy.getElementById(focusId);
          if (n.nonempty() && !n.hasClass("band")) {
            const group = n.union(cy.nodes().filter((c) => c.data("owner") === n.id()));
            const up = group.predecessors();
            const down = group.successors();
            const pathNodes = group.union(up.nodes()).union(down.nodes());
            const pathEdges = up.edges().union(down.edges());
            const keep = nodeOwner(pathNodes).union(pathNodes.map((p) => cy.getElementById(p.data("owner") ?? "")).reduce((c, e) => c.union(e), cy.collection()));
            content.difference(keep).addClass("dim");
            cy.edges().difference(pathEdges).addClass("dim");
            keep.removeClass("ctx ctx-near");
            pathEdges.removeClass("ctx");
            if (sel) {
              pathEdges.addClass("path");
              pathNodes.difference(group).addClass("onpath");
              n.addClass("focus");
            } else {
              pathEdges.addClass("hoverpath");
              n.addClass("hover");
            }
          }
        }
      });
      syncOpacity();
    };
    applyRef.current = apply;

    const fitTarget = () => {
      const lf = layerRef.current;
      if (lf === "all") return cy.nodes(".band, .asset, .field");
      const band = cy.getElementById(`band:${lf}`);
      const inLayer = cy.nodes(".asset, .field").filter((n) => n.data("layer") === lf);
      if (inLayer.empty()) return cy.nodes(".band, .asset, .field");
      return band.union(inLayer).union(inLayer.connectedEdges().connectedNodes());
    };
    const fit = (animate: boolean) => {
      const eles = fitTarget();
      const padding = layerRef.current === "all" ? 20 : 48;
      if (animate) cy.animate({ fit: { eles, padding }, duration: 520, easing: "ease-in-out-cubic" });
      else cy.fit(eles, padding);
    };
    fitRef.current = fit;
    fit(false);
    syncViewport();
    apply();

    cy.on("tap", "node", (evt) => {
      const n = evt.target;
      if (n.hasClass("band") || n.hasClass("agent")) return;
      onSelectRef.current?.(n.id());
    });
    cy.on("tap", (evt) => {
      if (evt.target === cy) onSelectRef.current?.(null);
    });
    cy.on("mouseover", "node.asset, node.field", (evt) => {
      hoverRef.current = evt.target.id();
      container.style.cursor = "pointer";
      if (!selectedRef.current) apply();
    });
    cy.on("mouseout", "node.asset, node.field", () => {
      hoverRef.current = null;
      container.style.cursor = "";
      if (!selectedRef.current) apply();
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

    // Fill the canvas: refit on resize until the person pans or zooms.
    const markMoved = () => (userMovedRef.current = true);
    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons) markMoved();
    };
    container.addEventListener("wheel", markMoved, { passive: true });
    container.addEventListener("pointermove", onPointerMove);
    const ro = new ResizeObserver(() => {
      cy.resize();
      if (!userMovedRef.current && !selectedRef.current) fit(false);
    });
    ro.observe(container);

    const unregister = registerSnapshot(() =>
      cy.png({ output: "base64uri", full: true, scale: 2, bg: readTokens().background }),
    );

    return () => {
      unregister();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(raf);
      ro.disconnect();
      container.removeEventListener("wheel", markMoved);
      container.removeEventListener("pointermove", onPointerMove);
      cy.destroy();
      cyRef.current = null;
    };
  }, [layout, dense]);

  // Re-theme when light/dark changes.
  useEffect(() => {
    cyRef.current?.style(buildStyle(readTokens(), isDark, dense));
  }, [isDark, dense]);

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
  }, [severity, revealLevels, rippleKey, layout]);

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
        const group = el.union(cy.nodes().filter((n) => n.data("owner") === unit));
        group.addClass(`bs-${state}`);
        if (state === "fixed") group.incomers("edge.impacted").addClass("fixed-edge");
      }
    });
  }, [buildingState, layout]);

  // Agents walk from the city gate to the building they work on.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const wanted = new Set((agents ?? []).map((a) => `agent:${a.id}`));
    cy.nodes(".agent").forEach((n) => {
      if (!wanted.has(n.id())) n.remove();
    });
    const gate = { x: -CARD_W, y: -40 };
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
  }, [agents, layout]);

  // Selection: highlight paths and bring the neighbourhood into view.
  useEffect(() => {
    selectedRef.current = selectedId;
    applyRef.current();
    const cy = cyRef.current;
    if (!cy || !selectedId) return;
    const n = cy.getElementById(selectedId);
    if (n.empty()) return;
    const group = n.union(cy.nodes().filter((c) => c.data("owner") === n.id()));
    const around = group.union(group.connectedEdges().connectedNodes());
    const bb = around.boundingBox();
    const fitsNow = cy.extent();
    // Only move when the neighbourhood is not already comfortably visible.
    const visible = bb.x1 >= fitsNow.x1 && bb.x2 <= fitsNow.x2 && bb.y1 >= fitsNow.y1 && bb.y2 <= fitsNow.y2;
    if (!visible || cy.zoom() < 0.45) {
      cy.animate({ fit: { eles: around, padding: 80 }, duration: 380, easing: "ease-in-out-cubic" });
      userMovedRef.current = true;
    }
  }, [selectedId, layout]);

  // Layer filter: keep context, zoom to the layer and its direct neighbours.
  useEffect(() => {
    const changed = layerRef.current !== layerFilter;
    layerRef.current = layerFilter;
    applyRef.current();
    if (changed) {
      userMovedRef.current = false;
      fitRef.current(true);
    }
  }, [layerFilter, layout]);

  const zoomBy = (factor: number) => {
    const cy = cyRef.current;
    if (!cy) return;
    userMovedRef.current = true;
    cy.animate({
      zoom: { level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } },
      duration: 160,
    });
  };

  const iconBtn =
    "cursor-pointer flex items-center justify-center size-8 rounded-md text-icon-secondary hover:text-text-primary hover:bg-surface-hover active:scale-95 transition-all duration-150";

  return (
    <div className={cn("relative rounded-xl border border-border overflow-hidden city-canvas", scanning && "ai-glow", className)}>
      {scanning ? (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 h-7 rounded-full border border-border bg-surface/90 backdrop-blur font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-secondary pointer-events-none">
          <span className="size-1.5 rounded-full bg-brand animate-pulse" />
          Scanning the graph
        </div>
      ) : null}
      {/* Cytoscape sets its own container to position: relative, so it needs a sized wrapper. */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="w-full h-full" />
      </div>
      <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
        <div ref={overlayRef} className="absolute left-0 top-0 origin-top-left group/lod" data-lod="high">
          {layout.headers.map((h) => (
            <div
              key={h.id}
              ref={(el) => {
                if (el) cardEls.current.set(`band:${h.id}`, el);
                else cardEls.current.delete(`band:${h.id}`);
              }}
              className="absolute flex items-center justify-between px-4 transition-opacity duration-200"
              style={{ left: h.x, top: h.y, width: h.w, height: BAND_HEAD - 6 }}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="size-[7px] rounded-full shrink-0" style={{ background: h.accent }} />
                <span className="truncate text-[12px] font-semibold uppercase tracking-[0.09em] text-text-secondary">{h.label}</span>
              </span>
              <span className="font-mono text-[11px] text-text-tertiary tabular-nums">{h.count}</span>
            </div>
          ))}
          {layout.cards.map((c) => (
            <div
              key={c.id}
              ref={(el) => {
                if (el) cardEls.current.set(c.id, el);
                else cardEls.current.delete(c.id);
              }}
              className="absolute transition-opacity duration-200 group-data-[lod=low]/lod:invisible"
              style={{ left: c.x, top: c.y, width: c.w, height: c.kind === "box" ? HEAD_H : c.h }}
            >
              <CardView card={c} dark={isDark} />
            </div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-3 right-3 flex flex-col gap-0.5 p-1 rounded-lg bg-surface/90 backdrop-blur border border-border shadow-2xs select-none">
        <button className={iconBtn} onClick={() => zoomBy(1.25)} aria-label="Zoom in">
          <Plus className="size-4" />
        </button>
        <button className={iconBtn} onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">
          <Minus className="size-4" />
        </button>
        <span className="h-px mx-1.5 bg-border" />
        <button
          className={iconBtn}
          onClick={() => {
            userMovedRef.current = false;
            fitRef.current(true);
          }}
          aria-label="Fit to screen"
        >
          <Scan className="size-4" />
        </button>
      </div>
    </div>
  );
}
