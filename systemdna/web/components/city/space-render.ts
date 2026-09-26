// Space theme for the graph view: the knowledge graph as a galaxy.
//
//   background  deep-space gradient, a twinkling starfield with parallax,
//               drifting nebula haze and the odd shooting star (screen space)
//   districts   a soft nebula cloud behind each district's nodes (graph space)
//   nodes       hubs are glowing stars with diffraction spikes; other nodes are
//               shaded planets (rocky, banded or icy); types and tables wear rings
//   links       faint constellation lines; comets flow along them in the
//               direction of the dependency (source -> target)
//
// Everything expensive (glows, shaded spheres) is painted once into small
// offscreen sprites and stamped with drawImage, so thousands of nodes stay smooth.

export const SPACE_BG = "#020308";

/** Vivid colours for districts, readable on black. */
export const COSMIC = ["#5eead4", "#a78bfa", "#f472b6", "#fbbf24", "#60a5fa", "#a3e635", "#f87171", "#e879f9", "#38bdf8", "#fdba74"];
/** Star temperatures, for when nodes are not coloured by district. */
const STELLAR = ["#cfe0ff", "#aac6ff", "#fff4e0", "#ffe3b0", "#ffd0a0", "#e8ecff"];
/** Node types drawn with a ring: containers of fields or columns. */
const RINGED = new Set(["TSType", "Table"]);

export interface SpaceNode {
  id: string;
  label: string;
  type: string;
  layer: string;
  degree: number;
  r: number;
  x?: number;
  y?: number;
}
export interface SpaceLink {
  source: SpaceNode | string;
  target: SpaceNode | string;
  kind: "edge" | "contains";
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Stable 0..1 from a string, so every node keeps its look between frames. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex: string, a: number) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
/** Mix a colour towards white (f > 0) or black (f < 0). */
function shade(hex: string, f: number) {
  const [r, g, b] = rgb(hex);
  const t = f > 0 ? 255 : 0;
  const k = Math.abs(f);
  return `rgb(${Math.round(r + (t - r) * k)},${Math.round(g + (t - g) * k)},${Math.round(b + (t - b) * k)})`;
}

export function nodeColor(n: SpaceNode, byLayer: boolean, layerIndex: Map<string, number>) {
  return byLayer ? COSMIC[(layerIndex.get(n.layer) ?? 0) % COSMIC.length] : STELLAR[Math.floor(hash01(n.id) * STELLAR.length)];
}

// ---------------------------------------------------------------------------
// Sprites (painted once, stamped many times)
// ---------------------------------------------------------------------------

const sprites = new Map<string, HTMLCanvasElement>();
function sprite(key: string, size: number, paint: (c: CanvasRenderingContext2D, s: number) => void) {
  let s = sprites.get(key);
  if (!s) {
    s = document.createElement("canvas");
    s.width = s.height = size;
    paint(s.getContext("2d")!, size);
    sprites.set(key, s);
  }
  return s;
}

/** A soft round glow. */
function glow(color: string) {
  return sprite(`glow|${color}`, 128, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, rgba(color, 0.95));
    g.addColorStop(0.18, rgba(color, 0.45));
    g.addColorStop(0.45, rgba(color, 0.12));
    g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
}

