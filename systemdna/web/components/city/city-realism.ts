"use client";

// Realistic look for the 3D city.
//
// What it draws:
//  - Buildings: window facades, ground-floor shopfronts, awnings, roof edges,
//    plant rooms, water tanks, solar panels, stepped tower tops, soft contact shadows.
//  - Streets: asphalt, lane markings, crosswalks, traffic lights, street lamps,
//    moving and parked cars, people walking on the sidewalks.
//  - Nature: grass, trees, a lake with moving ripples.
//  - Sky: day, sunset and night skies with clouds, stars and a moon; sky reflections
//    on glass; distance haze; cloud shadows drifting over the city.
//  - Weather: clear, or rain (falling rain, wet roads, puddles, umbrellas).
//
// Everything is generated in code (canvas textures, instanced meshes), so there are
// no image downloads. Repeated things (trees, cars, people, lamps) are one draw call each.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FOOTPRINT, type CityData, type CityLayout } from "@/lib/city";

export type TimeOfDay = "day" | "dusk" | "night";
export type Weather = "clear" | "rain";

// Road width between blocks equals the layout's district gap (lib/city.ts).
const ROAD = 5;
const FLOOR_H = 0.9; // one storey, in scene units
const BAYS = 3; // windows across one face of a building
const TILES = 8; // window tiles across (and up) one facade texture

/** Small deterministic random numbers, so the city looks the same every time. */
export function seeded(seed: string | number) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** True when street lamps, lit windows and headlights should be on. */
function lightsOn(time: TimeOfDay) {
  return time !== "day";
}

// ---------------------------------------------------------------------------
// Sky colours. The last colour is the horizon: also used for haze and PNG export.
// ---------------------------------------------------------------------------

const SKY: Record<TimeOfDay, Record<Weather, [string, string, string]>> = {
  day: { clear: ["#7fb2e0", "#c4def2", "#eaf1f4"], rain: ["#7d8691", "#a3abb3", "#c2c8cc"] },
  dusk: { clear: ["#2a3563", "#b9718c", "#f3b688"], rain: ["#3a3f52", "#6e6670", "#968884"] },
  night: { clear: ["#05070f", "#10182c", "#1d2740"], rain: ["#07090e", "#12161f", "#1e232d"] },
};

export function skyBottom(time: TimeOfDay, weather: Weather = "clear") {
  return SKY[time][weather][2];
}

// ---------------------------------------------------------------------------
// Canvas textures (cached per session).
// ---------------------------------------------------------------------------

const cache = new Map<string, THREE.CanvasTexture>();

function canvasTexture(key: string, size: [number, number], draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = size[0];
  c.height = size[1];
  draw(c.getContext("2d")!, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, base: [number, number, number], spread: number, seed: string) {
  const rand = seeded(seed);
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const n = (rand() - 0.5) * spread;
    img.data[i * 4] = base[0] + n;
    img.data[i * 4 + 1] = base[1] + n;
    img.data[i * 4 + 2] = base[2] + n;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** A soft round blob that fades to nothing at its edge. Clouds are built from these. */
function puff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(0.6, `rgba(${rgb},${alpha * 0.55})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export type FacadeStyle = "glass" | "office" | "brick";

/**
 * An 8 x 8 block of window tiles (8 bays across, 8 storeys up).
 * `lit` draws the night version: only the windows, some glowing warm, some dark.
 * A bigger block means the lit pattern repeats less often.
 */
function facade(style: FacadeStyle, lit: boolean) {
  return canvasTexture(`facade-${style}-${lit}`, [512, 512], (ctx, w, h) => {
    const tile = w / TILES;
    const rand = seeded(`${style}-windows`);
    if (!lit) {
      if (style === "glass") {
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, "#5d7489");
        g.addColorStop(0.5, "#8aa3b8");
        g.addColorStop(1, "#4d6275");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      } else if (style === "office") {
        noise(ctx, w, h, [196, 192, 184], 18, "office");
      } else {
        noise(ctx, w, h, [150, 86, 66], 26, "brick");
        // Mortar lines.
        ctx.fillStyle = "rgba(210,196,180,0.55)";
        for (let y = 0; y < h; y += 8) {
          ctx.fillRect(0, y, w, 1);
          const off = (y / 8) % 2 ? 0 : 8;
          for (let x = off; x < w; x += 16) ctx.fillRect(x, y, 1, 8);
        }
      }
    } else {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);
    }
    for (let row = 0; row < TILES; row++) {
      for (let col = 0; col < TILES; col++) {
        const x = col * tile;
        const y = row * tile;
        const on = rand() < 0.42;
        const warm = rand();
        if (style === "glass") {
          if (!lit) {
            // Mullions and a floor band.
            ctx.fillStyle = "rgba(225,232,238,0.85)";
            ctx.fillRect(x, y, 3, tile);
            ctx.fillRect(x, y + tile - 6, tile, 6);
            ctx.fillStyle = `rgba(255,255,255,${0.05 + rand() * 0.12})`;
            ctx.fillRect(x + 4, y + 2, tile - 8, tile * 0.45);
          } else if (on) {
            ctx.fillStyle = warm > 0.7 ? "#d8ecff" : "#ffd79a";
            ctx.globalAlpha = 0.55 + rand() * 0.45;
            ctx.fillRect(x + 4, y + 2, tile - 8, tile - 10);
            ctx.globalAlpha = 1;
          }
        } else {
          const ww = style === "office" ? tile * 0.62 : tile * 0.4;
          const wh = style === "office" ? tile * 0.5 : tile * 0.55;
          const wx = x + (tile - ww) / 2;
          const wy = y + (tile - wh) / 2;
          if (!lit) {
            ctx.fillStyle = style === "office" ? "#2f3a46" : "#2a2d33";
            ctx.fillRect(wx, wy, ww, wh);
            // Some blinds half down.
            if (rand() < 0.3) {
              ctx.fillStyle = style === "office" ? "#cfc9bd" : "#d9cbb6";
              ctx.fillRect(wx, wy, ww, wh * (0.25 + rand() * 0.5));
            }
            ctx.fillStyle = "rgba(255,255,255,0.14)";
            ctx.fillRect(wx + 2, wy + 2, ww - 4, wh * 0.35);
            ctx.fillStyle = style === "office" ? "#e7e3dc" : "#c9b8a6";
            ctx.fillRect(wx - 2, wy + wh, ww + 4, 3); // sill
          } else if (on) {
            ctx.fillStyle = warm > 0.75 ? "#dcefff" : "#ffcf86";
            ctx.globalAlpha = 0.6 + rand() * 0.4;
            ctx.fillRect(wx, wy, ww, wh);
            ctx.globalAlpha = 1;
          }
        }
      }
    }
  });
}

/** Ground-floor shopfronts (two shops across). `lobby` is a tall glass lobby for towers. */
function storefront(kind: "shops" | "lobby", lit: boolean) {
  return canvasTexture(`store-${kind}-${lit}`, [256, 128], (ctx, w, h) => {
    const rand = seeded(`store-${kind}`);
    ctx.fillStyle = lit ? "#000000" : kind === "lobby" ? "#50565d" : "#3b3d42";
    ctx.fillRect(0, 0, w, h);
    const bay = w / 2;
    for (let i = 0; i < 2; i++) {
      const x = i * bay;
      if (kind === "shops") {
        // Sign band, big window and a door.
        if (!lit) {
          ctx.fillStyle = ["#2c2f35", "#1f2a36", "#3a2a24"][Math.floor(rand() * 3)];
          ctx.fillRect(x + 4, 6, bay - 8, 22);
          ctx.fillStyle = "rgba(240,236,228,0.8)";
          ctx.fillRect(x + 18, 14, bay * 0.45, 6);
        } else {
          ctx.fillStyle = rand() < 0.5 ? "#ffe2a8" : "#c9e6ff";
          ctx.fillRect(x + 18, 14, bay * 0.45, 6);
        }
        const g = ctx.createLinearGradient(0, 36, 0, h);
        g.addColorStop(0, lit ? "#ffd89a" : "#6f5a44");
        g.addColorStop(1, lit ? "#c88a45" : "#2d2620");
        ctx.fillStyle = g;
        ctx.fillRect(x + 8, 36, bay * 0.62, h - 44);
        ctx.fillStyle = lit ? "#8a6a40" : "#1b1c1f";
        ctx.fillRect(x + bay * 0.74, 44, bay * 0.18, h - 44);
        if (!lit) {
          ctx.fillStyle = "rgba(255,255,255,0.12)";
          ctx.fillRect(x + 10, 38, bay * 0.3, 20);
        }
      } else {
        // Tall glass panes with thin frames.
        for (let p = 0; p < 3; p++) {
          const px = x + 4 + (p * (bay - 8)) / 3;
          const pw = (bay - 8) / 3 - 4;
          const g = ctx.createLinearGradient(0, 0, 0, h);
          g.addColorStop(0, lit ? "#fff0cf" : "#9fb3c4");
          g.addColorStop(1, lit ? "#d9a45e" : "#3b4957");
          ctx.fillStyle = g;
          ctx.globalAlpha = lit ? 0.85 : 1;
          ctx.fillRect(px, 8, pw, h - 12);
          ctx.globalAlpha = 1;
        }
      }
    }
  });
}

function roofTexture() {
  return canvasTexture("roof", [128, 128], (ctx, w, h) => {
    noise(ctx, w, h, [92, 94, 98], 22, "roof");
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  });
}

function asphaltTexture() {
  return canvasTexture("asphalt", [256, 256], (ctx, w, h) => {
    noise(ctx, w, h, [58, 60, 64], 20, "asphalt");
    // Patches and cracks.
    const rand = seeded("asphalt-patches");
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(${rand() < 0.5 ? "30,32,36" : "80,82,86"},0.18)`;
      ctx.fillRect(rand() * w, rand() * h, 10 + rand() * 40, 8 + rand() * 30);
    }
    ctx.strokeStyle = "rgba(20,20,22,0.35)";
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      let x = rand() * w;
      let y = rand() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) ctx.lineTo((x += (rand() - 0.5) * 30), (y += (rand() - 0.5) * 30));
      ctx.stroke();
    }
  });
}

