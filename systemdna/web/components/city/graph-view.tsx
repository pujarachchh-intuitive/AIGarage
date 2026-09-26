"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { Maximize2, Minus, Plus, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { districtColor } from "@/components/city/city-3d";
import { cn } from "@/lib/cn";
import { useIsDark } from "@/lib/theme";
import { readTokens, type Tokens } from "@/lib/tokens";
import type { Graph } from "@/lib/types";

// An Obsidian-style graph: every node is a dot, sized by how many links it has.
// A force simulation pulls linked nodes together, so clusters appear on their own.

interface GNode extends SimulationNodeDatum {
  id: string;
  label: string;
  type: string;
  layer: string;
  degree: number;
  r: number;
}
interface GLink extends SimulationLinkDatum<GNode> {
  source: string | GNode;
  target: string | GNode;
  kind: "edge" | "contains";
  /** How hard this link pulls (0 to 1). Containment pulls hardest, calls and imports least. */
  weight: number;
}

interface Settings {
  search: string;
  showFields: boolean;
  showContains: boolean;
  showOrphans: boolean;
  arrows: boolean;
  colorByLayer: boolean;
  nodeSize: number;
  linkWidth: number;
  labelZoom: number;
  center: number;
  repel: number;
  linkStrength: number;
  linkDistance: number;
}

const DEFAULTS: Settings = {
  search: "",
  showFields: true,
  showContains: true,
  showOrphans: true,
  arrows: false,
  colorByLayer: false,
  nodeSize: 1,
  linkWidth: 1,
  labelZoom: 2.2,
  center: 0.05,
  repel: 90,
  linkStrength: 0.7,
  linkDistance: 36,
};

const endId = (x: string | GNode) => (typeof x === "string" ? x : x.id);

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between type-caption">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-zinc-900 cursor-pointer" />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className="text-body text-text-primary">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn("relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200", checked ? "bg-primary" : "bg-border-strong")}
        aria-pressed={checked}
        aria-label={label}
      >
        <span className={cn("inline-block h-4 w-4 rounded-full shadow-xs transition duration-200", checked ? "translate-x-4 bg-surface" : "translate-x-0 bg-icon-primary")} />
      </button>
    </label>
  );
}

