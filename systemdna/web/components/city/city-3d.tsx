"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { Minus, Plus, RotateCcw, RotateCw, Scan } from "lucide-react";
import { addLighting, buildBuilding, buildWorld, skyBottom, type TimeOfDay, type Weather, type World } from "@/components/city/city-realism";
import { canvasToPng, registerSnapshot } from "@/lib/city-export";
import { cn } from "@/lib/cn";
import { FOOTPRINT, layoutCity, type CityData } from "@/lib/city";
import { useIsDark } from "@/lib/theme";
import { readTokens, type Tokens } from "@/lib/tokens";

export type CityColorMode = "zinc" | "folder";

interface City3DProps {
  data: CityData;
  selected?: string | null;
  onSelect?: (path: string | null) => void;
  /** Dim every folder except this one. */
  focusDir?: string | null;
  colorMode?: CityColorMode;
  /** What building height shows. */
  heightMode?: "lines" | "imports";
  /** Which import arcs to draw. */
  arcs?: "all" | "selected" | "none";
  /** Which building labels to show when nothing is selected. */
  labels?: "landmarks" | "all" | "none";
  /** Slowly turn the city (handy for demos). */
  autoRotate?: boolean;
  /** Realistic: textured buildings, roads, trees, cars, shadows. Schematic: the clean zinc look. */
  realistic?: boolean;
  /** Light for the realistic look. */
  time?: TimeOfDay;
  /** Weather for the realistic look. */
  weather?: Weather;
  className?: string;
}

// Zinc shades per folder (default, follows the design system: no rainbow).
const ZINC_LIGHT = ["#3F3F46", "#71717A", "#52525B", "#A1A1AA", "#27272A", "#8A8A93", "#63636B"];
const ZINC_DARK = ["#E4E4E7", "#A1A1AA", "#D4D4D8", "#71717A", "#F4F4F5", "#B4B4BB", "#8A8A93"];
// Opt-in folder colours, muted.
const FOLDER = ["#5B8DEF", "#4FBFA5", "#D9648F", "#D9A441", "#9A7BE0", "#4BA3C7", "#C98A5A", "#7C9A5E"];

export function districtColor(index: number, mode: CityColorMode, dark: boolean) {
  const list = mode === "folder" ? FOLDER : dark ? ZINC_DARK : ZINC_LIGHT;
  return list[index % list.length];
}

const ELEVATION = Math.atan(1 / Math.SQRT2); // true isometric: about 35 degrees
const CAMERA_DISTANCE = 400;

interface Built {
  mesh: THREE.Mesh;
  /** Every material that fades when the building is dimmed. */
  mats: THREE.Material[];
  /** Schematic: the Lambert material that glows on hover and selection. */
  glow?: THREE.MeshLambertMaterial;
  /** Schematic: always-on edges. */
  edges?: THREE.LineSegments;
  /** Realistic: outline shown on hover and selection. */
  outline?: THREE.LineSegments;
  /** Realistic: everything that casts a shadow (off while dimmed). */
  casters: THREE.Object3D[];
  cap?: THREE.Mesh;
  label: CSS2DObject;
  dir: string;
}

function fade(m: THREE.Material, dim: boolean, dimOpacity: number) {
  // Switching transparency changes the shader, so three.js must recompile it.
  if (m.transparent !== dim) m.needsUpdate = true;
  m.transparent = dim;
  m.opacity = dim ? dimOpacity : 1;
  m.depthWrite = !dim;
}