/** A lit sphere. Variant 0 rocky (craters), 1 banded gas giant, 2 icy. */
function planet(color: string, variant: number) {
  return sprite(`planet|${color}|${variant}`, 128, (c, s) => {
    const R = s / 2 - 1;
    c.save();
    c.beginPath();
    c.arc(s / 2, s / 2, R, 0, Math.PI * 2);
    c.clip();
    // Base: lit from the top left.
    const base = c.createRadialGradient(s * 0.34, s * 0.3, s * 0.02, s * 0.5, s * 0.5, R * 1.05);
    base.addColorStop(0, shade(color, variant === 2 ? 0.85 : 0.6));
    base.addColorStop(0.35, variant === 2 ? shade(color, 0.35) : color);
    base.addColorStop(0.8, shade(color, -0.55));
    base.addColorStop(1, shade(color, -0.85));
    c.fillStyle = base;
    c.fillRect(0, 0, s, s);
    if (variant === 1) {
      // Gas giant bands.
      for (let i = 0; i < 7; i++) {
        const y = s * (0.18 + i * 0.1 + (i % 2) * 0.02);
        c.fillStyle = i % 2 ? `rgba(255,255,255,0.10)` : `rgba(0,0,0,0.14)`;
        c.fillRect(0, y, s, s * (0.035 + (i % 3) * 0.015));
      }
    } else if (variant === 0) {
      // A few craters.
      const spots = [
        [0.62, 0.36, 0.09],
        [0.4, 0.62, 0.07],
        [0.7, 0.66, 0.05],
        [0.3, 0.38, 0.04],
      ];
      for (const [x, y, r] of spots) {
        c.fillStyle = "rgba(0,0,0,0.18)";
        c.beginPath();
        c.arc(s * x, s * y, s * r, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "rgba(255,255,255,0.08)";
        c.beginPath();
        c.arc(s * x - s * r * 0.25, s * y - s * r * 0.25, s * r * 0.6, 0, Math.PI * 2);
        c.fill();
      }
    }
    // Night side.
    const night = c.createRadialGradient(s * 0.78, s * 0.8, s * 0.05, s * 0.72, s * 0.74, R * 1.2);
    night.addColorStop(0, "rgba(0,0,8,0.55)");
    night.addColorStop(1, "rgba(0,0,8,0)");
    c.fillStyle = night;
    c.fillRect(0, 0, s, s);
    c.restore();
    // Rim light.
    c.strokeStyle = rgba("#ffffff", 0.18);
    c.lineWidth = s * 0.02;
    c.beginPath();
    c.arc(s / 2, s / 2, R - s * 0.01, Math.PI * 1.05, Math.PI * 1.75);
    c.stroke();
  });
}

/** A white-hot star core with a coloured corona. */
function starCore(color: string) {
  return sprite(`core|${color}`, 128, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.22, "rgba(255,255,255,0.95)");
    g.addColorStop(0.4, rgba(color, 0.85));
    g.addColorStop(0.7, rgba(color, 0.2));
    g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
}

// ---------------------------------------------------------------------------
// Background: starfield, haze, shooting stars (screen space)
// ---------------------------------------------------------------------------

interface Star {
  x: number;
  y: number;
  size: number;
  depth: number;
  phase: number;
  speed: number;
  color: string;
}

let starfield: Star[] | null = null;
function stars(): Star[] {
  if (starfield) return starfield;
  const out: Star[] = [];
  for (let i = 0; i < 620; i++) {
    const h = (k: number) => hash01(`star${i}:${k}`);
    const bright = h(3) > 0.94;
    out.push({
      x: h(1),
      y: h(2),
      size: bright ? 1.2 + h(4) * 1.1 : 0.35 + h(4) * 0.8,
      depth: 0.15 + h(5) * 0.85,
      phase: h(6) * Math.PI * 2,
      speed: 0.6 + h(7) * 2.2,
      color: STELLAR[Math.floor(h(8) * STELLAR.length)],
    });
  }
  starfield = out;
  return out;
}

const shooting = { next: 3, x: 0, y: 0, dx: 0, dy: 0, born: -10 };

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Deep space, galactic glow and haze, painted once per canvas size (the costly full-screen layers). */
const SKY_PAD = 80;
let sky: { w: number; h: number; canvas: HTMLCanvasElement } | null = null;
function skyLayer(w: number, h: number) {
  if (sky && sky.w === w && sky.h === h) return sky.canvas;
  const W = Math.ceil(w + SKY_PAD * 2);
  const H = Math.ceil(h + SKY_PAD * 2);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d")!;
  c.fillStyle = SPACE_BG;
  c.fillRect(0, 0, W, H);
  const core = c.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
  core.addColorStop(0, "rgba(30,36,86,0.4)");
  core.addColorStop(0.45, "rgba(12,14,40,0.25)");
  core.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = core;
  c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = "lighter";
  const haze: [number, number, number, string, number][] = [
    [0.18, 0.78, 0.55, "#0ea5e9", 0.06],
    [0.82, 0.2, 0.6, "#a21caf", 0.06],
    [0.62, 0.72, 0.4, "#4f46e5", 0.05],
  ];
  for (const [x, y, r, color, a] of haze) {
    const R = Math.max(W, H) * r;
    c.globalAlpha = a;
    c.drawImage(glow(color), x * W - R, y * H - R, R * 2, R * 2);
  }
  sky = { w, h, canvas };
  return canvas;
}

export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, panX: number, panY: number, t: number, animate: boolean) {
  // Deep space, drifting a little with time and barely with the pan (it is far away).
  const dx = Math.max(-SKY_PAD, Math.min(SKY_PAD, panX * 0.02 + (animate ? Math.sin(t * 0.05) * 18 : 0)));
  const dy = Math.max(-SKY_PAD, Math.min(SKY_PAD, panY * 0.02 + (animate ? Math.cos(t * 0.04) * 14 : 0)));
  ctx.drawImage(skyLayer(w, h), -SKY_PAD + dx, -SKY_PAD + dy);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // Stars: nearer ones move more with the pan (parallax) and twinkle.
  for (const s of stars()) {
    const x = mod(s.x * w + panX * s.depth * 0.12, w);
    const y = mod(s.y * h + panY * s.depth * 0.12, h);
    const tw = animate ? 0.55 + 0.45 * Math.sin(t * s.speed + s.phase) : 0.8;
    const a = (0.25 + s.depth * 0.75) * tw;
    if (s.size > 1.1) {
      const R = s.size * 5;
      ctx.globalAlpha = a * 0.6;
      ctx.drawImage(glow(s.color), x - R, y - R, R * 2, R * 2);
      // A small four-point sparkle on the brightest stars.
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = s.color;
      ctx.fillRect(x - s.size * 3.5, y - 0.35, s.size * 7, 0.7);
      ctx.fillRect(x - 0.35, y - s.size * 3.5, 0.7, s.size * 7);
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = s.color;
    ctx.fillRect(x - s.size / 2, y - s.size / 2, s.size, s.size);
  }

  // The odd shooting star.
  if (animate) {
    if (t > shooting.next) {
      shooting.born = t;
      shooting.next = t + 5 + hash01(`shoot${Math.floor(t)}`) * 7;
      shooting.x = w * (0.15 + hash01(`sx${Math.floor(t)}`) * 0.7);
      shooting.y = h * (0.05 + hash01(`sy${Math.floor(t)}`) * 0.4);
      const ang = Math.PI * (0.15 + hash01(`sa${Math.floor(t)}`) * 0.2);
      shooting.dx = Math.cos(ang);
      shooting.dy = Math.sin(ang);
    }
    const age = t - shooting.born;
    if (age >= 0 && age < 0.9) {
      const p = age / 0.9;
      const hx = shooting.x + shooting.dx * p * w * 0.35;
      const hy = shooting.y + shooting.dy * p * w * 0.35;
      const len = 140 * (1 - p * 0.5);
      const g = ctx.createLinearGradient(hx, hy, hx - shooting.dx * len, hy - shooting.dy * len);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - p)})`);
      g.addColorStop(1, "rgba(160,190,255,0)");
      ctx.globalAlpha = 1;
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - shooting.dx * len, hy - shooting.dy * len);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The galaxy (graph space)
// ---------------------------------------------------------------------------

export interface GalaxyInput {
  nodes: SpaceNode[];
  links: SpaceLink[];
  k: number;
  t: number;
  animate: boolean;
  active: string | null;
  selected: string | null;
  neighbors: Set<string> | null;
  matches: Set<string> | null;
  byLayer: boolean;
  layerIndex: Map<string, number>;
  nodeSize: number;
  linkWidth: number;
  arrows: boolean;
  labelZoom: number;
  /** Nodes with at least this many links are drawn as stars. */
  hubDegree: number;
  font: string;
  /** How far the galaxy has turned (radians). Labels and sunlight stay screen-upright. */
  rot?: number;
}

/** Stamps a sprite centred on (x, y), turned back by `rot` so its lighting stays fixed on screen. */
function stampUpright(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, r: number, rot: number) {
  if (!rot) {
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-rot);
  ctx.drawImage(img, -r, -r, r * 2, r * 2);
  ctx.restore();
}

export function drawGalaxy(ctx: CanvasRenderingContext2D, g: GalaxyInput) {
  const { nodes, links, k, t, active, neighbors, matches } = g;
  const rot = g.rot ?? 0;
  const inFocus = (id: string) => {
    if (matches && !matches.has(id)) return false;
    if (active) return id === active || neighbors!.has(id);
    return true;
  };
  const colorOf = new Map(nodes.map((n) => [n.id, nodeColor(n, g.byLayer, g.layerIndex)]));

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // District nebulae: a coloured cloud where each district's nodes gather.
  if (g.byLayer || nodes.length > 0) {
    const acc = new Map<string, { x: number; y: number; xx: number; yy: number; n: number }>();
    for (const n of nodes) {
      const a = acc.get(n.layer) ?? { x: 0, y: 0, xx: 0, yy: 0, n: 0 };
      a.x += n.x!;
      a.y += n.y!;
      a.xx += n.x! * n.x!;
      a.yy += n.y! * n.y!;
      a.n += 1;
      acc.set(n.layer, a);
    }
    for (const [layer, a] of acc) {
      if (a.n < 3) continue;
      const cx = a.x / a.n;
      const cy = a.y / a.n;
      const spread = Math.sqrt(Math.max(0, a.xx / a.n - cx * cx + a.yy / a.n - cy * cy));
      const R = Math.max(60, spread * 1.6);
      const color = g.byLayer ? COSMIC[(g.layerIndex.get(layer) ?? 0) % COSMIC.length] : ["#6366f1", "#0ea5e9", "#a855f7"][(g.layerIndex.get(layer) ?? 0) % 3];
      const breathe = g.animate ? 1 + Math.sin(t * 0.3 + (g.layerIndex.get(layer) ?? 0)) * 0.04 : 1;
      // Nebulae are for the wide view; they thin out as you fly in.
      const zoomFade = Math.min(1, 1.3 / Math.max(k, 0.01));
      ctx.globalAlpha = (g.byLayer ? 0.11 : 0.055) * zoomFade;
      ctx.drawImage(glow(color), cx - R * breathe, cy - R * breathe, R * 2 * breathe, R * 2 * breathe);
    }
    ctx.globalAlpha = 1;
  }

  // Constellation lines: hairlines that stay thin at any zoom.
  const width = (0.7 * g.linkWidth) / k;
  ctx.lineWidth = width;
  ctx.strokeStyle = active || matches ? "rgba(120,150,255,0.035)" : `rgba(130,160,255,${Math.min(0.13, 0.07 + 0.03 / Math.max(k, 0.3))})`;
  ctx.beginPath();
  const hot: SpaceLink[] = [];
  for (const l of links) {
    const a = l.source as SpaceNode;
    const b = l.target as SpaceNode;
    if (active && (a.id === active || b.id === active)) {
      hot.push(l);
      continue;
    }
    ctx.moveTo(a.x!, a.y!);
    ctx.lineTo(b.x!, b.y!);
  }
  ctx.stroke();
  const activeColor = active ? colorOf.get(active) ?? "#ffffff" : "#ffffff";
  if (hot.length) {
    ctx.lineWidth = width * 1.8;
    ctx.strokeStyle = rgba(activeColor, 0.55);
    ctx.beginPath();
    for (const l of hot) {
      const a = l.source as SpaceNode;
      const b = l.target as SpaceNode;
      ctx.moveTo(a.x!, a.y!);
      ctx.lineTo(b.x!, b.y!);
    }
    ctx.stroke();
  }

  // Comets flowing along links, source -> target: along the highlighted links,
  // or a quiet sample of the whole graph when nothing is selected.
  if (g.animate) {
    const flow = hot.length ? hot : links.filter((l, i) => l.kind === "edge" && i % Math.max(1, Math.floor(links.length / 90)) === 0);
    const cr = Math.max(1.2, 2.6 / Math.sqrt(k));
    for (let i = 0; i < flow.length; i++) {
      const l = flow[i];
      const a = l.source as SpaceNode;
      const b = l.target as SpaceNode;
      const color = hot.length ? activeColor : colorOf.get(a.id) ?? "#ffffff";
      const speed = hot.length ? 0.45 : 0.18;
      for (const offset of hot.length ? [0, 0.5] : [0]) {
        const p = mod(t * speed + hash01(`${a.id}>${b.id}`) + offset, 1);
        const x = a.x! + (b.x! - a.x!) * p;
        const y = a.y! + (b.y! - a.y!) * p;
        const fade = Math.sin(p * Math.PI);
        ctx.globalAlpha = (hot.length ? 1 : 0.6) * fade;
        ctx.drawImage(glow(color), x - cr * 3, y - cr * 3, cr * 6, cr * 6);
        ctx.globalAlpha = fade;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x - cr * 0.3, y - cr * 0.3, cr * 0.6, cr * 0.6);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Direction arrows (optional).
  if (g.arrows && k > 0.6) {
    ctx.fillStyle = "rgba(180,200,255,0.55)";
    for (const l of links) {
      if (l.kind !== "edge") continue;
      const a = l.source as SpaceNode;
      const b = l.target as SpaceNode;
      const ang = Math.atan2(b.y! - a.y!, b.x! - a.x!);
      const tip = b.r * g.nodeSize + 1;
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

  // Glows first (additive), so bodies sit inside their light.
  for (const n of nodes) {
    const focus = inFocus(n.id);
    const color = colorOf.get(n.id)!;
    const hub = n.degree >= g.hubDegree;
    const r = n.r * g.nodeSize * (n.id === active ? 1.35 : 1);
    const pulse = g.animate ? 1 + Math.sin(t * 1.6 + hash01(n.id) * 6.28) * 0.08 : 1;
    // Glow grows with the body but never past a fixed size on screen, so
    // zooming in shows planets, not a wall of light.
    const reach = hub ? 5.5 : n.id === active ? 4.5 : 3;
    const R = Math.min(r * reach, r * 1.4 + (hub ? 46 : 16) / k) * pulse;
    ctx.globalAlpha = (focus ? 1 : 0.12) * (hub ? 0.7 : 0.5);
    ctx.drawImage(glow(color), n.x! - R, n.y! - R, R * 2, R * 2);
    // Diffraction spikes on the biggest stars.
    if (hub && focus && r * k > 3) {
      const len = Math.min(r * 5, r * 1.2 + 38 / k) * pulse;
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = color;
      const th = Math.min(1.1 / k, Math.max(0.3 / k, r * 0.08));
      ctx.fillRect(n.x! - len, n.y! - th / 2, len * 2, th);
      ctx.fillRect(n.x! - th / 2, n.y! - len, th, len * 2);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  // Bodies.
  for (const n of nodes) {
    const focus = inFocus(n.id);
    const color = colorOf.get(n.id)!;
    const hub = n.degree >= g.hubDegree;
    const r = n.r * g.nodeSize * (n.id === active ? 1.35 : 1);
    ctx.globalAlpha = focus ? 1 : 0.18;
    const ringed = RINGED.has(n.type) && !hub;
    const tilt = (hash01(`${n.id}tilt`) - 0.5) * 0.9;
    const ring = (from: number, to: number) => {
      ctx.strokeStyle = rgba(color, 0.55);
      ctx.lineWidth = r * 0.26;
      ctx.beginPath();
      ctx.ellipse(n.x!, n.y!, r * 1.95, r * 0.55, tilt, from, to);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = r * 0.07;
      ctx.beginPath();
      ctx.ellipse(n.x!, n.y!, r * 1.7, r * 0.47, tilt, from, to);
      ctx.stroke();
    };
    if (ringed && r * k > 2.2) ring(Math.PI, Math.PI * 2); // far side of the ring, behind the planet
    if (hub) {
      const R = r * 1.45;
      ctx.drawImage(starCore(color), n.x! - R, n.y! - R, R * 2, R * 2);
    } else if (r * k < 1.6) {
      // Too small to shade: a point of light.
      ctx.fillStyle = shade(color, 0.5);
      ctx.fillRect(n.x! - r * 0.7, n.y! - r * 0.7, r * 1.4, r * 1.4);
    } else {
      stampUpright(ctx, planet(color, Math.floor(hash01(`${n.id}v`) * 3)), n.x!, n.y!, r, rot);
    }
    if (ringed && r * k > 2.2) ring(0, Math.PI); // near side, in front
  }
  ctx.globalAlpha = 1;

  // Selection: a pulsing halo and a small moon on an orbit.
  const selectedNode = g.selected ? nodes.find((n) => n.id === g.selected) : undefined;
  if (selectedNode) {
    const n = selectedNode;
    const color = colorOf.get(n.id)!;
    const r = n.r * g.nodeSize * (n.id === active ? 1.35 : 1);
    const orbit = r * 2.6 + 6 / k;
    ctx.strokeStyle = rgba(color, 0.5);
    ctx.lineWidth = 1 / k;
    ctx.setLineDash([3 / k, 4 / k]);
    ctx.beginPath();
    ctx.arc(n.x!, n.y!, orbit, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    const halo = r + (4 + (g.animate ? Math.sin(t * 3) * 2 : 0)) / k;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1.4 / k;
    ctx.beginPath();
    ctx.arc(n.x!, n.y!, halo, 0, Math.PI * 2);
    ctx.stroke();
    const ang = g.animate ? t * 1.2 : 0.8;
    const mx = n.x! + Math.cos(ang) * orbit;
    const my = n.y! + Math.sin(ang) * orbit;
    const mr = Math.max(1.2 / k, r * 0.28);
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(glow("#ffffff"), mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
    ctx.globalCompositeOperation = "source-over";
    stampUpright(ctx, planet("#d4d8e8", 0), mx, my, mr, rot);
  }

  // Labels fade in as you zoom; focused ones always show.
  const fade = Math.max(0, Math.min(1, (k - g.labelZoom + 0.4) / 0.4));
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `500 ${11 / k}px ${g.font}`;
  for (const n of nodes) {
    const forced = n.id === active || (neighbors?.has(n.id) && neighbors.size <= 24) || (matches?.has(n.id) && matches.size <= 30);
    const a = forced ? 1 : inFocus(n.id) ? fade : fade * 0.2;
    if (a <= 0.02) continue;
    const r = n.r * g.nodeSize * (n.degree >= g.hubDegree ? 1.6 : 1);
    ctx.fillStyle = n.id === active ? `rgba(255,255,255,${a})` : `rgba(214,222,255,${a * 0.85})`;
    if (rot) {
      // Keep text level while the galaxy turns.
      ctx.save();
      ctx.translate(n.x!, n.y!);
      ctx.rotate(-rot);
      ctx.fillText(n.label, 0, r + 4 / k);
      ctx.restore();
    } else {
      ctx.fillText(n.label, n.x!, n.y! + r + 4 / k);
    }
  }
  ctx.restore();
}