export function GraphView({
  graph,
  selectedId,
  onSelect,
  className,
}: {
  graph: Graph;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDark = useIsDark();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [panelOpen, setPanelOpen] = useState(false);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  const layerIndex = useMemo(() => new Map(graph.layers.map((l, i) => [l.id, i])), [graph.layers]);

  // Nodes and links for the current filters.
  const model = useMemo(() => {
    const keep = graph.nodes.filter((n) => settings.showFields || !n.parent);
    const ids = new Set(keep.map((n) => n.id));
    const links: GLink[] = [];
    const seen = new Set<string>();
    const add = (a: string, b: string, kind: GLink["kind"], weight: number) => {
      if (!ids.has(a) || !ids.has(b) || a === b) return;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) return;
      seen.add(key);
      links.push({ source: a, target: b, kind, weight });
    };
    for (const e of graph.edges) add(e.from, e.to, "edge", e.rule === "passthrough" ? 0.03 : 0.12);
    if (settings.showContains) for (const n of keep) if (n.parent) add(n.parent, n.id, "contains", 1);
    const degree = new Map<string, number>();
    for (const l of links) {
      degree.set(endId(l.source), (degree.get(endId(l.source)) ?? 0) + 1);
      degree.set(endId(l.target), (degree.get(endId(l.target)) ?? 0) + 1);
    }
    const nodes: GNode[] = keep
      .filter((n) => settings.showOrphans || (degree.get(n.id) ?? 0) > 0)
      .map((n) => {
        const d = degree.get(n.id) ?? 0;
        return { id: n.id, label: n.name, type: n.type, layer: n.layer, degree: d, r: 1.6 + Math.sqrt(d) * 0.75 };
      });
    const nodeIds = new Set(nodes.map((n) => n.id));
    const finalLinks = links.filter((l) => nodeIds.has(endId(l.source)) && nodeIds.has(endId(l.target)));
    const neighbors = new Map<string, Set<string>>();
    for (const l of finalLinks) {
      const a = endId(l.source);
      const b = endId(l.target);
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      if (!neighbors.has(b)) neighbors.set(b, new Set());
      neighbors.get(a)!.add(b);
      neighbors.get(b)!.add(a);
    }
    return { nodes, links: finalLinks, neighbors };
  }, [graph, settings.showFields, settings.showContains, settings.showOrphans]);

  // Everything the draw loop needs, kept in refs so pan/zoom/hover never re-render React.
  const view = useRef({ k: 1, x: 0, y: 0, w: 1, h: 1, dpr: 1 });
  const state = useRef({ hovered: null as string | null, selected: selectedId ?? null, settings, tokens: null as Tokens | null, fitted: false, interacted: false });
  const simRef = useRef<Simulation<GNode, GLink> | null>(null);
  const nodesRef = useRef<GNode[]>([]);
  const linksRef = useRef<GLink[]>([]);
  const drawRef = useRef<() => void>(() => {});
  const fitRef = useRef<() => void>(() => {});
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Canvas, drawing and input. Set up once.
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext("2d")!;
    let frame = 0;
    const requestDraw = () => {
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        draw();
      });
    };

    const resize = () => {
      const v = view.current;
      v.dpr = Math.min(window.devicePixelRatio || 1, 2);
      // Keep the same point in the middle when the canvas changes size (e.g. a side panel opens).
      if (v.w > 1) v.x += (host.clientWidth - v.w) / 2;
      if (v.h > 1) v.y += (host.clientHeight - v.h) / 2;
      v.w = host.clientWidth;
      v.h = host.clientHeight;
      canvas.width = Math.round(v.w * v.dpr);
      canvas.height = Math.round(v.h * v.dpr);
      canvas.style.width = `${v.w}px`;
      canvas.style.height = `${v.h}px`;
      requestDraw();
    };

    const alpha = (hex: string, a: number) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    };

    function draw() {
      const v = view.current;
      const s = state.current;
      const t = s.tokens;
      if (!t) return;
      const cfg = s.settings;
      const nodes = nodesRef.current;
      const links = linksRef.current;
      ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
      ctx.clearRect(0, 0, v.w, v.h);
      ctx.translate(v.x, v.y);
      ctx.scale(v.k, v.k);

      const active = s.hovered ?? s.selected;
      const neighbors = active ? model.neighbors.get(active) ?? new Set<string>() : null;
      const q = cfg.search.trim().toLowerCase();
      const matches = q ? new Set(nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id)) : null;
      const inFocus = (id: string) => {
        if (matches && !matches.has(id)) return false;
        if (active) return id === active || neighbors!.has(id);
        return true;
      };
      const nodeColor = (n: GNode) =>
        cfg.colorByLayer ? districtColor(layerIndex.get(n.layer) ?? 0, "folder", isDark) : alpha(t.textTertiary, isDark ? 0.7 : 0.85);

      // Links: one batched path for quiet links, then highlighted ones on top.
      const width = (0.6 * cfg.linkWidth) / Math.sqrt(v.k);
      ctx.lineWidth = width;
      ctx.strokeStyle = alpha(t.textTertiary, active || matches ? 0.08 : isDark ? 0.28 : 0.35);
      ctx.beginPath();
      const hot: GLink[] = [];
      for (const l of links) {
        const a = l.source as GNode;
        const b = l.target as GNode;
        if (active && (a.id === active || b.id === active)) {
          hot.push(l);
          continue;
        }
        ctx.moveTo(a.x!, a.y!);
        ctx.lineTo(b.x!, b.y!);
      }
      ctx.stroke();
      if (hot.length) {
        ctx.lineWidth = width * 2;
        ctx.strokeStyle = alpha(t.textSecondary, 0.9);
        ctx.beginPath();
        for (const l of hot) {
          const a = l.source as GNode;
          const b = l.target as GNode;
          ctx.moveTo(a.x!, a.y!);
          ctx.lineTo(b.x!, b.y!);
        }
        ctx.stroke();
      }

      // Arrows show direction: the target depends on the source.
      if (cfg.arrows && v.k > 0.6) {
        ctx.fillStyle = alpha(t.textTertiary, active ? 0.5 : 0.8);
        for (const l of links) {
          if (l.kind !== "edge") continue;
          const a = l.source as GNode;
          const b = l.target as GNode;
          const ang = Math.atan2(b.y! - a.y!, b.x! - a.x!);
          const tip = b.r * cfg.nodeSize + 1;
          const x = b.x! - Math.cos(ang) * tip;
          const y = b.y! - Math.sin(ang) * tip;
          const sz = 3.2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - Math.cos(ang - 0.45) * sz, y - Math.sin(ang - 0.45) * sz);
          ctx.lineTo(x - Math.cos(ang + 0.45) * sz, y - Math.sin(ang + 0.45) * sz);
          ctx.fill();
        }
      }

      // Nodes.
      for (const n of nodes) {
        const focus = inFocus(n.id);
        const r = n.r * cfg.nodeSize * (n.id === active ? 1.35 : 1);
        ctx.globalAlpha = focus ? 1 : 0.16;
        ctx.fillStyle = n.id === active ? t.textPrimary : focus && (active || matches) ? t.textSecondary : nodeColor(n);
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2);
        ctx.fill();
        if (n.id === s.selected) {
          ctx.lineWidth = 1.5 / v.k;
          ctx.strokeStyle = t.textPrimary;
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, r + 3 / v.k, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // Labels fade in as you zoom, like Obsidian. Focused nodes always get one.
      const fade = Math.max(0, Math.min(1, (v.k - cfg.labelZoom + 0.4) / 0.4));
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = `500 ${11 / v.k}px ${t.font}`;
      for (const n of nodes) {
        const forced = n.id === active || (neighbors?.has(n.id) && (neighbors.size ?? 0) <= 24) || (matches?.has(n.id) && matches.size <= 30);
        const a = forced ? 1 : inFocus(n.id) ? fade : fade * 0.2;
        if (a <= 0.02) continue;
        ctx.fillStyle = alpha(t.textSecondary, a);
        ctx.fillText(n.label, n.x!, n.y! + n.r * cfg.nodeSize + 3 / v.k);
      }
    }
    drawRef.current = requestDraw;

    const toGraph = (sx: number, sy: number) => {
      const v = view.current;
      return { x: (sx - v.x) / v.k, y: (sy - v.y) / v.k };
    };
    const nodeAt = (sx: number, sy: number) => {
      const p = toGraph(sx, sy);
      let best: GNode | null = null;
      let bestD = Infinity;
      for (const n of nodesRef.current) {
        const d = Math.hypot(n.x! - p.x, n.y! - p.y);
        const hit = n.r * state.current.settings.nodeSize + 4 / view.current.k;
        if (d < hit && d < bestD) {
          best = n;
          bestD = d;
        }
      }
      return best;
    };

    fitRef.current = () => {
      const nodes = nodesRef.current;
      if (!nodes.length) return;
      // Fit to where most nodes are, so a few far-flung orphans do not shrink the view.
      const xs = nodes.map((n) => n.x ?? 0).sort((a, b) => a - b);
      const ys = nodes.map((n) => n.y ?? 0).sort((a, b) => a - b);
      const at = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(p * (arr.length - 1))))];
      const [x0, x1, y0, y1] = [at(xs, 0.03), at(xs, 0.97), at(ys, 0.03), at(ys, 0.97)];
      const v = view.current;
      const k = Math.min(v.w / (x1 - x0 + 80), v.h / (y1 - y0 + 80), 3);
      v.k = k;
      v.x = v.w / 2 - ((x0 + x1) / 2) * k;
      v.y = v.h / 2 - ((y0 + y1) / 2) * k;
      requestDraw();
    };

    // Pointer input: drag a node to move it, drag empty space to pan, wheel to zoom.
    let drag: { node: GNode | null; sx: number; sy: number; vx: number; vy: number; moved: boolean } | null = null;
    const pos = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      return { sx: e.clientX - r.left, sy: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      const { sx, sy } = pos(e);
      const node = nodeAt(sx, sy);
      drag = { node, sx, sy, vx: view.current.x, vy: view.current.y, moved: false };
      canvas.setPointerCapture(e.pointerId);
      state.current.interacted = true;
      if (node) {
        node.fx = node.x;
        node.fy = node.y;
        simRef.current?.alphaTarget(0.25).restart();
      }
    };
    const onMove = (e: PointerEvent) => {
      const { sx, sy } = pos(e);
      if (!drag) {
        const n = nodeAt(sx, sy);
        const id = n?.id ?? null;
        canvas.style.cursor = n ? "pointer" : "grab";
        if (id !== state.current.hovered) {
          state.current.hovered = id;
          requestDraw();
        }
        return;
      }
      if (Math.hypot(sx - drag.sx, sy - drag.sy) > 3) drag.moved = true;
      if (drag.node) {
        const p = toGraph(sx, sy);
        drag.node.fx = p.x;
        drag.node.fy = p.y;
      } else {
        view.current.x = drag.vx + (sx - drag.sx);
        view.current.y = drag.vy + (sy - drag.sy);
        canvas.style.cursor = "grabbing";
      }
      requestDraw();
    };
    const onUp = () => {
      if (!drag) return;
      if (drag.node) {
        drag.node.fx = null;
        drag.node.fy = null;
        simRef.current?.alphaTarget(0);
      }
      if (!drag.moved) onSelectRef.current?.(drag.node?.id ?? null);
      drag = null;
      canvas.style.cursor = "grab";
    };
    const onLeave = () => {
      if (state.current.hovered) {
        state.current.hovered = null;
        requestDraw();
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { sx, sy } = pos(e);
      const v = view.current;
      const k = Math.max(0.1, Math.min(8, v.k * Math.exp(-e.deltaY * 0.0015)));
      v.x = sx - ((sx - v.x) / v.k) * k;
      v.y = sy - ((sy - v.y) / v.k) * k;
      v.k = k;
      state.current.interacted = true;
      requestDraw();
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [model, layerIndex, isDark]);

  // Theme tokens.
  useEffect(() => {
    state.current.tokens = readTokens();
    drawRef.current();
  }, [isDark]);

  // The simulation. Rebuilt when filters change; positions carry over.
  useEffect(() => {
    const old = new Map(nodesRef.current.map((n) => [n.id, n]));
    const spread = Math.sqrt(model.nodes.length) * 18;
    const nodes = model.nodes.map((n, i) => {
      const prev = old.get(n.id);
      if (prev) return { ...n, x: prev.x, y: prev.y, vx: 0, vy: 0 };
      const a = i * 2.39996; // golden angle: an even starting disc
      const r = spread * Math.sqrt((i + 0.5) / model.nodes.length);
      return { ...n, x: Math.cos(a) * r, y: Math.sin(a) * r };
    });
    const links = model.links.map((l) => ({ ...l }));
    nodesRef.current = nodes;
    linksRef.current = links as GLink[];
    const cfg = state.current.settings;
    const sim = forceSimulation<GNode, GLink>(nodes)
      .force("link", forceLink<GNode, GLink>(links).id((d) => d.id).distance((l) => (l.kind === "contains" ? cfg.linkDistance * 0.45 : cfg.linkDistance)).strength((l) => cfg.linkStrength * l.weight))
      .force("charge", forceManyBody<GNode>().strength(-cfg.repel).distanceMax(260))
      .force("center", forceCenter(0, 0))
      .force("x", forceX<GNode>(0).strength(cfg.center))
      .force("y", forceY<GNode>(0).strength(cfg.center))
      .force("collide", forceCollide<GNode>((d) => d.r * cfg.nodeSize + 1.5))
      .alpha(old.size ? 0.5 : 1)
      .on("tick", () => {
        if (!state.current.fitted && sim.alpha() < 0.35) {
          state.current.fitted = true;
          if (!state.current.interacted) fitRef.current();
        }
        drawRef.current();
      })
      .on("end", () => {
        if (!state.current.interacted) fitRef.current();
      });
    simRef.current = sim;
    if (!old.size) {
      // Settle the layout up front so people see clusters at once, not a hairball untangling.
      sim.stop();
      const steps = nodes.length > 1500 ? 120 : 300;
      for (let i = 0; i < steps; i++) sim.tick();
      state.current.fitted = true;
      fitRef.current();
      sim.alpha(0.08).restart();
    }
    return () => {
      sim.stop();
    };
  }, [model]);

  // Force sliders update the running simulation.
  useEffect(() => {
    state.current.settings = settings;
    const sim = simRef.current;
    if (sim) {
      (sim.force("link") as ReturnType<typeof forceLink<GNode, GLink>>)
        ?.distance((l) => (l.kind === "contains" ? settings.linkDistance * 0.45 : settings.linkDistance))
        .strength((l) => settings.linkStrength * l.weight);
      (sim.force("charge") as ReturnType<typeof forceManyBody<GNode>>)?.strength(-settings.repel);
      (sim.force("x") as ReturnType<typeof forceX<GNode>>)?.strength(settings.center);
      (sim.force("y") as ReturnType<typeof forceY<GNode>>)?.strength(settings.center);
      (sim.force("collide") as ReturnType<typeof forceCollide<GNode>>)?.radius((d) => d.r * settings.nodeSize + 1.5);
    }
    drawRef.current();
  }, [settings]);

  useEffect(() => {
    if (!simRef.current) return;
    simRef.current.alpha(0.4).restart();
  }, [settings.center, settings.repel, settings.linkStrength, settings.linkDistance, settings.nodeSize]);

  useEffect(() => {
    state.current.selected = selectedId ?? null;
    drawRef.current();
  }, [selectedId]);

  const zoomBy = (f: number) => {
    const v = view.current;
    const k = Math.max(0.1, Math.min(8, v.k * f));
    v.x = v.w / 2 - ((v.w / 2 - v.x) / v.k) * k;
    v.y = v.h / 2 - ((v.h / 2 - v.y) / v.k) * k;
    v.k = k;
    drawRef.current();
  };

  const iconBtn =
    "cursor-pointer flex items-center justify-center size-9 bg-surface border border-border rounded-lg text-icon-secondary hover:text-text-primary hover:bg-surface-hover hover:border-border-strong shadow-2xs active:scale-95 transition-all duration-150";

  return (
    <div ref={hostRef} className={cn("relative overflow-hidden rounded-xl border border-border bg-background select-none", className)}>
      <canvas ref={canvasRef} className="absolute inset-0 cursor-grab" />

      {/* Settings, like Obsidian's graph panel */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
        {panelOpen ? (
          <div className="w-[260px] max-h-[calc(100%-24px)] overflow-y-auto scroll-thin bg-surface/95 backdrop-blur-md border border-border rounded-2xl shadow-lg animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <span className="type-label">Graph settings</span>
              <button onClick={() => setPanelOpen(false)} className="cursor-pointer p-1 rounded-md text-icon-secondary hover:text-text-primary hover:bg-surface-hover" aria-label="Close settings">
                <X className="size-4" />
              </button>
            </div>
            <div className="px-4 pb-4 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <p className="type-label">Filters</p>
                <div className="relative">
                  <Search className="size-4 text-zinc-400 absolute left-2.5 top-2.5" />
                  <input
                    value={settings.search}
                    onChange={(e) => set("search", e.target.value)}
                    placeholder="Search nodes"
                    className="h-9 w-full pl-8 pr-2 border border-border rounded-lg bg-surface text-body text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-strong"
                  />
                </div>
                <Toggle label="Fields" checked={settings.showFields} onChange={(v) => set("showFields", v)} />
                <Toggle label="Containment links" checked={settings.showContains} onChange={(v) => set("showContains", v)} />
                <Toggle label="Orphans" checked={settings.showOrphans} onChange={(v) => set("showOrphans", v)} />
              </div>
              <div className="flex flex-col gap-2 pt-3 border-t border-border">
                <p className="type-label">Display</p>
                <Toggle label="Arrows" checked={settings.arrows} onChange={(v) => set("arrows", v)} />
                <Toggle label="Colour by district" checked={settings.colorByLayer} onChange={(v) => set("colorByLayer", v)} />
                <Slider label="Node size" value={settings.nodeSize} min={0.5} max={2.5} step={0.1} onChange={(v) => set("nodeSize", v)} />
                <Slider label="Link thickness" value={settings.linkWidth} min={0.3} max={3} step={0.1} onChange={(v) => set("linkWidth", v)} />
                <Slider label="Label fade-in zoom" value={settings.labelZoom} min={0.4} max={4} step={0.1} onChange={(v) => set("labelZoom", v)} />
              </div>
              <div className="flex flex-col gap-2 pt-3 border-t border-border">
                <p className="type-label">Forces</p>
                <Slider label="Centre force" value={settings.center} min={0} max={0.3} step={0.01} onChange={(v) => set("center", v)} />
                <Slider label="Repel force" value={settings.repel} min={5} max={250} step={5} onChange={(v) => set("repel", v)} />
                <Slider label="Link force" value={settings.linkStrength} min={0.05} max={1} step={0.05} onChange={(v) => set("linkStrength", v)} />
                <Slider label="Link distance" value={settings.linkDistance} min={8} max={120} step={2} onChange={(v) => set("linkDistance", v)} />
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={() => simRef.current?.alpha(1).restart()} className="cursor-pointer flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg border border-border bg-surface hover:bg-surface-hover text-caption font-semibold text-text-secondary">
                    <Sparkles className="size-3.5" /> Animate
                  </button>
                  <button onClick={() => setSettings({ ...DEFAULTS, search: settings.search })} className="cursor-pointer flex-1 h-8 rounded-lg border border-border bg-surface hover:bg-surface-hover text-caption font-semibold text-text-secondary">
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <button className={iconBtn} onClick={() => setPanelOpen(true)} aria-label="Graph settings" title="Graph settings">
            <SlidersHorizontal className="size-4" />
          </button>
        )}
      </div>

      <div className="absolute top-3 left-3 flex flex-col gap-2">
        <button className={iconBtn} onClick={() => zoomBy(1.25)} aria-label="Zoom in">
          <Plus className="size-4" />
        </button>
        <button className={iconBtn} onClick={() => zoomBy(0.8)} aria-label="Zoom out">
          <Minus className="size-4" />
        </button>
        <button className={iconBtn} onClick={() => fitRef.current()} aria-label="Fit to screen">
          <Maximize2 className="size-4" />
        </button>
      </div>

      <div className="absolute bottom-3 left-3 flex items-center gap-4 type-caption">
        <span>
          <span className="text-body font-semibold text-text-primary">{model.nodes.length}</span> nodes
        </span>
        <span>
          <span className="text-body font-semibold text-text-primary">{model.links.length}</span> links
        </span>
        <span>drag to pan · scroll to zoom · drag a dot to move it</span>
      </div>
    </div>
  );
}