export function City3D({
  data,
  selected,
  onSelect,
  focusDir,
  colorMode = "zinc",
  heightMode = "lines",
  arcs: arcMode = "all",
  labels: labelMode = "landmarks",
  autoRotate = false,
  realistic = true,
  time = "day",
  weather = "clear",
  className,
}: City3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const isDark = useIsDark();
  const layout = useMemo(() => layoutCity(data, heightMode), [data, heightMode]);
  const onSelectRef = useRef(onSelect);
  const api = useRef<{
    fit: () => void;
    rotate: (deg: number) => void;
    zoom: (f: number) => void;
    apply: () => void;
  } | null>(null);
  const viewRef = useRef({
    selected: selected ?? null,
    focusDir: focusDir ?? null,
    hovered: null as string | null,
    arcMode,
    labelMode,
    autoRotate,
  });

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Build the whole scene. Rebuilt when the data, theme or colour mode changes.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const t: Tokens = readTokens();
    const width = () => Math.max(1, host.clientWidth);
    const height = () => Math.max(1, host.clientHeight);

    // preserveDrawingBuffer lets "Download image" read the last frame.
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width(), height());
    host.appendChild(renderer.domElement);

    const labels = new CSS2DRenderer();
    labels.setSize(width(), height());
    labels.domElement.style.position = "absolute";
    labels.domElement.style.inset = "0";
    labels.domElement.style.pointerEvents = "none";
    host.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 2000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.screenSpacePanning = false;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    controls.minZoom = 0.35;
    controls.maxZoom = 8;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.3;

    const dirIndex = new Map(data.districts.map((d, i) => [d.dir, i]));
    let world: World | null = null;
    let disposeLighting: (() => void) | null = null;

    if (realistic) {
      // Streets, sidewalks, grass, trees, lamps, cars and people; then sun, sky, haze and shadows.
      world = buildWorld(scene, layout, data, time, weather);
      disposeLighting = addLighting(scene, renderer, world.radius, time, weather, CAMERA_DISTANCE);
    } else {
      // Light: soft sky light plus one sun, so each side of a building has its own shade.
      scene.add(new THREE.HemisphereLight(0xffffff, isDark ? 0x202024 : 0xd4d4d8, isDark ? 1.35 : 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, isDark ? 1.2 : 1.1);
      sun.position.set(-40, 90, 60);
      scene.add(sun);

      // Ground grid.
      const span = Math.max(layout.size.w, layout.size.d) * 3 + 60;
      const grid = new THREE.GridHelper(span, Math.round(span / 8), t.border, t.border);
      (grid.material as THREE.Material).transparent = true;
      (grid.material as THREE.Material).opacity = isDark ? 0.55 : 0.7;
      grid.position.y = -0.35;
      scene.add(grid);
    }

    // District plates (schematic only) and labels (both styles).
    for (const d of layout.districts) {
      if (!realistic) {
      const color = new THREE.Color(districtColor(dirIndex.get(d.dir) ?? 0, colorMode, isDark));
      const plateColor = new THREE.Color(t.surface).lerp(color, colorMode === "folder" ? 0.28 : 0.12);
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(d.w, 0.5, d.d),
        new THREE.MeshLambertMaterial({ color: plateColor }),
      );
      plate.position.set(d.x + d.w / 2, -0.25, d.z + d.d / 2);
      scene.add(plate);
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(plate.geometry),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 }),
      );
      outline.position.copy(plate.position);
      scene.add(outline);
      }

      const count = data.districts.find((x) => x.dir === d.dir)?.files.length ?? 0;
      const el = document.createElement("div");
      el.className = realistic
        ? "flex flex-col items-center leading-tight select-none px-2 py-0.5 rounded-md bg-surface/85 border border-border shadow-2xs backdrop-blur-sm"
        : "flex flex-col items-center leading-tight select-none";
      const name = document.createElement("span");
      name.className = "type-label";
      name.textContent = d.dir;
      const sub = document.createElement("span");
      sub.className = "type-caption";
      sub.textContent = `${count} ${count === 1 ? "file" : "files"}`;
      el.append(name, sub);
      const label = new CSS2DObject(el);
      label.position.set(d.x + d.w / 2, 0, d.z + d.d + (realistic ? 1.4 : 2.6));
      scene.add(label);
    }

    // Buildings: one per file.
    const built = new Map<string, Built>();
    const pickable: THREE.Mesh[] = [];
    const landmarks = new Map(data.files.map((f) => [f.path, f.landmark]));
    // Core modules get the inverse of the text colour so the cap stands out on zinc buildings.
    const capColor = { entry: t.info, core: realistic ? "#ffffff" : t.textInverse, hotspot: t.warning };
    const tallestH = Math.max(0, ...[...layout.positions.values()].map((p) => p.h));
    for (const f of data.files) {
      const pos = layout.positions.get(f.path);
      if (!pos) continue;
      const color = districtColor(dirIndex.get(f.dir) ?? 0, colorMode, isDark);
      let entry: Omit<Built, "label" | "dir" | "cap">;
      if (realistic) {
        const b = buildBuilding(f.path, pos, {
          language: f.language,
          tint: colorMode === "folder" ? color : undefined,
          time,
          tallest: pos.h === tallestH && pos.h > 8,
          landmark: Boolean(f.landmark),
        });
        scene.add(b.mesh, b.outline, ...b.parts, ...b.extras);
        pickable.push(...b.parts);
        entry = { mesh: b.mesh, mats: b.mats, outline: b.outline, casters: b.casters };
      } else {
        const geo = new THREE.BoxGeometry(FOOTPRINT, pos.h, FOOTPRINT);
        geo.translate(0, pos.h / 2, 0);
        const mat = new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(0x000000) });
        const box = new THREE.Mesh(geo, mat);
        box.position.set(pos.x, 0, pos.z);
        box.userData.path = f.path;
        scene.add(box);
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({ color: isDark ? "#000000" : "#FFFFFF", transparent: true, opacity: isDark ? 0.25 : 0.45 }),
        );
        edges.position.copy(box.position);
        scene.add(edges);
        entry = { mesh: box, mats: [mat], glow: mat, edges, casters: [] };
      }
      pickable.push(entry.mesh);

      let cap: THREE.Mesh | undefined;
      if (f.landmark) {
        cap = new THREE.Mesh(
          new THREE.BoxGeometry(FOOTPRINT + 0.06, 0.45, FOOTPRINT + 0.06),
          new THREE.MeshLambertMaterial({ color: capColor[f.landmark], emissive: new THREE.Color(capColor[f.landmark]), emissiveIntensity: 0.25 }),
        );
        cap.position.set(pos.x, pos.h + 0.22, pos.z);
        cap.castShadow = realistic;
        scene.add(cap);
      }

      const wrap = document.createElement("div");
      const tag = document.createElement("div");
      tag.className =
        "mb-1.5 px-1.5 py-0.5 rounded-md bg-surface/90 border border-border text-caption font-semibold text-text-primary shadow-2xs whitespace-nowrap select-none";
      tag.textContent = f.path.split("/").pop() ?? f.path;
      wrap.appendChild(tag);
      const label = new CSS2DObject(wrap);
      label.center.set(0.5, 1);
      label.position.set(pos.x, pos.h + (cap ? 0.6 : 0.2), pos.z);
      scene.add(label);

      built.set(f.path, { ...entry, cap, label, dir: f.dir });
    }

    // Import arcs.
    const arcs: { line: THREE.Line; mat: THREE.LineBasicMaterial; from: string; to: string }[] = [];
    for (const l of data.links) {
      const a = layout.positions.get(l.from);
      const b = layout.positions.get(l.to);
      if (!a || !b) continue;
      const start = new THREE.Vector3(a.x, a.h, a.z);
      const end = new THREE.Vector3(b.x, b.h, b.z);
      const dist = start.distanceTo(end);
      const mid = start.clone().lerp(end, 0.5);
      mid.y = Math.max(a.h, b.h) + 2 + dist * 0.35;
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const mat = new THREE.LineBasicMaterial({ color: t.textTertiary, transparent: true, opacity: 0.18 });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(28)), mat);
      scene.add(line);
      arcs.push({ line, mat, from: l.from, to: l.to });
    }

    // Camera: fit the city in view from a fixed isometric angle.
    const maxH = Math.max(4, ...[...layout.positions.values()].map((p) => p.h));
    let viewSize = 10;
    const setFrustum = () => {
      const aspect = width() / height();
      camera.left = (-viewSize * aspect) / 2;
      camera.right = (viewSize * aspect) / 2;
      camera.top = viewSize / 2;
      camera.bottom = -viewSize / 2;
      camera.updateProjectionMatrix();
    };
    const fit = () => {
      const aspect = width() / height();
      // Screen width of an isometric box is about 0.71 x (w + d); its height adds the tallest building.
      const across = (layout.size.w + layout.size.d) * 0.71 + 10;
      const tall = (layout.size.w + layout.size.d) * 0.41 + maxH * 0.82 + 10;
      viewSize = Math.max(across / aspect, tall);
      controls.target.set(0, maxH * 0.3, 0);
      const dist = CAMERA_DISTANCE;
      camera.position.set(
        dist * Math.cos(ELEVATION) * Math.sin(Math.PI / 4),
        dist * Math.sin(ELEVATION),
        dist * Math.cos(ELEVATION) * Math.cos(Math.PI / 4),
      ).add(controls.target);
      camera.zoom = 1;
      setFrustum();
      controls.update();
    };
    fit();

    // Smooth rotation around the vertical axis.
    let pendingTurn = 0;
    const rotate = (deg: number) => {
      pendingTurn += (deg * Math.PI) / 180;
    };
    const zoom = (factor: number) => {
      camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, controls.minZoom, controls.maxZoom);
      camera.updateProjectionMatrix();
    };

    // Selection, hover and folder focus.
    const apply = () => {
      const { selected: sel, focusDir: fd, hovered, arcMode: am, labelMode: lm } = viewRef.current;
      const file = sel ? data.files.find((f) => f.path === sel) : undefined;
      const related = new Set<string>(file ? [file.path, ...file.imports, ...file.importedBy] : []);
      for (const [path, b] of built) {
        const dim = Boolean((file && !related.has(path)) || (fd && b.dir !== fd));
        for (const m of b.mats) fade(m, dim, realistic ? 0.12 : 0.16);
        for (const c of b.casters) c.castShadow = !dim;
        if (b.edges) (b.edges.material as THREE.LineBasicMaterial).opacity = dim ? 0.04 : isDark ? 0.25 : 0.45;
        if (b.cap) fade(b.cap.material as THREE.Material, dim, 0.2);
        if (b.glow) {
          b.glow.emissive.set(path === sel ? (isDark ? "#3F3F46" : "#52525B") : path === hovered ? "#27272A" : "#000000");
          b.glow.emissiveIntensity = path === sel ? 0.9 : 0.5;
        }
        if (b.outline) {
          b.outline.visible = path === sel || path === hovered;
          (b.outline.material as THREE.LineBasicMaterial).color.set(path === sel ? "#ffffff" : "#d4d4d8");
        }
        const landmark = landmarks.get(path);
        const idle = !file && !fd;
        const show =
          path === sel ||
          path === hovered ||
          (idle && lm === "all") ||
          (idle && lm === "landmarks" && Boolean(landmark)) ||
          (file && related.has(path) && path !== sel && related.size <= 8);
        // CSS2DRenderer owns element.style.display, so toggle the object instead.
        b.label.visible = Boolean(show);
      }
      for (const a of arcs) {
        const touches = file && (a.from === file.path || a.to === file.path);
        const inDir = !fd || built.get(a.from)?.dir === fd || built.get(a.to)?.dir === fd;
        a.line.visible = am === "none" ? false : file ? Boolean(touches) : am === "selected" ? false : inDir;
        a.mat.color.set(touches ? t.textPrimary : t.textTertiary);
        a.mat.opacity = touches ? 0.95 : fd ? 0.35 : 0.18;
      }
    };
    apply();
    api.current = { fit, rotate, zoom, apply };

    // Picking.
    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pick = (ev: PointerEvent): string | null => {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObjects(pickable, false)[0];
      return (hit?.object.userData.path as string | undefined) ?? null;
    };
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) onSelectRef.current?.(pick(e));
      down = null;
    };
    let hoverQueued = false;
    const onMove = (e: PointerEvent) => {
      if (hoverQueued || e.buttons) return;
      hoverQueued = true;
      requestAnimationFrame(() => {
        hoverQueued = false;
        const p = pick(e);
        renderer.domElement.style.cursor = p ? "pointer" : "grab";
        if (p !== viewRef.current.hovered) {
          viewRef.current.hovered = p;
          apply();
        }
      });
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointermove", onMove);

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "[") rotate(-45);
      if (e.key === "]") rotate(45);
      if (e.key === "0") fit();
    };
    window.addEventListener("keydown", onKey);
    const unregister = registerSnapshot(() => {
      renderer.render(scene, camera);
      return canvasToPng(renderer.domElement, realistic ? skyBottom(time, weather) : t.background);
    });

    const ro = new ResizeObserver(() => {
      renderer.setSize(width(), height());
      labels.setSize(width(), height());
      setFrustum();
    });
    ro.observe(host);

    let frame = 0;
    const up = new THREE.Vector3(0, 1, 0);
    const clock = new THREE.Clock();
    const tick = () => {
      const dt = clock.getDelta();
      world?.update(dt, clock.elapsedTime);
      if (viewRef.current.autoRotate && !down) {
        const offset = camera.position.clone().sub(controls.target).applyAxisAngle(up, 0.0025);
        camera.position.copy(controls.target).add(offset);
      }
      if (Math.abs(pendingTurn) > 0.0005) {
        const step = pendingTurn * 0.14;
        pendingTurn -= step;
        const offset = camera.position.clone().sub(controls.target).applyAxisAngle(up, step);
        camera.position.copy(controls.target).add(offset);
      }
      controls.update();
      renderer.render(scene, camera);
      labels.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      unregister();
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("keydown", onKey);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointermove", onMove);
      controls.dispose();
      disposeLighting?.();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
      api.current = null;
    };
  }, [data, layout, isDark, colorMode, realistic, time, weather]);

  // Selection, focus and display modes do not rebuild the scene.
  useEffect(() => {
    Object.assign(viewRef.current, { selected: selected ?? null, focusDir: focusDir ?? null, arcMode, labelMode, autoRotate });
    api.current?.apply();
  }, [selected, focusDir, arcMode, labelMode, autoRotate]);

  const iconBtn =
    "cursor-pointer flex items-center justify-center size-9 bg-surface border border-border rounded-lg text-icon-secondary hover:text-text-primary hover:bg-surface-hover hover:border-border-strong shadow-2xs active:scale-95 transition-all duration-150";

  return (
    <div className={cn("relative overflow-hidden city-canvas", className)}>
      <div ref={hostRef} className="absolute inset-0" />
      <div className="absolute top-3 right-3 flex flex-col gap-2 select-none">
        <button className={iconBtn} onClick={() => api.current?.zoom(1.25)} aria-label="Zoom in" title="Zoom in">
          <Plus className="size-4" />
        </button>
        <button className={iconBtn} onClick={() => api.current?.zoom(0.8)} aria-label="Zoom out" title="Zoom out">
          <Minus className="size-4" />
        </button>
        <button className={iconBtn} onClick={() => api.current?.fit()} aria-label="Fit to screen" title="Fit everything in view (0)">
          <Scan className="size-4" />
        </button>
        <button className={iconBtn} onClick={() => api.current?.rotate(-45)} aria-label="Rotate left" title="Rotate left ([)">
          <RotateCcw className="size-4" />
        </button>
        <button className={iconBtn} onClick={() => api.current?.rotate(45)} aria-label="Rotate right" title="Rotate right (])">
          <RotateCw className="size-4" />
        </button>
      </div>
      <div className="absolute bottom-3 left-3 flex items-center gap-3 select-none px-2 py-1 rounded-lg bg-surface/85 border border-border backdrop-blur-sm">
        {[
          ["drag", "pan"],
          ["scroll", "zoom"],
          ["right-drag", "tilt"],
          ["[ ]", "rotate"],
          ["0", "fit"],
        ].map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5 type-caption">
            <kbd className="px-1.5 h-5 inline-flex items-center rounded-md border border-border bg-surface text-caption font-semibold text-text-secondary">
              {k}
            </kbd>
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}