function sidewalkTexture() {
  return canvasTexture("sidewalk", [128, 128], (ctx, w, h) => {
    noise(ctx, w, h, [186, 184, 178], 14, "sidewalk");
    ctx.strokeStyle = "rgba(90,90,90,0.28)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= w; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, h);
      ctx.moveTo(0, i);
      ctx.lineTo(w, i);
      ctx.stroke();
    }
  });
}

function grassTexture() {
  return canvasTexture("grass", [256, 256], (ctx, w, h) => {
    noise(ctx, w, h, [92, 132, 70], 34, "grass");
    const rand = seeded("grass-patches");
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(${60 + rand() * 40},${100 + rand() * 50},${40 + rand() * 30},0.25)`;
      ctx.beginPath();
      ctx.arc(rand() * w, rand() * h, 6 + rand() * 18, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Radial fade so the grass melts into the sky at the edges. */
function fadeTexture() {
  return canvasTexture(
    "fade",
    [256, 256],
    (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w / 2);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.75, "#ffffff");
      g.addColorStop(1, "#000000");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    false,
  );
}

/** Soft dark square used as a contact shadow under each building. White = opaque. */
function contactShadowTexture() {
  return canvasTexture(
    "contact",
    [128, 128],
    (ctx, w, h) => {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 22;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(w * 0.26, h * 0.26, w * 0.48, h * 0.48);
    },
    false,
  );
}

/** Soft round glow, used for headlight pools. White = opaque. */
function glowTexture() {
  return canvasTexture(
    "glow",
    [64, 64],
    (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(1, "#000000");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    false,
  );
}

/** Small ripples for the lake surface (a normal map made from overlapping waves). */
function rippleTexture() {
  return canvasTexture(
    "ripples",
    [128, 128],
    (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      const rand = seeded("ripples");
      const waves = Array.from({ length: 6 }, () => ({ a: rand() * Math.PI * 2, f: 1 + Math.floor(rand() * 4), p: rand() * 6 }));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let nx = 0;
          let ny = 0;
          for (const wv of waves) {
            const kx = Math.cos(wv.a) * wv.f;
            const ky = Math.sin(wv.a) * wv.f;
            const c = Math.cos(((x * kx + y * ky) / w) * Math.PI * 2 + wv.p);
            nx += kx * c;
            ny += ky * c;
          }
          const i = (y * w + x) * 4;
          img.data[i] = 128 + nx * 9;
          img.data[i + 1] = 128 + ny * 9;
          img.data[i + 2] = 255;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    false,
  );
}

/** The sky behind the city: gradient plus clouds, or stars and a moon, or rain clouds. */
export function skyTexture(time: TimeOfDay, weather: Weather = "clear") {
  return canvasTexture(`sky-${time}-${weather}`, [512, 256], (ctx, w, h) => {
    const [top, mid, bottom] = SKY[time][weather];
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top);
    g.addColorStop(0.6, mid);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rand = seeded(`sky-${time}-${weather}`);

    if (weather === "rain") {
      // A heavy, even cloud cover.
      const rgb = time === "night" ? "40,44,54" : time === "dusk" ? "90,84,92" : "150,156,164";
      for (let i = 0; i < 70; i++) puff(ctx, rand() * w, rand() * h * 0.8, 30 + rand() * 60, rgb, 0.18 + rand() * 0.15);
      return;
    }
    if (time === "night") {
      // Stars, denser near the top, and a moon with a soft halo.
      for (let i = 0; i < 260; i++) {
        const y = Math.pow(rand(), 1.6) * h * 0.75;
        ctx.fillStyle = `rgba(255,255,255,${0.25 + rand() * 0.7})`;
        const s = rand() < 0.08 ? 1.6 : 0.9;
        ctx.fillRect(rand() * w, y, s, s);
      }
      puff(ctx, w * 0.8, h * 0.2, 34, "200,215,255", 0.35);
      ctx.fillStyle = "#f4f1e4";
      ctx.beginPath();
      ctx.arc(w * 0.8, h * 0.2, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(180,176,160,0.35)";
      ctx.beginPath();
      ctx.arc(w * 0.8 - 3, h * 0.2 - 2, 2.5, 0, Math.PI * 2);
      ctx.arc(w * 0.8 + 3, h * 0.2 + 3, 1.8, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (time === "dusk") {
      // The low sun glowing on the horizon.
      puff(ctx, w * 0.22, h * 0.95, 140, "255,190,120", 0.55);
      puff(ctx, w * 0.22, h * 0.95, 40, "255,236,200", 0.9);
    }
    // Puffy clouds: a few clusters of soft blobs.
    const rgb = time === "dusk" ? "255,196,170" : "255,255,255";
    for (let c = 0; c < 7; c++) {
      const cx = rand() * w;
      const cy = h * (0.25 + rand() * 0.45);
      const size = 14 + rand() * 20;
      for (let i = 0; i < 7; i++) puff(ctx, cx + (rand() - 0.5) * size * 4, cy + (rand() - 0.5) * size * 0.8, size * (0.6 + rand() * 0.7), rgb, 0.4);
    }
  });
}

/** Sky and ground colours used for reflections on glass and water. */
function environmentTexture(time: TimeOfDay, weather: Weather) {
  return canvasTexture(`env-${time}-${weather}`, [64, 256], (ctx, w, h) => {
    const [top, mid, bottom] = SKY[time][weather];
    const g = ctx.createLinearGradient(0, 0, 0, h);
    const ground = time === "night" ? "#0d0f15" : time === "dusk" ? "#4a3e3c" : "#6d716b";
    g.addColorStop(0, top);
    g.addColorStop(0.3, mid);
    g.addColorStop(0.49, bottom);
    g.addColorStop(0.51, ground);
    g.addColorStop(1, ground);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

// ---------------------------------------------------------------------------
// Buildings.
// ---------------------------------------------------------------------------

/**
 * Scales a box's side UVs so the window texture tiles per storey and per bay.
 * A random whole-tile offset per building stops neighbours looking identical.
 */
function tileSides(geo: THREE.BoxGeometry, height: number, rand: () => number) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const floors = Math.max(1, height / FLOOR_H);
  const ox = Math.floor(rand() * TILES) / TILES;
  const oy = Math.floor(rand() * TILES) / TILES;
  for (const face of [0, 1, 4, 5]) {
    for (let i = face * 4; i < face * 4 + 4; i++) {
      uv.setXY(i, uv.getX(i) * (BAYS / TILES) + ox, uv.getY(i) * (floors / TILES) + oy);
    }
  }
  uv.needsUpdate = true;
}

export function styleFor(height: number, language: string, rand: () => number): FacadeStyle {
  if (language === "markdown") return "brick";
  if (height > 12) return rand() < 0.8 ? "glass" : "office";
  if (height < 6.5) return rand() < 0.6 ? "brick" : "office";
  return rand() < 0.65 ? "office" : rand() < 0.5 ? "glass" : "brick";
}

/** Gives a geometry one flat colour (for merged, vertex-coloured detail meshes). */
function painted(geo: THREE.BufferGeometry, color: string) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

export interface RealBuilding {
  mesh: THREE.Mesh;
  /** Other meshes that belong to the building and can be clicked (a stepped top). */
  parts: THREE.Mesh[];
  /** Decoration: shopfronts, roof details, beacon. Not clickable. */
  extras: THREE.Mesh[];
  /** Every material of this building, so the whole thing can fade on its own. */
  mats: THREE.Material[];
  /** Everything that casts a shadow (turned off while the building is dimmed). */
  casters: THREE.Object3D[];
  /** Outline shown on hover and selection. */
  outline: THREE.LineSegments;
}

const AWNINGS = ["#8c2f2f", "#2f5d3a", "#27466b", "#b0892f", "#5a3e6b", "#3b3b3b"];

export function buildBuilding(
  path: string,
  pos: { x: number; z: number; h: number },
  opts: { language: string; tint?: string; time: TimeOfDay; tallest: boolean; landmark?: boolean },
): RealBuilding {
  const rand = seeded(path);
  const style = styleFor(pos.h, opts.language, rand);
  const w = FOOTPRINT * (0.88 + rand() * 0.12);
  const d = FOOTPRINT * (0.88 + rand() * 0.12);
  const lit = lightsOn(opts.time);
  const glow = opts.time === "night" ? 1.1 : opts.time === "dusk" ? 0.6 : 0;

  // Tall glass and office towers step in near the top. The top still ends at pos.h,
  // so arcs and labels line up. Landmarks keep a flat top for their coloured cap.
  const tierH = !opts.landmark && !opts.tallest && style !== "brick" && pos.h > 11 && rand() < 0.7 ? Math.min(3.2, pos.h * 0.18) : 0;
  const mainH = pos.h - tierH;

  const geo = new THREE.BoxGeometry(w, mainH, d);
  geo.translate(0, mainH / 2, 0);
  tileSides(geo, mainH, rand);

  const shade = 0.86 + rand() * 0.14;
  const baseColor = new THREE.Color(shade, shade, shade);
  if (opts.tint) baseColor.lerp(new THREE.Color(opts.tint), 0.35);
  const side = new THREE.MeshStandardMaterial({
    map: facade(style, false),
    color: baseColor,
    roughness: style === "glass" ? 0.18 : 0.85,
    metalness: style === "glass" ? 0.55 : 0.02,
    envMapIntensity: style === "glass" ? 1.6 : 0.6,
    emissiveMap: lit ? facade(style, true) : null,
    emissive: new THREE.Color(lit ? "#ffffff" : "#000000"),
    emissiveIntensity: glow,
  });
  const roof = new THREE.MeshStandardMaterial({ map: roofTexture(), color: new THREE.Color(0.9, 0.9, 0.92), roughness: 0.95 });
  // BoxGeometry face order: +x, -x, +y (roof), -y (bottom), +z, -z.
  const faces = [side, side, roof, roof, side, side];
  const mesh = new THREE.Mesh(geo, faces);
  mesh.position.set(pos.x, 0, pos.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.path = path;

  const parts: THREE.Mesh[] = [];
  const extras: THREE.Mesh[] = [];
  const mats: THREE.Material[] = [side, roof];
  const edgeGeos: THREE.BufferGeometry[] = [new THREE.EdgesGeometry(geo)];

  // The stepped top.
  const tw = w * 0.72;
  const td = d * 0.72;
  if (tierH) {
    const tgeo = new THREE.BoxGeometry(tw, tierH, td);
    tgeo.translate(0, mainH + tierH / 2, 0);
    tileSides(tgeo, tierH, rand);
    const tier = new THREE.Mesh(tgeo, faces);
    tier.position.copy(mesh.position);
    tier.castShadow = tier.receiveShadow = true;
    tier.userData.path = path;
    parts.push(tier);
    edgeGeos.push(new THREE.EdgesGeometry(tgeo));
  }

  // Ground floor: shopfronts, or a glass lobby under towers.
  const podH = FLOOR_H * 1.1;
  const hasPodium = mainH > podH + 0.6;
  if (hasPodium) {
    const pgeo = new THREE.BoxGeometry(w + 0.05, podH, d + 0.05);
    pgeo.translate(0, podH / 2, 0);
    const uv = pgeo.attributes.uv as THREE.BufferAttribute;
    for (const face of [0, 1, 4, 5]) for (let i = face * 4; i < face * 4 + 4; i++) uv.setX(i, uv.getX(i) * Math.max(1, Math.round(w)));
    const kind = style === "glass" ? "lobby" : "shops";
    const store = new THREE.MeshStandardMaterial({
      map: storefront(kind, false),
      roughness: 0.3,
      metalness: 0.15,
      emissiveMap: lit ? storefront(kind, true) : null,
      emissive: new THREE.Color(lit ? "#ffffff" : "#000000"),
      emissiveIntensity: opts.time === "night" ? 1.2 : opts.time === "dusk" ? 0.9 : 0,
    });
    const trim = new THREE.MeshStandardMaterial({ color: "#8d8c88", roughness: 0.8 });
    const podium = new THREE.Mesh(pgeo, [store, store, trim, trim, store, store]);
    podium.position.copy(mesh.position);
    podium.receiveShadow = true;
    extras.push(podium);
    mats.push(store, trim);
  }

  // Small details, merged into one vertex-coloured mesh per building.
  const bits: THREE.BufferGeometry[] = [];
  const box = (bw: number, bh: number, bd: number, x: number, y: number, z: number, color: string) => {
    const g = new THREE.BoxGeometry(bw, bh, bd);
    g.translate(x, y, z);
    bits.push(painted(g, color));
    return g;
  };

  // Parapet: a low wall around the main roof.
  const rim = style === "glass" ? "#5c646c" : style === "brick" ? "#7e4c3c" : "#bdb8ae";
  const ph = 0.14;
  const pt = 0.07;
  box(w, ph, pt, 0, mainH + ph / 2, d / 2 - pt / 2, rim);
  box(w, ph, pt, 0, mainH + ph / 2, -d / 2 + pt / 2, rim);
  box(pt, ph, d - pt * 2, w / 2 - pt / 2, mainH + ph / 2, 0, rim);
  box(pt, ph, d - pt * 2, -w / 2 + pt / 2, mainH + ph / 2, 0, rim);

  // Plant rooms and air-conditioning units on the top roof.
  const topW = tierH ? tw : w;
  const topD = tierH ? td : d;
  if (pos.h > 5) {
    const n = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const bw = 0.2 + rand() * 0.35;
      const bh = 0.15 + rand() * 0.3;
      const bd = 0.2 + rand() * 0.3;
      box(bw, bh, bd, (rand() - 0.5) * (topW - bw) * 0.7, pos.h + bh / 2, (rand() - 0.5) * (topD - bd) * 0.7, rand() < 0.5 ? "#9a9ca2" : "#b4b6ba");
    }
  }

  // Water tank on older brick buildings.
  let roofBusy = false;
  if (style === "brick" && pos.h > 4 && rand() < 0.55) {
    roofBusy = true;
    const tx = (rand() - 0.5) * (w - 0.6) * 0.6;
    const tz = (rand() - 0.5) * (d - 0.6) * 0.6;
    for (const [lx, lz] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) box(0.03, 0.25, 0.03, tx + lx, mainH + 0.125, tz + lz, "#3c3c3c");
    const tank = new THREE.CylinderGeometry(0.22, 0.22, 0.38, 12);
    tank.translate(tx, mainH + 0.25 + 0.19, tz);
    bits.push(painted(tank, "#7a5a3a"));
    const cone = new THREE.ConeGeometry(0.24, 0.14, 12);
    cone.translate(tx, mainH + 0.25 + 0.38 + 0.07, tz);
    bits.push(painted(cone, "#4a3b2e"));
  }

  // Solar panels on low office roofs.
  if (style === "office" && !tierH && !roofBusy && pos.h < 10 && rand() < 0.6) {
    const rows = 2 + Math.floor(rand() * 2);
    for (let r = 0; r < rows; r++) {
      const g = new THREE.BoxGeometry(w * 0.6, 0.02, 0.26);
      g.rotateX(-0.35);
      g.translate(0, mainH + 0.1, -d * 0.28 + (r * d * 0.56) / Math.max(1, rows - 1));
      bits.push(painted(g, "#1f2d4a"));
    }
  }

  // Awnings over the shopfronts.
  if (hasPodium && style !== "glass") {
    const n = 1 + Math.floor(rand() * 2);
    const start = Math.floor(rand() * 4);
    for (let i = 0; i < n; i++) {
      const faceIdx = (start + i * 2) % 4; // opposite faces when there are two
      const angle = [0, Math.PI / 2, Math.PI, -Math.PI / 2][faceIdx];
      const across = faceIdx % 2 ? d : w;
      const dist = (faceIdx % 2 ? w : d) / 2 + 0.025;
      const g = new THREE.BoxGeometry(across * 0.8, 0.03, 0.26);
      g.rotateX(0.35);
      g.translate(0, podH * 0.82, dist + 0.13);
      g.rotateY(angle);
      bits.push(painted(g, AWNINGS[Math.floor(rand() * AWNINGS.length)]));
    }
  }

  // Radio mast on the tallest building.
  if (opts.tallest) {
    const mast = new THREE.CylinderGeometry(0.03, 0.05, 2.2, 6);
    mast.translate(0, pos.h + 1.1, 0);
    bits.push(painted(mast, "#9a9ca2"));
  }

  if (bits.length) {
    const merged = mergeGeometries(bits.map((g) => g.toNonIndexed()));
    bits.forEach((g) => g.dispose());
    const detailMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1 });
    const details = new THREE.Mesh(merged, detailMat);
    details.position.copy(mesh.position);
    details.castShadow = details.receiveShadow = true;
    extras.push(details);
    mats.push(detailMat);
  }

  if (opts.tallest) {
    const beaconMat = new THREE.MeshStandardMaterial({ color: "#ff3b30", emissive: "#ff3b30", emissiveIntensity: lit ? 2.5 : 0.8 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), beaconMat);
    beacon.position.set(pos.x, pos.h + 2.25, pos.z);
    beacon.userData.blink = true;
    extras.push(beacon);
    mats.push(beaconMat);
  }

  const edges = edgeGeos.length > 1 ? mergeGeometries(edgeGeos) : edgeGeos[0];
  const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.95 }));
  outline.position.copy(mesh.position);
  outline.visible = false;
  outline.renderOrder = 5;

  const casters = [mesh, ...parts, ...extras.filter((x) => x.castShadow)];
  return { mesh, parts, extras, mats, casters, outline };
}

// ---------------------------------------------------------------------------
// The world around the buildings.
// ---------------------------------------------------------------------------

interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** A point on the loop around a rectangle, and the direction of travel. */
function lanePoint(r: Rect, s: number) {
  const perimeter = 2 * (r.w + r.d);
  let t = ((s % perimeter) + perimeter) % perimeter;
  if (t < r.w) return { x: r.x + t, z: r.z, angle: Math.PI / 2 };
  t -= r.w;
  if (t < r.d) return { x: r.x + r.w, z: r.z + t, angle: 0 };
  t -= r.d;
  if (t < r.w) return { x: r.x + r.w - t, z: r.z + r.d, angle: -Math.PI / 2 };
  t -= r.w;
  return { x: r.x, z: r.z + r.d - t, angle: Math.PI };
}

export interface World {
  /** Called every frame with seconds since the last frame. */
  update: (dt: number, elapsed: number) => void;
  /** Extent used to fit the sun's shadow camera. */
  radius: number;
}

export function buildWorld(scene: THREE.Scene, layout: CityLayout, data: CityData, time: TimeOfDay, weather: Weather = "clear"): World {
  const night = time === "night";
  const lit = lightsOn(time);
  const rain = weather === "rain";
  const rand = seeded(`world-${data.files.length}-${layout.size.w}`);
  const minX = Math.min(...layout.districts.map((d) => d.x)) - ROAD;
  const minZ = Math.min(...layout.districts.map((d) => d.z)) - ROAD;
  const maxX = Math.max(...layout.districts.map((d) => d.x + d.w)) + ROAD;
  const maxZ = Math.max(...layout.districts.map((d) => d.z + d.d)) + ROAD;
  const cityW = maxX - minX;
  const cityD = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const radius = Math.hypot(cityW, cityD) / 2;
  const maxH = Math.max(4, ...[...layout.positions.values()].map((p) => p.h));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();

  // Grass that fades into the sky.
  const grassSize = radius * 2.4 + 60;
  const grassTex = grassTexture().clone();
  grassTex.repeat.set(grassSize / 16, grassSize / 16);
  grassTex.needsUpdate = true;
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(grassSize, grassSize),
    new THREE.MeshStandardMaterial({
      map: grassTex,
      alphaMap: fadeTexture(),
      transparent: true,
      roughness: 1,
      envMapIntensity: 0.4,
      color: night ? "#b4c4cc" : rain ? "#c9d2c6" : "#ffffff",
    }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(cx, -0.32, cz);
  grass.receiveShadow = true;
  scene.add(grass);

  // Asphalt under the whole city: the gaps between blocks become streets.
  // Wet roads in the rain are darker and shinier, so they reflect the sky.
  const asphaltTex = asphaltTexture().clone();
  asphaltTex.repeat.set(cityW / 10, cityD / 10);
  asphaltTex.needsUpdate = true;
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(cityW, cityD),
    new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: rain ? 0.38 : 0.92,
      metalness: rain ? 0.25 : 0,
      envMapIntensity: rain ? 1.4 : 0.5,
      color: night ? "#9aa0ab" : rain ? "#9aa0a6" : "#ffffff",
    }),
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.set(cx, -0.26, cz);
  asphalt.receiveShadow = true;
  scene.add(asphalt);

  // Blocks: raised sidewalks with a kerb.
  const walkMat = new THREE.MeshStandardMaterial({ map: sidewalkTexture(), roughness: rain ? 0.55 : 0.9, envMapIntensity: 0.6 });
  const kerbMat = new THREE.MeshStandardMaterial({ color: "#d6d4ce", roughness: 0.8 });
  for (const d of layout.districts) {
    const tex = sidewalkTexture().clone();
    tex.repeat.set(d.w / 4, d.d / 4);
    tex.needsUpdate = true;
    const mat = walkMat.clone();
    mat.map = tex;
    const block = new THREE.Mesh(new THREE.BoxGeometry(d.w, 0.25, d.d), [kerbMat, kerbMat, mat, kerbMat, kerbMat, kerbMat]);
    block.position.set(d.x + d.w / 2, -0.125, d.z + d.d / 2);
    block.receiveShadow = true;
    scene.add(block);
  }

  // Soft contact shadows where buildings meet the ground.
  const positions = [...layout.positions.values()];
  if (positions.length) {
    const contact = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(FOOTPRINT * 1.9, FOOTPRINT * 1.9),
      new THREE.MeshBasicMaterial({ color: "#000000", alphaMap: contactShadowTexture(), transparent: true, opacity: night ? 0.5 : 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
      positions.length,
    );
    positions.forEach((p, i) => {
      m.makeRotationX(-Math.PI / 2);
      m.setPosition(p.x, 0.004, p.z);
      contact.setMatrixAt(i, m);
    });
    scene.add(contact);
  }

  // Lane markings: dashed centre lines along every street. They stop short of the
  // corners to leave room for crosswalks and junctions.
  const dashes: THREE.Matrix4[] = [];
  const addDashes = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.floor(len / 2);
    const margin = ROAD / 2 + 1.7;
    for (let i = 0; i < n; i++) {
      const along = i * 2 + 0.5;
      if (along < margin || along > len - margin) continue;
      const t = along / len;
      const dm = new THREE.Matrix4();
      dm.makeRotationY(Math.abs(x1 - x0) > Math.abs(z1 - z0) ? Math.PI / 2 : 0);
      dm.setPosition(x0 + (x1 - x0) * t, -0.245, z0 + (z1 - z0) * t);
      dashes.push(dm);
    }
  };
  // Zebra crossings next to every block corner.
  const stripes: THREE.Matrix4[] = [];
  const addCrossing = (x: number, z: number, alongX: boolean) => {
    // The road runs along x (alongX) or z; stripes run with the traffic, spaced across the road.
    for (let k = 0; k < 9; k++) {
      const off = 0.45 + k * 0.5;
      const sm = new THREE.Matrix4();
      sm.makeRotationY(alongX ? Math.PI / 2 : 0);
      if (alongX) sm.setPosition(x, -0.244, z - off);
      else sm.setPosition(x - off, -0.244, z);
      stripes.push(sm);
    }
  };
  for (const d of layout.districts) {
    const o = ROAD / 2;
    addDashes(d.x - o, d.z - o, d.x + d.w + o, d.z - o);
    addDashes(d.x - o, d.z + d.d + o, d.x + d.w + o, d.z + d.d + o);
    addDashes(d.x - o, d.z - o, d.x - o, d.z + d.d + o);
    addDashes(d.x + d.w + o, d.z - o, d.x + d.w + o, d.z + d.d + o);
    // North road (above the block): crossings near its two ends.
    addCrossing(d.x + 1.0, d.z, true);
    addCrossing(d.x + d.w - 1.0, d.z, true);
    // West road (left of the block).
    addCrossing(d.x, d.z + 1.0, false);
    addCrossing(d.x, d.z + d.d - 1.0, false);
  }
  const paintMat = new THREE.MeshStandardMaterial({ color: "#f1f0e8", roughness: 0.6, emissive: night ? "#3a3a30" : "#000000" });
  const dashMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.01, 0.9), paintMat, dashes.length);
  dashes.forEach((dm, i) => dashMesh.setMatrixAt(i, dm));
  dashMesh.receiveShadow = true;
  const stripeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.01, 1.1), paintMat, stripes.length);
  stripes.forEach((sm, i) => stripeMesh.setMatrixAt(i, sm));
  stripeMesh.receiveShadow = true;
  scene.add(dashMesh, stripeMesh);

  // Puddles on wet roads: dark mirror-like patches.
  if (rain) {
    const blocks = layout.districts;
    const spots: { x: number; z: number; s: number; r: number }[] = [];
    const want = Math.min(160, Math.round((cityW * cityD) / 30));
    for (let i = 0; i < want * 3 && spots.length < want; i++) {
      const x = minX + rand() * cityW;
      const z = minZ + rand() * cityD;
      if (blocks.some((d) => x > d.x - 0.9 && x < d.x + d.w + 0.9 && z > d.z - 0.9 && z < d.z + d.d + 0.9)) continue;
      spots.push({ x, z, s: 0.35 + rand() * 0.7, r: rand() * Math.PI });
    }
    const puddles = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 20),
      new THREE.MeshStandardMaterial({ color: "#2b3036", roughness: 0.04, metalness: 0.7, envMapIntensity: 1.8, polygonOffset: true, polygonOffsetFactor: -2 }),
      spots.length,
    );
    spots.forEach((p, i) => {
      q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, p.r));
      m.compose(v.set(p.x, -0.255, p.z), q, sc.set(p.s * 1.6, p.s, 1));
      puddles.setMatrixAt(i, m);
    });
    puddles.receiveShadow = true;
    scene.add(puddles);
  }

  // A lake in the park, beside the city's narrower side so it stays on the grass.
  const lakeR = Math.max(5, radius * 0.2);
  const dir = cityW <= cityD ? new THREE.Vector2(1, 0) : new THREE.Vector2(0, -1);
  let lakeDist = Math.min(cityW, cityD) / 2 + lakeR;
  const clearOfCity = (x: number, z: number, pad: number) => {
    const dx = Math.max(minX - x, 0, x - maxX);
    const dz = Math.max(minZ - z, 0, z - maxZ);
    return Math.hypot(dx, dz) > pad;
  };
  while (!clearOfCity(cx + dir.x * lakeDist, cz + dir.y * lakeDist, lakeR * 1.4 + 1.5)) lakeDist += 1;
  const lake = { x: cx + dir.x * lakeDist, z: cz + dir.y * lakeDist, r: lakeR };
  const lakeShape = (scale: number) => {
    const shape = new THREE.Shape();
    const lr = seeded("lake");
    const bumps = Array.from({ length: 5 }, () => ({ f: 1 + Math.floor(lr() * 4), a: 0.05 + lr() * 0.1, p: lr() * 6 }));
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      let r = 1;
      for (const b of bumps) r += Math.sin(a * b.f + b.p) * b.a;
      const px = Math.cos(a) * r * lakeR * scale * 1.3;
      const py = Math.sin(a) * r * lakeR * scale;
      if (i === 0) shape.moveTo(px, py);
      else shape.lineTo(px, py);
    }
    return new THREE.ShapeGeometry(shape);
  };
  const shore = new THREE.Mesh(lakeShape(1.12), new THREE.MeshStandardMaterial({ color: night ? "#6e6a5c" : "#cdbf97", roughness: 1 }));
  shore.rotation.x = -Math.PI / 2;
  shore.position.set(lake.x, -0.3, lake.z);
  shore.receiveShadow = true;
  const ripples = rippleTexture().clone();
  ripples.repeat.set(lakeR / 3, lakeR / 3);
  ripples.needsUpdate = true;
  const water = new THREE.Mesh(
    lakeShape(1),
    new THREE.MeshStandardMaterial({
      color: night ? "#22344a" : time === "dusk" ? "#8a7a92" : "#4f86a8",
      roughness: 0.1,
      metalness: 0.55,
      envMapIntensity: 1.6,
      normalMap: ripples,
      normalScale: new THREE.Vector2(rain ? 0.9 : 0.45, rain ? 0.9 : 0.45),
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(lake.x, -0.28, lake.z);
  water.receiveShadow = true;
  scene.add(shore, water);
  const inLake = (x: number, z: number) => Math.hypot((x - lake.x) / 1.3, z - lake.z) < lakeR * 1.3;

  // Trees along the edge of every block, and scattered in the park around the city.
  const clearOfBuildings = (x: number, z: number) =>
    positions.every((p) => Math.abs(p.x - x) > FOOTPRINT / 2 + 0.55 || Math.abs(p.z - z) > FOOTPRINT / 2 + 0.55);
  const treeSpots: { x: number; z: number; s: number }[] = [];
  const lampSpots: { x: number; z: number }[] = [];
  for (const d of layout.districts) {
    const inset = 0.6;
    const edge = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.floor(len / 2.4));
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n;
        const z = z0 + ((z1 - z0) * i) / n;
        if (i % 3 === 1) lampSpots.push({ x, z });
        else if (clearOfBuildings(x, z)) treeSpots.push({ x, z, s: 0.75 + rand() * 0.45 });
      }
    };
    edge(d.x + inset, d.z + inset, d.x + d.w - inset, d.z + inset);
    edge(d.x + inset, d.z + d.d - inset, d.x + d.w - inset, d.z + d.d - inset);
    edge(d.x + inset, d.z + inset, d.x + inset, d.z + d.d - inset);
    edge(d.x + d.w - inset, d.z + inset, d.x + d.w - inset, d.z + d.d - inset);
  }
  const parkCount = Math.round(Math.min(460, radius * 3.4));
  for (let i = 0; i < parkCount; i++) {
    const a = rand() * Math.PI * 2;
    const r = radius * (0.78 + Math.pow(rand(), 1.6) * 0.6);
    const x = cx + Math.cos(a) * r * (cityW / (2 * radius) + 0.25);
    const z = cz + Math.sin(a) * r * (cityD / (2 * radius) + 0.25);
    if (x > minX - 1 && x < maxX + 1 && z > minZ - 1 && z < maxZ + 1) continue; // not on the roads
    if (inLake(x, z)) continue;
    treeSpots.push({ x, z, s: 0.8 + rand() * 0.8 });
  }

  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 0.7, 6), new THREE.MeshStandardMaterial({ color: "#6b4a32", roughness: 1 }), treeSpots.length);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), treeSpots.length);
  const greens = time === "dusk" ? ["#5a7a38", "#6a8a40", "#4a6a32", "#7a9444", "#627a3a"] : ["#4f7d3a", "#5f8f45", "#3f6d34", "#6f9a4c", "#557f3f"];
  treeSpots.forEach((t, i) => {
    m.compose(v.set(t.x, 0.35 * t.s, t.z), q.identity(), sc.set(t.s, t.s, t.s));
    trunk.setMatrixAt(i, m);
    m.compose(v.set(t.x, (0.7 + 0.45) * t.s, t.z), q.setFromEuler(new THREE.Euler(0, rand() * 3, 0)), sc.set(t.s, t.s * (0.9 + rand() * 0.4), t.s));
    crown.setMatrixAt(i, m);
    crown.setColorAt(i, new THREE.Color(greens[Math.floor(rand() * greens.length)]).multiplyScalar(night ? 0.8 : 1));
  });
  trunk.castShadow = crown.castShadow = true;
  crown.receiveShadow = true;
  scene.add(trunk, crown);

  // Street lamps: glow from dusk onwards.
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.04, 1.3, 6), new THREE.MeshStandardMaterial({ color: "#3c3f45", roughness: 0.6, metalness: 0.4 }), lampSpots.length);
  const head = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.11, 10, 8),
    new THREE.MeshStandardMaterial({ color: lit ? "#ffe3a8" : "#eeeeee", emissive: "#ffcf7a", emissiveIntensity: night ? 2.2 : lit ? 1.4 : 0 }),
    lampSpots.length,
  );
  lampSpots.forEach((l, i) => {
    m.makeTranslation(l.x, 0.65, l.z);
    pole.setMatrixAt(i, m);
    m.makeTranslation(l.x, 1.33, l.z);
    head.setMatrixAt(i, m);
  });
  pole.castShadow = true;
  scene.add(pole, head);

  // Pools of lamp light on the pavement (cheap: flat glowing discs).
  if (lit && lampSpots.length) {
    const pool = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.9, 20),
      new THREE.MeshBasicMaterial({ color: "#ffcf7a", alphaMap: glowTexture(), transparent: true, opacity: night ? 0.35 : 0.2, depthWrite: false, blending: THREE.AdditiveBlending }),
      lampSpots.length,
    );
    lampSpots.forEach((l, i) => {
      m.makeRotationX(-Math.PI / 2);
      m.setPosition(l.x, 0.01, l.z);
      pool.setMatrixAt(i, m);
    });
    scene.add(pool);
  }

  // Traffic lights on every block corner. They cycle green, amber, red.
  const corners: { x: number; z: number; phase: number }[] = [];
  for (const d of layout.districts) {
    const i = 0.22;
    corners.push(
      { x: d.x + i, z: d.z + i, phase: 0 },
      { x: d.x + d.w - i, z: d.z + i, phase: 0.5 },
      { x: d.x + d.w - i, z: d.z + d.d - i, phase: 0 },
      { x: d.x + i, z: d.z + d.d - i, phase: 0.5 },
    );
  }
  const tPole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.03, 1.0, 6), new THREE.MeshStandardMaterial({ color: "#2e3136", roughness: 0.6, metalness: 0.4 }), corners.length);
  const tBox = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.24, 0.09), new THREE.MeshStandardMaterial({ color: "#1d1f22", roughness: 0.5 }), corners.length);
  const tLamp = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffffff" }), corners.length);
  corners.forEach((c, i) => {
    m.makeTranslation(c.x, 0.5, c.z);
    tPole.setMatrixAt(i, m);
    m.makeTranslation(c.x, 1.1, c.z);
    tBox.setMatrixAt(i, m);
    m.makeTranslation(c.x, 1.1, c.z);
    tLamp.setMatrixAt(i, m);
  });
  tPole.castShadow = tBox.castShadow = true;
  scene.add(tPole, tBox, tLamp);
  const SIGNAL = { green: new THREE.Color("#3dff7a"), amber: new THREE.Color("#ffb31a"), red: new THREE.Color("#ff3a2e") };
  const signalBoost = lit ? 1.6 : 1;
  const signal = new THREE.Color();
  const setSignals = (elapsed: number) => {
    const cycle = 12;
    corners.forEach((c, i) => {
      const t = ((elapsed / cycle + c.phase) % 1 + 1) % 1;
      const col = t < 0.42 ? SIGNAL.green : t < 0.5 ? SIGNAL.amber : SIGNAL.red;
      tLamp.setColorAt(i, signal.copy(col).multiplyScalar(signalBoost));
    });
    if (tLamp.instanceColor) tLamp.instanceColor.needsUpdate = true;
  };
  setSignals(0);

  // Car shapes, shared by moving and parked cars.
  const bodyGeo = new THREE.BoxGeometry(0.55, 0.26, 1.05);
  const cabinGeo = new THREE.BoxGeometry(0.46, 0.2, 0.55);
  const bodyMat = new THREE.MeshStandardMaterial({ roughness: rain ? 0.2 : 0.35, metalness: 0.5, envMapIntensity: 1.2 });
  const cabinMat = new THREE.MeshStandardMaterial({ color: "#20252c", roughness: 0.15, metalness: 0.6, envMapIntensity: 1.4 });
  const paint = ["#c0392b", "#f4f4f4", "#2c3e50", "#7f8c8d", "#2e86de", "#16a085", "#1f1f1f", "#d4ac0d", "#e8e8e8", "#5d6d7e"];

  // Parked cars along the kerbs, facing along the street.
  const parked: { x: number; z: number; angle: number }[] = [];
  for (const d of layout.districts) {
    const off = 0.45;
    const side = (x0: number, z0: number, x1: number, z1: number, angle: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      for (let s = 2.2; s < len - 2.2; s += 1.35) {
        if (rand() > 0.38) continue;
        const t = s / len;
        parked.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, angle });
      }
    };
    side(d.x, d.z - off, d.x + d.w, d.z - off, Math.PI / 2);
    side(d.x, d.z + d.d + off, d.x + d.w, d.z + d.d + off, -Math.PI / 2);
    side(d.x - off, d.z, d.x - off, d.z + d.d, Math.PI);
    side(d.x + d.w + off, d.z, d.x + d.w + off, d.z + d.d, 0);
  }
  if (parked.length) {
    const pBody = new THREE.InstancedMesh(bodyGeo, bodyMat, parked.length);
    const pCabin = new THREE.InstancedMesh(cabinGeo, cabinMat, parked.length);
    parked.forEach((p, i) => {
      m.makeRotationY(p.angle).setPosition(p.x, -0.1, p.z);
      pBody.setMatrixAt(i, m);
      m.makeRotationY(p.angle).setPosition(p.x, 0.11, p.z);
      pCabin.setMatrixAt(i, m);
      pBody.setColorAt(i, new THREE.Color(paint[Math.floor(rand() * paint.length)]));
    });
    pBody.castShadow = pCabin.castShadow = true;
    scene.add(pBody, pCabin);
  }

  // Moving cars: loop around the blocks in the lane nearest the kerb.
  const loops: Rect[] = layout.districts.map((d) => ({ x: d.x - 1.3, z: d.z - 1.3, w: d.w + 2.6, d: d.d + 2.6 }));
  const cars: { loop: Rect; s: number; speed: number }[] = [];
  for (const loop of loops) {
    const n = Math.max(1, Math.round((loop.w + loop.d) / 14));
    for (let i = 0; i < n; i++) cars.push({ loop, s: rand() * 2 * (loop.w + loop.d), speed: (rain ? 1.6 : 2.2) + rand() * 1.6 });
  }
  const body = new THREE.InstancedMesh(bodyGeo, bodyMat, cars.length);
  const cabin = new THREE.InstancedMesh(cabinGeo, cabinMat, cars.length);
  const headlightsOn = lit || rain;
  const front = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.5, 0.06, 0.04),
    new THREE.MeshStandardMaterial({ color: "#fff6d8", emissive: "#fff2c0", emissiveIntensity: headlightsOn ? 3 : 0.2 }),
    cars.length,
  );
  const rear = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.5, 0.06, 0.04),
    new THREE.MeshStandardMaterial({ color: "#7a1010", emissive: "#ff2a1a", emissiveIntensity: headlightsOn ? 2.4 : 0.3 }),
    cars.length,
  );
  cars.forEach((_, i) => body.setColorAt(i, new THREE.Color(paint[Math.floor(rand() * paint.length)])));
  body.castShadow = cabin.castShadow = true;
  scene.add(body, cabin, front, rear);
  // Headlight beams on the road.
  const beams = headlightsOn
    ? new THREE.InstancedMesh(
        new THREE.PlaneGeometry(0.7, 1.6),
        new THREE.MeshBasicMaterial({ color: "#fff1c8", alphaMap: glowTexture(), transparent: true, opacity: night ? 0.45 : 0.25, depthWrite: false, blending: THREE.AdditiveBlending }),
        cars.length,
      )
    : null;
  if (beams) scene.add(beams);

  const placeCars = () => {
    const rot = new THREE.Matrix4();
    const flat = new THREE.Matrix4();
    cars.forEach((c, i) => {
      const p = lanePoint(c.loop, c.s);
      const fx = Math.sin(p.angle);
      const fz = Math.cos(p.angle);
      rot.makeRotationY(p.angle);
      m.copy(rot).setPosition(p.x, -0.1, p.z);
      body.setMatrixAt(i, m);
      m.copy(rot).setPosition(p.x, 0.11, p.z);
      cabin.setMatrixAt(i, m);
      m.copy(rot).setPosition(p.x + fx * 0.53, -0.09, p.z + fz * 0.53);
      front.setMatrixAt(i, m);
      m.copy(rot).setPosition(p.x - fx * 0.53, -0.07, p.z - fz * 0.53);
      rear.setMatrixAt(i, m);
      if (beams) {
        flat.makeRotationX(-Math.PI / 2);
        m.copy(rot).multiply(flat).setPosition(p.x + fx * 1.3, -0.25, p.z + fz * 1.3);
        beams.setMatrixAt(i, m);
      }
    });
    body.instanceMatrix.needsUpdate = cabin.instanceMatrix.needsUpdate = true;
    front.instanceMatrix.needsUpdate = rear.instanceMatrix.needsUpdate = true;
    if (beams) beams.instanceMatrix.needsUpdate = true;
  };
  placeCars();

  // People walking on the sidewalks. Fewer at night; umbrellas in the rain.
  const walks: Rect[] = layout.districts.map((d) => ({ x: d.x + 0.32, z: d.z + 0.32, w: d.w - 0.64, d: d.d - 0.64 }));
  const crowd = night ? 0.35 : rain ? 0.6 : 1;
  const people: { loop: Rect; s: number; speed: number; phase: number }[] = [];
  for (const loop of walks) {
    const n = Math.round(((loop.w + loop.d) / 4.5) * crowd);
    for (let i = 0; i < n && people.length < 420; i++) {
      const dirn = rand() < 0.5 ? 1 : -1;
      people.push({ loop, s: rand() * 2 * (loop.w + loop.d), speed: dirn * (0.28 + rand() * 0.22), phase: rand() * 6 });
    }
  }
  const clothes = ["#2f3b52", "#6b2d2d", "#3d5a3d", "#c9b79c", "#1f1f24", "#8a6f4d", "#4b6c8f", "#9a9a9a", "#7a3f6b"];
  const skin = ["#f1c9a5", "#d9a47a", "#a8744f", "#6e4a33"];
  const pBody = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.055, 0.18, 3, 6), new THREE.MeshStandardMaterial({ roughness: 0.9 }), Math.max(1, people.length));
  const pHead = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.8 }), Math.max(1, people.length));
  const umbrellas = rain
    ? new THREE.InstancedMesh(new THREE.ConeGeometry(0.18, 0.08, 8), new THREE.MeshStandardMaterial({ roughness: 0.5 }), Math.max(1, people.length))
    : null;
  people.forEach((_, i) => {
    pBody.setColorAt(i, new THREE.Color(clothes[Math.floor(rand() * clothes.length)]));
    pHead.setColorAt(i, new THREE.Color(skin[Math.floor(rand() * skin.length)]));
    umbrellas?.setColorAt(i, new THREE.Color(rand() < 0.5 ? "#1c1c1f" : AWNINGS[Math.floor(rand() * AWNINGS.length)]));
  });
  pBody.count = pHead.count = people.length;
  if (umbrellas) umbrellas.count = people.length;
  pBody.castShadow = true;
  scene.add(pBody, pHead);
  if (umbrellas) scene.add(umbrellas);
  const placePeople = (elapsed: number) => {
    people.forEach((p, i) => {
      const pt = lanePoint(p.loop, p.s);
      const bob = Math.abs(Math.sin(elapsed * 7 + p.phase)) * 0.012;
      m.makeTranslation(pt.x, 0.145 + bob, pt.z);
      pBody.setMatrixAt(i, m);
      m.makeTranslation(pt.x, 0.36 + bob, pt.z);
      pHead.setMatrixAt(i, m);
      if (umbrellas) {
        m.makeTranslation(pt.x, 0.5 + bob, pt.z);
        umbrellas.setMatrixAt(i, m);
      }
    });
    pBody.instanceMatrix.needsUpdate = pHead.instanceMatrix.needsUpdate = true;
    if (umbrellas) umbrellas.instanceMatrix.needsUpdate = true;
  };
  placePeople(0);

  // Cloud shadows drifting across the city on clear days. The clouds themselves are
  // invisible (they would block the view); only their shadows show.
  const clouds: { x: number; z: number; parts: { dx: number; dz: number; sx: number; sz: number }[] }[] = [];
  let cloudMesh: THREE.InstancedMesh | null = null;
  const cloudY = maxH + 12;
  const cloudMinX = minX - 40;
  const cloudSpanX = cityW + 80;
  if (!rain && time !== "night") {
    const n = Math.max(3, Math.min(9, Math.round(radius / 10)));
    for (let i = 0; i < n; i++) {
      const parts = Array.from({ length: 3 + Math.floor(rand() * 3) }, () => ({ dx: (rand() - 0.5) * 10, dz: (rand() - 0.5) * 6, sx: 3 + rand() * 4, sz: 2.5 + rand() * 3 }));
      clouds.push({ x: cloudMinX + rand() * cloudSpanX, z: minZ - 10 + rand() * (cityD + 20), parts });
    }
    const total = clouds.reduce((s, c) => s + c.parts.length, 0);
    cloudMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), total);
    cloudMesh.castShadow = true;
    cloudMesh.frustumCulled = false;
    scene.add(cloudMesh);
  }
  const placeClouds = () => {
    if (!cloudMesh) return;
    let k = 0;
    for (const c of clouds) {
      for (const p of c.parts) {
        m.compose(v.set(c.x + p.dx, cloudY, c.z + p.dz), q.identity(), sc.set(p.sx, 0.8, p.sz));
        cloudMesh.setMatrixAt(k++, m);
      }
    }
    cloudMesh.instanceMatrix.needsUpdate = true;
  };
  placeClouds();

  // Rain: short falling streaks in a box over the city.
  let rainLines: THREE.LineSegments | null = null;
  let rainPos: Float32Array | null = null;
  const rainTop = maxH + 25;
  const rainBox = { x: minX - 12, z: minZ - 12, w: cityW + 24, d: cityD + 24 };
  const drop = { dx: 0.12, dy: -0.8 };
  if (rain) {
    const count = Math.round(THREE.MathUtils.clamp(rainBox.w * rainBox.d * 0.9, 1500, 8000));
    rainPos = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const x = rainBox.x + rand() * rainBox.w;
      const y = rand() * rainTop;
      const z = rainBox.z + rand() * rainBox.d;
      rainPos.set([x, y, z, x + drop.dx, y + drop.dy, z], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    rainLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: night ? "#8090a8" : "#c4ccd6", transparent: true, opacity: night ? 0.35 : 0.45, depthWrite: false }));
    rainLines.frustumCulled = false;
    scene.add(rainLines);
  }

  const beacons: THREE.Mesh[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Mesh).userData?.blink) beacons.push(o as THREE.Mesh);
  });

  return {
    radius,
    update: (dt, elapsed) => {
      const step = Math.min(dt, 0.05);
      for (const c of cars) c.s += c.speed * step;
      placeCars();
      for (const p of people) p.s += p.speed * step;
      placePeople(elapsed);
      setSignals(elapsed);
      ripples.offset.set(elapsed * 0.02, elapsed * (rain ? 0.05 : 0.012));
      if (cloudMesh) {
        for (const c of clouds) {
          c.x += 1.1 * step;
          if (c.x > cloudMinX + cloudSpanX) c.x -= cloudSpanX;
        }
        placeClouds();
      }
      if (rainLines && rainPos) {
        const fall = 32 * step;
        for (let i = 0; i < rainPos.length; i += 6) {
          let y = rainPos[i + 1] - fall;
          let x = rainPos[i] + fall * 0.15;
          if (y < -0.3) {
            y += rainTop;
            x = rainBox.x + ((x - rainBox.x) % rainBox.w);
          }
          rainPos[i] = x;
          rainPos[i + 1] = y;
          rainPos[i + 3] = x + drop.dx;
          rainPos[i + 4] = y + drop.dy;
        }
        rainLines.geometry.attributes.position.needsUpdate = true;
      }
      for (const b of beacons) (b.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(elapsed * 4) > 0.4 ? (lit ? 3 : 1.2) : 0.1;
    },
  };
}

/**
 * Sun, sky light, reflections, haze and shadows for the chosen time and weather.
 * Returns a function that frees the reflection map.
 */
export function addLighting(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  radius: number,
  time: TimeOfDay,
  weather: Weather = "clear",
  cameraDistance = 400,
) {
  const night = time === "night";
  const dusk = time === "dusk";
  const rain = weather === "rain";
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = night ? 1.05 : dusk ? 1.12 : rain ? 1.0 : 1.05;
  scene.background = skyTexture(time, weather);

  // Reflections: glass, water, cars and wet roads mirror this sky.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSphere = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ map: environmentTexture(time, weather), side: THREE.BackSide }));
  envScene.add(envSphere);
  const envTarget = pmrem.fromScene(envScene, 0.03);
  envSphere.geometry.dispose();
  (envSphere.material as THREE.Material).dispose();
  pmrem.dispose();
  scene.environment = envTarget.texture;
  scene.environmentIntensity = night ? 0.5 : dusk ? 0.7 : rain ? 0.75 : 0.6;

  // Haze: far parts of the city fade into the horizon colour. Thicker in the rain.
  const haze = skyBottom(time, weather);
  scene.fog = rain
    ? new THREE.Fog(haze, cameraDistance - radius * 0.6, cameraDistance + radius * 1.6)
    : new THREE.Fog(haze, cameraDistance + radius * 0.1, cameraDistance + radius * 2.6);

  const hemi = {
    day: { sky: "#dfeeff", ground: "#6b7a55", i: 0.85 },
    dusk: { sky: "#f4c2a4", ground: "#4a4058", i: 0.95 },
    night: { sky: "#6a7cb0", ground: "#1a1f2c", i: 0.9 },
  }[time];
  scene.add(new THREE.HemisphereLight(hemi.sky, hemi.ground, rain ? hemi.i * 1.25 : hemi.i));

  const sunColor = night ? "#9fb4ff" : dusk ? "#ffb070" : "#fff1dc";
  const sunPower = (night ? 1.2 : dusk ? 2.6 : 2.2) * (rain ? 0.35 : 1);
  const sun = new THREE.DirectionalLight(sunColor, sunPower);
  // A low sun at dusk casts long shadows. It sits in front of the city (the camera
  // looks from +x +z), so the faces you see catch the warm light.
  if (dusk) sun.position.set(-radius * 0.5, radius * 0.55 + 14, radius * 1.7);
  else sun.position.set(-radius * 0.8, radius * 1.6 + 30, radius * 0.9);
  sun.castShadow = true;
  const s = (dusk ? radius * 1.35 : radius) + 12;
  const far = sun.position.length() + radius * 2 + 120;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far });
  sun.shadow.mapSize.set(dusk ? 4096 : 2048, dusk ? 4096 : 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  sun.shadow.intensity = rain ? 0.45 : 1;
  scene.add(sun, sun.target);

  return () => {
    envTarget.dispose();
    scene.environment = null;
  };
}
