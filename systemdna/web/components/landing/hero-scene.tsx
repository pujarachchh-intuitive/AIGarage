"use client";

// The landing page hero: the sample repo as a night-time 3D city.
//
// It plays the whole product story on a loop, using the real impact report:
//   1. change  - the file that holds the renamed field lights up blue
//   2. impact  - pulses travel to every affected file, wave by wave; they turn amber
//   3. fix     - agents fly from the orchestrator to each file; they turn green
//   4. pr      - the city settles green and a draft pull request is "opened"
//
// It pauses when it is off screen or the tab is hidden, and shows a still frame
// when the visitor prefers reduced motion.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { FOOTPRINT } from "@/lib/city";
import type { LandingData } from "@/lib/landing-data";

export type HeroPhase = "idle" | "change" | "impact" | "fix" | "pr";

interface Props {
  city: LandingData["city"];
  change: Pick<LandingData["change"], "source" | "fixUnits">;
  onPhase?: (phase: HeroPhase) => void;
  className?: string;
}

const BG = "#09090b";
const COLOR = {
  idle: new THREE.Color("#cbd5e1"),
  change: new THREE.Color("#60a5fa"),
  impact: new THREE.Color("#f59e0b"),
  fix: new THREE.Color("#22c55e"),
};
const EDGE_IDLE = new THREE.Color("#71717a");

type BuildingState = "idle" | "change" | "impact" | "fix";

