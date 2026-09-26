"use client";

// Building blocks for the system model: palettes, the engraved satin material,
// orthogonal dependency routing, and plinth engravings laid out with Pretext.

import * as THREE from "three";
import { measureLineStats, prepareWithSegments } from "@chenglou/pretext";
import { CELL, type CityLayout } from "@/lib/city";
import { BRAND, STATE } from "@/lib/palette";

/* ─── Palette ─────────────────────────────────────────────────────────────
   Charcoal + acid. Two studios: a charcoal one (dark resin volumes, like a product
   render) and a bone one (white ceramic). Acid marks selection and Bob; state colours
   mean state. Layer accents come from lib/palette and are used as thin marks only. */


export interface ModelPalette {
  background: string;
  plinthTop: string;
  plinthSide: string;
  plate: string;
  building: string;
  buildingRoughness: number;
  buildingMetalness: number;
  recede: string;
  traceIdle: string;
  engrave: string;
  engraveHighlight: string;
  grid: string;
  gridSection: string;
  glass: string;
  /** Window glass on facades. */
  window: string;
  scaffold: string;
  annex: string;
}

export const ACID = BRAND.acid;
export const SIGNAL = STATE.impact;
export const FIXED = STATE.fixed;
export const PII_GOLD = STATE.pii;
export const BRASS = "#b8925a";
export const SLATE = "#6f86a6";
export const COPPER = "#c0714a";

export const PALETTES: Record<"light" | "dark", ModelPalette> = {
  light: {
    background: "#f2f1ec",
    plinthTop: "#e8e6df",
    plinthSide: "#1a1b17",
    plate: "#efede7",
    building: "#f6f5f0",
    buildingRoughness: 0.58,
    buildingMetalness: 0,
    recede: "#dcdad3",
    traceIdle: "#8b8a82",
    engrave: "rgba(26,27,23,0.78)",
    engraveHighlight: "rgba(255,255,255,0.75)",
    grid: "#dcdad2",
    gridSection: "#cfccc3",
    glass: "#dfe7e4",
    window: "#7d8a90",
    scaffold: "#6d6e66",
    annex: "#ebe8df",
  },
  dark: {
    background: "#0b0c0a",
    plinthTop: "#131411",
    plinthSide: "#1b1d18",
    plate: "#191b17",
    building: "#6a6d63",
    buildingRoughness: 0.5,
    buildingMetalness: 0.08,
    recede: "#171915",
    traceIdle: "#474a41",
    engrave: "rgba(0,0,0,0.8)",
    engraveHighlight: "rgba(216,245,63,0.22)",
    grid: "#1a1c17",
    gridSection: "#22251e",
    glass: "#9fb2ab",
    window: "#141612",
    scaffold: "#8d9084",
    annex: "#4a4c44",
  },
};

/* ─── Facade material ─────────────────────────────────────────────────────
   One shader program for every building; the facade is drawn in world space.
     Grooves   a hairline at every floor slab.
     Glazing   ribbon windows (horizontal) or mullion glazing (vertical), reflective.
     Lobby     a recessed glass ground floor on glazed buildings.
     Hatch     fine diagonal lines over the untested share of the height.
   Colour changes (selection, impact) tint the walls; the glass stays glass. */

export const FLOOR = 0.7;

export const FACADE = { plain: 0, ribbons: 1, mullions: 2 } as const;

export interface Facade {
  /** FACADE.plain, .ribbons or .mullions. */
  pattern: number;
  /** World height (above the plate) below which the facade is hatched as untested. */
  hatch: number;
  /** World y of the building's base. */
  base: number;
}

