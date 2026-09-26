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
import { Minus, Plus, LocateFixed, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { districtColor } from "@/components/city/city-3d";
import { COSMIC, drawBackground, drawGalaxy, SPACE_BG } from "@/components/city/space-render";
import { cn } from "@/lib/cn";
import { canvasToPng, registerSnapshot } from "@/lib/city-export";
import { GRAPH_DEFAULTS, useCityPrefs, type GraphPrefs } from "@/lib/city-prefs";
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

// Settings are saved in the browser (lib/city-prefs.ts). Search is not saved.
type Settings = GraphPrefs & { search: string };

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
  const graphPrefs = useCityPrefs((s) => s.graph);
  const setGraph = useCityPrefs((s) => s.setGraph);
  const [search, setSearch] = useState("");
  const settings: Settings = useMemo(() => ({ ...graphPrefs, search }), [graphPrefs, search]);
  const [panelOpen, setPanelOpen] = useState(false);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    if (k === "search") setSearch(v as string);
    else setGraph({ [k]: v } as Partial<GraphPrefs>);
  };
  const localRoot = settings.localDepth > 0 ? (selectedId ?? null) : null;

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
    let nodeIds = new Set(nodes.map((n) => n.id));
    let finalLinks = links.filter((l) => nodeIds.has(endId(l.source)) && nodeIds.has(endId(l.target)));

    // Local graph: keep only nodes within N hops of the selected node.
    if (localRoot && nodeIds.has(localRoot)) {
      const adj = new Map<string, string[]>();
      for (const l of finalLinks) {
        const a = endId(l.source);
        const b = endId(l.target);
        adj.set(a, [...(adj.get(a) ?? []), b]);
        adj.set(b, [...(adj.get(b) ?? []), a]);
      }
      const keepIds = new Set([localRoot]);
      let frontier = [localRoot];
      for (let d = 0; d < settings.localDepth; d++) {
        const next: string[] = [];
        for (const id of frontier) {
          for (const nb of adj.get(id) ?? []) {
            if (keepIds.has(nb)) continue;
            keepIds.add(nb);
            next.push(nb);
          }
        }
        frontier = next;
      }
      nodeIds = keepIds;
      finalLinks = finalLinks.filter((l) => keepIds.has(endId(l.source)) && keepIds.has(endId(l.target)));
    }
    const visibleNodes = nodes.filter((n) => nodeIds.has(n.id));
    const neighbors = new Map<string, Set<string>>();
    for (const l of finalLinks) {
      const a = endId(l.source);
      const b = endId(l.target);
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      if (!neighbors.has(b)) neighbors.set(b, new Set());
      neighbors.get(a)!.add(b);
      neighbors.get(b)!.add(a);
    }
    // Space theme: the best-connected few percent of nodes shine as stars.
    const degrees = visibleNodes.map((n) => n.degree).sort((a, b) => a - b);
    const hubDegree = Math.max(8, degrees[Math.floor(degrees.length * 0.96)] ?? 8);
    return { nodes: visibleNodes, links: finalLinks, neighbors, hubDegree };
  }, [graph, settings.showFields, settings.showContains, settings.showOrphans, settings.localDepth, localRoot]);

  // Everything the draw loop needs, kept in refs so pan/zoom/hover never re-render React.
  // rot: the galaxy's turn (radians) around the middle of the screen; space theme only.
  const view = useRef({ k: 1, x: 0, y: 0, w: 1, h: 1, dpr: 1, rot: 0 });
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
    // Space theme animates (twinkle, comets, orbits) unless the OS asks for less motion.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = performance.now();
    let loop = 0;
    let skip = false;
    let last = performance.now();
    // Auto-rotate pauses while you point at a body or drag, and for a moment after.
    let lastInput = 0;
    const ROTATE_SPEED = (Math.PI * 2) / 240; // one turn every 4 minutes
    const animate = (now: number) => {
      loop = requestAnimationFrame(animate);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const cfg = state.current.settings;
      if (!cfg.space || reduced || document.hidden) return;
      if (cfg.autoRotate && !drag && !state.current.hovered && now - lastInput > 2500) view.current.rot += dt * ROTATE_SPEED;
      // Big graphs draw at half rate to stay smooth.
      if (nodesRef.current.length > 1500 && (skip = !skip)) return;
      draw();
    };
    loop = requestAnimationFrame(animate);
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

      const active = s.hovered ?? s.selected;
      const neighbors = active ? model.neighbors.get(active) ?? new Set<string>() : null;
      const q = cfg.search.trim().toLowerCase();
      const matches = q ? new Set(nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id)) : null;

      if (cfg.space) {
        const time = reduced ? 0 : (performance.now() - started) / 1000;
        drawBackground(ctx, v.w, v.h, v.x, v.y, time, !reduced);
        // The galaxy turns around the middle of the screen; the starfield stays put.
        ctx.translate(v.w / 2, v.h / 2);
        ctx.rotate(v.rot);
        ctx.translate(-v.w / 2, -v.h / 2);
        ctx.translate(v.x, v.y);
        ctx.scale(v.k, v.k);
        drawGalaxy(ctx, {
          nodes,
          links,
          k: v.k,
          t: time,
          animate: !reduced,
          active,
          selected: s.selected,
          neighbors,
          matches,
          byLayer: cfg.colorByLayer,
          layerIndex,
          nodeSize: cfg.nodeSize,
          linkWidth: cfg.linkWidth,
          arrows: cfg.arrows,
          labelZoom: cfg.labelZoom,
          hubDegree: model.hubDegree,
          font: t.font,
          rot: v.rot,
        });
        return;
      }
      ctx.translate(v.x, v.y);
      ctx.scale(v.k, v.k);
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
    // Pointer position in the unrotated frame, so hit tests, drags, pans and zooms
    // work the same while the galaxy turns.
    const pos = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      const v = view.current;
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const rot = state.current.settings.space ? v.rot : 0;
      if (!rot) return { sx: px, sy: py };
      const cx = v.w / 2;
      const cy = v.h / 2;
      const cos = Math.cos(-rot);
      const sin = Math.sin(-rot);
      return { sx: cx + (px - cx) * cos - (py - cy) * sin, sy: cy + (px - cx) * sin + (py - cy) * cos };
    };
    const onDown = (e: PointerEvent) => {
      lastInput = performance.now();
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
      lastInput = performance.now();
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
      lastInput = performance.now();
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
    const unregister = registerSnapshot(() => {
      draw();
      return canvasToPng(canvas, state.current.settings.space ? SPACE_BG : (state.current.tokens?.background ?? "#FFFFFF"));
    });

    return () => {
      unregister();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(loop);
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

  const space = settings.space;
  const iconBtn = cn(
    "cursor-pointer flex items-center justify-center size-9 rounded-lg active:scale-95 transition-all duration-150",
    space
      ? "bg-white/[0.06] border border-white/15 text-white/75 backdrop-blur-md hover:text-white hover:bg-white/[0.12] hover:border-white/30 shadow-[0_0_18px_rgba(120,140,255,0.15)]"
      : "bg-surface border border-border text-icon-secondary hover:text-text-primary hover:bg-surface-hover hover:border-border-strong shadow-2xs",
  );

  return (
    <div
      ref={hostRef}
      className={cn("relative overflow-hidden rounded-xl border select-none", space ? "border-indigo-400/20" : "border-border bg-background", className)}
      style={space ? { background: SPACE_BG } : undefined}
    >
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
                <div className="flex flex-col gap-1.5 pt-1">
                  <span className="flex items-center justify-between">
                    <span className="text-body text-text-primary">Local graph</span>
                    <span className="type-caption">{selectedId ? "hops from selected" : "select a node first"}</span>
                  </span>
                  <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-surface-secondary border border-border">
                    {([0, 1, 2, 3] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => set("localDepth", d)}
                        className={cn(
                          "cursor-pointer h-7 rounded-md text-caption font-semibold transition-colors",
                          settings.localDepth === d ? "bg-surface text-text-primary shadow-2xs border border-border" : "text-text-tertiary hover:text-text-primary",
                        )}
                      >
                        {d === 0 ? "Off" : d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 pt-3 border-t border-border">
                <p className="type-label">Display</p>
                <Toggle label="Space theme" checked={settings.space} onChange={(v) => set("space", v)} />
                {settings.space ? <Toggle label="Auto-rotate" checked={settings.autoRotate} onChange={(v) => set("autoRotate", v)} /> : null}
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
                  <button onClick={() => setGraph(GRAPH_DEFAULTS)} className="cursor-pointer flex-1 h-8 rounded-lg border border-border bg-surface hover:bg-surface-hover text-caption font-semibold text-text-secondary">
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
        <button className={iconBtn} onClick={() => fitRef.current()} aria-label="Fit to screen" title="Fit everything in view">
          <LocateFixed className="size-4" />
        </button>
      </div>

      <div className={cn("absolute bottom-3 left-3 flex items-center gap-4 type-caption", space && "text-indigo-100/60")}>
        <span>
          <span className={cn("text-body font-semibold", space ? "text-white" : "text-text-primary")}>{model.nodes.length}</span> {space ? "bodies" : "nodes"}
        </span>
        <span>
          <span className={cn("text-body font-semibold", space ? "text-white" : "text-text-primary")}>{model.links.length}</span> links
        </span>
        <span className="hidden md:inline">drag to pan · scroll to zoom · drag a {space ? "planet" : "dot"} to move it</span>
      </div>

      {space && settings.colorByLayer ? (
        <div className="absolute bottom-3 right-3 hidden md:flex flex-wrap justify-end gap-x-3 gap-y-1 max-w-[55%] px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 backdrop-blur-md">
          {graph.layers.map((l, i) => (
            <span key={l.id} className="inline-flex items-center gap-1.5 text-caption text-indigo-100/80">
              <span className="size-2.5 rounded-full" style={{ background: COSMIC[i % COSMIC.length], boxShadow: `0 0 8px ${COSMIC[i % COSMIC.length]}` }} />
              {l.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