/** Small deterministic random numbers, so the windows look the same every visit. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function windowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 64, 64);
  const rand = seeded(7);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 4; x++) {
      if (rand() < 0.45) continue;
      ctx.fillStyle = `rgba(255,255,255,${0.35 + rand() * 0.65})`;
      ctx.fillRect(x * 16 + 4, y * 8 + 2, 8, 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

interface Pulse {
  unit: string;
  curve: THREE.QuadraticBezierCurve3;
  line: THREE.Line;
  head: THREE.Sprite;
  start: number;
  kind: "impact" | "fix";
}

interface Ring {
  mesh: THREE.Mesh;
  start: number;
  size: number;
  life: number;
}

export function HeroScene({ city, change, onPhase, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onPhaseRef = useRef(onPhase);

  useEffect(() => {
    onPhaseRef.current = onPhase;
  }, [onPhase]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const width = () => Math.max(1, host.clientWidth);
    const height = () => Math.max(1, host.clientHeight);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      return; // No WebGL: the section's gradient background stays.
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(width(), height());
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);

    const labels = new CSS2DRenderer();
    labels.setSize(width(), height());
    Object.assign(labels.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
    host.appendChild(labels.domElement);

    const span = Math.max(city.size.w, city.size.d);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    scene.fog = new THREE.FogExp2(BG, 0.65 / (span * 2.2));

    const camera = new THREE.PerspectiveCamera(34, width() / height(), 0.1, span * 20);

    // Light: cool sky, dark ground, one moon-like key light.
    scene.add(new THREE.HemisphereLight("#9fb2d8", "#08080b", 1.5));
    const key = new THREE.DirectionalLight("#e6ecff", 1.7);
    key.position.set(-span, span * 1.6, span * 0.8);
    scene.add(key);
    // A cool rim light from behind picks out the building edges.
    const rim = new THREE.DirectionalLight("#7dd3fc", 0.9);
    rim.position.set(span, span * 0.6, -span * 1.4);
    scene.add(rim);

    // Ground, faint grid and district plates.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(span * 12, span * 12), new THREE.MeshStandardMaterial({ color: "#0b0b0e", roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.3;
    scene.add(ground);
    const grid = new THREE.GridHelper(span * 6, Math.round((span * 6) / 3.2), "#27272a", "#18181b");
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.55;
    grid.position.y = -0.28;
    scene.add(grid);
    const plateMat = new THREE.MeshStandardMaterial({ color: "#131317", roughness: 0.9 });
    const plateEdge = new THREE.LineBasicMaterial({ color: "#3f3f46", transparent: true, opacity: 0.6 });
    for (const d of city.districts) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(d.w, 0.3, d.d), plateMat);
      plate.position.set(d.x + d.w / 2, -0.15, d.z + d.d / 2);
      scene.add(plate);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(plate.geometry), plateEdge);
      edge.position.copy(plate.position);
      scene.add(edge);
    }

    // Buildings: dark towers with faintly lit windows. Each has its own material so its
    // windows and edges can take the colour of its state.
    const windows = windowTexture();
    const glow = glowTexture();
    const buildings = new Map<
      string,
      { mat: THREE.MeshStandardMaterial; edge: THREE.LineBasicMaterial; cap: THREE.MeshBasicMaterial; top: THREE.Vector3; state: BuildingState; label?: HTMLDivElement }
    >();
    const maxH = Math.max(4, ...city.buildings.map((b) => b.h));
    const involved = new Set([change.source, ...change.fixUnits.map((u) => u.file)]);
    for (const b of city.buildings) {
      const geo = new THREE.BoxGeometry(FOOTPRINT * 0.92, b.h, FOOTPRINT * 0.92);
      geo.translate(0, b.h / 2, 0);
      const map = windows.clone();
      map.repeat.set(1, Math.max(1, b.h / 3));
      map.needsUpdate = true;
      const mat = new THREE.MeshStandardMaterial({
        color: "#383842",
        roughness: 0.5,
        metalness: 0.35,
        emissive: COLOR.idle.clone(),
        emissiveMap: map,
        emissiveIntensity: 0.4,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.x, 0, b.z);
      scene.add(mesh);
      const edge = new THREE.LineBasicMaterial({ color: EDGE_IDLE.clone(), transparent: true, opacity: 0.55 });
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edge);
      lines.position.copy(mesh.position);
      scene.add(lines);
      const cap = new THREE.MeshBasicMaterial({ color: COLOR.idle.clone(), transparent: true, opacity: 0, depthWrite: false });
      const capMesh = new THREE.Mesh(new THREE.PlaneGeometry(FOOTPRINT * 0.92, FOOTPRINT * 0.92), cap);
      capMesh.rotation.x = -Math.PI / 2;
      capMesh.position.set(b.x, b.h + 0.02, b.z);
      scene.add(capMesh);

      let label: HTMLDivElement | undefined;
      if (involved.has(b.path)) {
        label = document.createElement("div");
        label.className =
          "px-1.5 py-0.5 rounded-md border text-[10px] font-semibold whitespace-nowrap select-none transition-[opacity,color,border-color,background-color] duration-500 bg-zinc-950/80 border-zinc-700 text-zinc-200 backdrop-blur-sm";
        label.style.opacity = "0";
        label.textContent = b.path.split("/").pop() ?? b.path;
        const obj = new CSS2DObject(label);
        obj.center.set(0.5, 1.4);
        obj.position.set(b.x, b.h, b.z);
        scene.add(obj);
      }
      buildings.set(b.path, { mat, edge, cap, top: new THREE.Vector3(b.x, b.h, b.z), state: "idle", label });
    }

    // Import arcs, with small lights flowing along some of them.
    const arcMat = new THREE.LineBasicMaterial({ color: "#3f3f46", transparent: true, opacity: 0.45 });
    const flowCurves: THREE.QuadraticBezierCurve3[] = [];
    for (const l of city.links) {
      const a = buildings.get(l.from)?.top;
      const b = buildings.get(l.to)?.top;
      if (!a || !b) continue;
      const mid = a.clone().lerp(b, 0.5);
      mid.y = Math.max(a.y, b.y) + 1.5 + a.distanceTo(b) * 0.3;
      const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)), arcMat));
      flowCurves.push(curve);
    }
    const flowCount = Math.min(70, flowCurves.length * 2);
    const flowPos = new Float32Array(flowCount * 3);
    const flows = Array.from({ length: flowCount }, (_, i) => ({ curve: flowCurves[i % Math.max(1, flowCurves.length)], t: (i * 0.137) % 1, speed: 0.12 + ((i * 7919) % 100) / 600 }));
    const flowGeo = new THREE.BufferGeometry();
    flowGeo.setAttribute("position", new THREE.BufferAttribute(flowPos, 3));
    const flowPoints = new THREE.Points(
      flowGeo,
      new THREE.PointsMaterial({ color: "#a1a1aa", size: 0.55, map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }),
    );
    if (flowCurves.length) scene.add(flowPoints);

    // The orchestrator: a small glowing crystal over the city during the fix phase.
    const hubPos = new THREE.Vector3(0, maxH + 7, 0);
    const hubMat = new THREE.MeshStandardMaterial({ color: "#052e16", emissive: COLOR.fix, emissiveIntensity: 2, transparent: true, opacity: 0 });
    const hub = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), hubMat);
    hub.position.copy(hubPos);
    scene.add(hub);

    // --- The story timeline -------------------------------------------------
    const units = [...change.fixUnits].sort((a, b) => a.wave - b.wave);
    const waves = Math.max(1, ...units.map((u) => u.wave));
    const byWave = (w: number) => units.filter((u) => u.wave === w);
    const T = {
      change: 1.2,
      impact: 3.0,
      waveGap: 1.7,
      travel: 1.0,
    };
    const impactEnd = T.impact + (waves - 1) * T.waveGap + T.travel + 0.4;
    const fixStart = impactEnd + 0.9;
    const fixEnd = fixStart + (waves - 1) * 1.9 + 1.1 + 0.6 + 0.4;
    const prStart = fixEnd + 0.4;
    const loopLength = prStart + 4.2;

    const pulses: Pulse[] = [];
    const makePulse = (unit: string, from: THREE.Vector3, to: THREE.Vector3, start: number, kind: Pulse["kind"]) => {
      const mid = from.clone().lerp(to, 0.5);
      mid.y = Math.max(from.y, to.y) + 3 + from.distanceTo(to) * 0.35;
      const curve = new THREE.QuadraticBezierCurve3(from.clone(), mid, to.clone());
      const color = kind === "impact" ? COLOR.impact : COLOR.fix;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      line.geometry.setDrawRange(0, 0);
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      head.scale.setScalar(kind === "impact" ? 1.6 : 1.3);
      head.visible = false;
      scene.add(line, head);
      pulses.push({ unit, curve, line, head, start, kind });
    };
    const sourceTop = buildings.get(change.source)?.top ?? new THREE.Vector3();
    for (let w = 1; w <= waves; w++) {
      byWave(w).forEach((u, i) => {
        const to = buildings.get(u.file)?.top;
        if (!to || u.file === change.source) return;
        makePulse(u.file, sourceTop, to, T.impact + (w - 1) * T.waveGap + i * 0.18, "impact");
      });
    }
    const fixAt = new Map<string, number>();
    for (let w = 1; w <= waves; w++) {
      byWave(w).forEach((u, i) => {
        const to = buildings.get(u.file)?.top;
        if (!to) return;
        const start = fixStart + (w - 1) * 1.9 + i * 0.22;
        makePulse(u.file, hubPos, to.clone().add(new THREE.Vector3(0, 0.4, 0)), start, "fix");
        fixAt.set(u.file, start + 1.1 + 0.5); // travel, then a short time "working"
      });
    }

    const rings: Ring[] = [];
    const ringGeo = new THREE.RingGeometry(0.92, 1, 64);
    const addRing = (x: number, z: number, color: THREE.Color, start: number, size: number, life = 1.6) => {
      const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.02, z);
      mesh.visible = false;
      scene.add(mesh);
      rings.push({ mesh, start, size, life });
    };
    addRing(sourceTop.x, sourceTop.z, COLOR.change, T.change, 9);
    for (const p of pulses) {
      const to = buildings.get(p.unit)!.top;
      if (p.kind === "impact") addRing(to.x, to.z, COLOR.impact, p.start + T.travel, 5);
    }
    for (const [file, at] of fixAt) {
      const to = buildings.get(file)!.top;
      addRing(to.x, to.z, COLOR.fix, at, 4, 1.2);
    }
    addRing(0, 0, COLOR.fix, prStart, span * 0.9, 2.6);

    /** What each building should look like at time t in the loop. */
    const stateAt = (path: string, t: number): BuildingState => {
      if (t >= loopLength - 0.8) return "idle";
      if (fixAt.has(path) && t >= fixAt.get(path)!) return "fix";
      if (path === change.source) {
        if (t >= prStart) return "fix";
        return t >= T.change ? "change" : "idle";
      }
      const imp = pulses.find((p) => p.kind === "impact" && p.unit === path);
      if (imp && t >= imp.start + T.travel) return "impact";
      return "idle";
    };
    const phaseAt = (t: number): HeroPhase => {
      if (t >= loopLength - 0.8) return "idle";
      if (t >= prStart) return "pr";
      if (t >= fixStart) return "fix";
      if (t >= T.impact) return "impact";
      if (t >= T.change) return "change";
      return "idle";
    };

    // --- Camera: a slow orbit, nudged by the pointer ------------------------
    const target = new THREE.Vector3(0, maxH * 0.22, 0);
    const baseRadius = span * 2.05 + 14;
    let angle = Math.PI / 4;
    const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
    const onPointer = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    const placeCamera = () => {
      pointer.sx += (pointer.x - pointer.sx) * 0.04;
      pointer.sy += (pointer.y - pointer.sy) * 0.04;
      const a = angle + pointer.sx * 0.25;
      const elev = 0.5 + pointer.sy * 0.08;
      // Narrow screens need the camera further back to fit the city.
      const aspect = width() / height();
      const radius = baseRadius * (aspect > 1.2 ? 1 : Math.max(0.8, 0.95 / aspect));
      camera.position.set(target.x + radius * Math.cos(elev) * Math.sin(a), target.y + radius * Math.sin(elev), target.z + radius * Math.cos(elev) * Math.cos(a));
      camera.lookAt(target);
      // On wide screens, slide the city to the right so the headline has room.
      const shift = aspect > 1.2 ? Math.min(0.22, (aspect - 1.2) * 0.25 + 0.1) : 0;
      if (shift) camera.setViewOffset(width(), height(), -width() * shift, 0, width(), height());
      else camera.clearViewOffset();
    };

    // Post-processing: a soft bloom makes lit windows and pulses glow.
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(width(), height()), 0.85, 0.55, 0.18);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const resize = () => {
      camera.aspect = width() / height();
      camera.updateProjectionMatrix();
      renderer.setSize(width(), height());
      composer.setSize(width(), height());
      labels.setSize(width(), height());
      if (!running) draw(0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let lastPhase: HeroPhase | null = null;
    const lerpK = (dt: number, speed: number) => 1 - Math.exp(-dt * speed);

    const draw = (dt: number) => {
      const t = reduced ? T.impact + (waves - 1) * T.waveGap + T.travel + 0.2 : clock.elapsedTime % loopLength;
      const phase = phaseAt(t);
      if (phase !== lastPhase) {
        lastPhase = phase;
        onPhaseRef.current?.(phase);
      }
      const k = reduced ? 1 : lerpK(dt, 5);

      for (const [path, b] of buildings) {
        const s = stateAt(path, t);
        b.state = s;
        const col = COLOR[s];
        b.mat.emissive.lerp(col, k);
        b.mat.emissiveIntensity += ((s === "idle" ? 0.4 : 1.5) - b.mat.emissiveIntensity) * k;
        b.edge.color.lerp(s === "idle" ? EDGE_IDLE : col, k);
        b.edge.opacity += ((s === "idle" ? 0.55 : 1) - b.edge.opacity) * k;
        b.cap.color.lerp(col, k);
        b.cap.opacity += ((s === "idle" ? 0 : 0.85) - b.cap.opacity) * k;
        if (b.label) {
          b.label.style.opacity = s === "idle" ? "0" : "1";
          b.label.style.color = s === "idle" ? "" : `#${col.getHexString()}`;
          b.label.style.borderColor = s === "idle" ? "" : `#${col.getHexString()}66`;
        }
      }

      for (const p of pulses) {
        const local = (t - p.start) / T.travel;
        const shown = p.kind === "impact" ? t < fixStart + 0.3 : t < prStart + 0.6;
        if (local <= 0 || !shown || t >= loopLength - 0.8) {
          p.line.geometry.setDrawRange(0, 0);
          p.head.visible = false;
          continue;
        }
        const u = Math.min(1, local);
        const eased = 1 - Math.pow(1 - u, 3);
        p.line.geometry.setDrawRange(0, Math.max(2, Math.round(eased * 49)));
        (p.line.material as THREE.LineBasicMaterial).opacity = u < 1 ? 0.95 : p.kind === "impact" ? 0.35 : 0.25;
        p.head.visible = u < 1;
        if (u < 1) p.head.position.copy(p.curve.getPoint(eased));
      }

      for (const r of rings) {
        const local = (t - r.start) / r.life;
        const on = local > 0 && local < 1 && !reduced;
        r.mesh.visible = on;
        if (!on) continue;
        r.mesh.scale.setScalar(0.5 + local * r.size);
        (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - local) * 0.8;
      }

      const hubOn = t >= fixStart - 0.6 && t < prStart + 1.5;
      hubMat.opacity += ((hubOn ? 1 : 0) - hubMat.opacity) * k;
      hub.visible = hubMat.opacity > 0.02;
      hub.rotation.y += dt * 1.2;
      hub.position.y = hubPos.y + Math.sin(clock.elapsedTime * 2) * 0.25;

      flows.forEach((f, i) => {
        f.t = (f.t + dt * f.speed) % 1;
        const p = f.curve?.getPoint(f.t);
        if (p) flowPos.set([p.x, p.y, p.z], i * 3);
      });
      flowGeo.attributes.position.needsUpdate = true;

      if (!reduced) angle += dt * 0.045;
      placeCamera();
      composer.render(dt);
      labels.render(scene, camera);
    };

    // Run only while visible.
    const clock = new THREE.Clock(false);
    let running = false;
    let frame = 0;
    const loop = () => {
      draw(Math.min(clock.getDelta(), 0.05));
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running || reduced) return;
      running = true;
      clock.start();
      frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
      clock.stop();
    };
    let inView = true;
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      if (inView && !document.hidden) start();
      else stop();
    });
    io.observe(host);
    const onVisibility = () => (document.hidden || !inView ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    if (reduced) {
      clock.start();
      draw(0);
    } else start();

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      windows.dispose();
      glow.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
    };
  }, [city, change]);

  return <div ref={hostRef} className={className} aria-hidden="true" />;
}