export function engravedMaterial(p: ModelPalette, color = p.building, facade: Facade = { pattern: 0, hatch: 0, base: 0 }) {
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: p.buildingRoughness,
    metalness: p.buildingMetalness,
    clearcoat: p.buildingMetalness > 0 ? 0.5 : 0.15,
    clearcoatRoughness: 0.35,
  });
  const glass = new THREE.Color(p.window);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFloor = { value: FLOOR };
    shader.uniforms.uPattern = { value: facade.pattern };
    shader.uniforms.uHatch = { value: facade.hatch };
    shader.uniforms.uBase = { value: facade.base };
    shader.uniforms.uGlass = { value: glass };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;\nuniform float uFloor;\nuniform float uPattern;\nuniform float uHatch;\nuniform float uBase;\nuniform vec3 uGlass;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 wn = normalize(vWNormal);
        float ly = vWPos.y - uBase;
        float wall = 1.0 - step(0.7, abs(wn.y));
        float fl = fract(ly / uFloor);
        float groove = smoothstep(0.0, 0.035, fl) * (1.0 - smoothstep(0.965, 1.0, fl));
        float along = abs(wn.x) > 0.5 ? vWPos.z : vWPos.x;
        float winMask = 0.0;
        if (uPattern > 0.5 && uPattern < 1.5) {
          winMask = smoothstep(0.34, 0.37, fl) * (1.0 - smoothstep(0.8, 0.83, fl));
          // Thin mullions divide each ribbon into panes.
          float pane = fract(along / 0.42);
          winMask *= smoothstep(0.03, 0.06, pane) * (1.0 - smoothstep(0.94, 0.97, pane));
        } else if (uPattern > 1.5) {
          float fa = fract(along / 0.36);
          winMask = smoothstep(0.2, 0.24, fa) * (1.0 - smoothstep(0.76, 0.8, fa)) * step(0.1, fl) * (1.0 - step(0.92, fl));
        }
        float lobby = uPattern > 0.5 ? step(0.06, ly) * (1.0 - step(0.58, ly)) : 0.0;
        winMask = max(winMask * step(0.62, ly), lobby) * wall;
        diffuseColor.rgb *= mix(1.0, mix(0.86, 1.0, groove), wall);
        diffuseColor.rgb = mix(diffuseColor.rgb, uGlass, winMask * 0.9);
        float hatch = step(fract((ly + along) * 2.4), 0.24) * wall * (1.0 - step(uHatch, ly)) * (1.0 - winMask);
        diffuseColor.rgb *= 1.0 - hatch * 0.2;
        diffuseColor.rgb *= mix(0.8, 1.0, smoothstep(0.0, 1.6, ly));`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.08, winMask);",
      );
  };
  mat.customProgramCacheKey = () => "facade-v3";
  return mat;
}

/* ─── Dependency routing ──────────────────────────────────────────────────
   Dependencies run as traces on the model's floor, like a circuit board or a
   transit map: out of the used file, along the streets, into its user. */

export interface Route {
  from: string;
  to: string;
  /** Found by Bob rather than the parser. */
  bob: boolean;
  points: THREE.Vector3[];
  /** Cumulative length at each point, for things that travel along the route. */
  lengths: number[];
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Street centre lines between and around the district plates. */
function streets(layout: CityLayout, gap: number) {
  const zs = new Set<number>();
  for (const d of layout.districts) {
    zs.add(+(d.z - gap / 2).toFixed(3));
    zs.add(+(d.z + d.d + gap / 2).toFixed(3));
  }
  return [...zs].sort((a, b) => a - b);
}

/** Rounded polyline through orthogonal corners. */
function fillet(corners: THREE.Vector3[], radius: number) {
  const out: THREE.Vector3[] = [corners[0]];
  for (let i = 1; i < corners.length - 1; i++) {
    const a = corners[i - 1];
    const b = corners[i];
    const c = corners[i + 1];
    const r = Math.min(radius, a.distanceTo(b) / 2, b.distanceTo(c) / 2);
    if (r < 0.01) {
      out.push(b);
      continue;
    }
    const p0 = b.clone().add(a.clone().sub(b).setLength(r));
    const p1 = b.clone().add(c.clone().sub(b).setLength(r));
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      // Quadratic Bézier with the corner as control point.
      out.push(
        p0.clone().multiplyScalar((1 - t) * (1 - t)).add(b.clone().multiplyScalar(2 * (1 - t) * t)).add(p1.clone().multiplyScalar(t * t)),
      );
    }
  }
  out.push(corners[corners.length - 1]);
  return out;
}

export function routeLinks(
  links: { from: string; to: string; bob?: boolean }[],
  layout: CityLayout,
  y: number,
  gap = 5,
): Route[] {
  const lanes = streets(layout, gap);
  const nearestStreet = (z: number) => lanes.reduce((best, s) => (Math.abs(s - z) < Math.abs(best - z) ? s : best), lanes[0] ?? z);
  const routes: Route[] = [];
  for (const l of links) {
    // Data flows from the imported file (to) into the importer (from).
    const a = layout.positions.get(l.to);
    const b = layout.positions.get(l.from);
    if (!a || !b) continue;
    const h = hash(l.from + ">" + l.to);
    const lane = ((h % 7) - 3) * 0.16;
    const sameRow = Math.abs(a.z - b.z) < 0.01;
    // Same row: run between the rows of buildings; otherwise use a street.
    const zm = sameRow ? a.z + CELL / 2 + lane * 0.5 : nearestStreet((a.z + b.z) / 2) + lane;
    const xa = a.x + ((h >> 4) % 3 - 1) * 0.28;
    const xb = b.x + ((h >> 7) % 3 - 1) * 0.28;
    const corners = [
      new THREE.Vector3(xa, y, a.z),
      new THREE.Vector3(xa, y, zm),
      new THREE.Vector3(xb, y, zm),
      new THREE.Vector3(xb, y, b.z),
    ];
    const points = fillet(corners, 0.9);
    const lengths = [0];
    for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
    routes.push({ from: l.from, to: l.to, bob: Boolean(l.bob), points, lengths });
  }
  return routes;
}

/** Point at distance `d` along a route. */
export function pointAt(route: Route, d: number, out: THREE.Vector3) {
  const total = route.lengths[route.lengths.length - 1];
  const t = THREE.MathUtils.clamp(d, 0, total);
  let i = 1;
  while (i < route.lengths.length - 1 && route.lengths[i] < t) i++;
  const seg = route.lengths[i] - route.lengths[i - 1] || 1;
  return out.copy(route.points[i - 1]).lerp(route.points[i], (t - route.lengths[i - 1]) / seg);
}

/* ─── Engravings ──────────────────────────────────────────────────────────
   Text cut into the plinth. Pretext measures each line without touching the
   DOM, so names shrink to fit their plate exactly. */

export interface EngraveLine {
  text: string;
  /** Size in scene units. */
  size: number;
  weight?: number;
  mono?: boolean;
  tracking?: number;
}

const PX_PER_UNIT = 96;

function family(mono: boolean) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(mono ? "--font-geist-mono" : "--font-geist-sans").trim();
  return v || (mono ? "ui-monospace, monospace" : "ui-sans-serif, system-ui, sans-serif");
}

export function engraveTexture(lines: EngraveLine[], widthUnits: number, p: ModelPalette, align: "center" | "left" = "center") {
  const W = Math.max(8, Math.round(widthUnits * PX_PER_UNIT));
  const gapPx = 0.28 * PX_PER_UNIT;
  const sized = lines.map((l) => {
    let px = l.size * PX_PER_UNIT;
    const tracking = (l.tracking ?? 0) * px;
    const font = (s: number) => `${l.weight ?? 500} ${s}px ${family(Boolean(l.mono))}`;
    // Shrink until the line fits on one row.
    for (let i = 0; i < 12; i++) {
      const prepared = prepareWithSegments(l.text, font(px), { letterSpacing: tracking });
      const { maxLineWidth } = measureLineStats(prepared, 1e7);
      if (maxLineWidth <= W * 0.96) break;
      px *= (W * 0.96) / maxLineWidth;
    }
    return { ...l, px, font: font(px), tracking };
  });
  const H = Math.ceil(sized.reduce((n, l) => n + l.px * 1.2, 0) + gapPx * (sized.length - 1) + 8);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  let y = 4;
  for (const l of sized) {
    g.font = l.font;
    (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${l.tracking}px`;
    g.textBaseline = "top";
    g.textAlign = align;
    const x = align === "center" ? W / 2 : 0;
    // Cut: a bright lip below, the dark groove on top.
    g.fillStyle = p.engraveHighlight;
    g.fillText(l.text, x, y + Math.max(1, l.px * 0.04));
    g.fillStyle = p.engrave;
    g.fillText(l.text, x, y);
    y += l.px * 1.2 + gapPx;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { texture: tex, width: widthUnits, height: H / PX_PER_UNIT };
}
