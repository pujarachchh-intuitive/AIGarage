"use client";

// The system model: every file of a codebase as a building whose form says what the
// file is and whose marks say how healthy it is (see buildings.tsx). Folders are
// plates, dependencies run as traces on the floor, Bob-found links glow acid.

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { CameraControls, Environment, Grid, Html, Lightformer, Line, RoundedBox } from "@react-three/drei";
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { ARCHETYPE_LABEL, CELL, impactRings, layoutCity, storySource, type CityData, type CityFile } from "@/lib/city";
import { LAYER_ACCENTS } from "@/lib/palette";
import {
  ACID,
  FIXED,
  PALETTES,
  SIGNAL,
  engraveTexture,
  engravedMaterial,
  pointAt,
  routeLinks,
  type ModelPalette,
  type Route,
} from "@/components/city/model/kit";
import { Building, createSharedMaterials, facadePattern, footprintFor, roofHeight, untestedHeight } from "@/components/city/model/buildings";
import { Crew } from "@/components/city/model/crew";

export type ColorMode = "zinc" | "folder";
export type HeightMode = "lines" | "imports";
export type ArcsMode = "all" | "selected" | "none";
export type LabelsMode = "landmarks" | "all" | "none";

const FOLDER_TINT = ["#8b9e8e", "#c99676", "#c9b48a", "#8fa0c2", "#b3a488", "#9fb0b8", "#cf9677", "#7f9870"];
const STONE = LAYER_ACCENTS[7];

const PLATE_TOP = 0.1;
const TRACE_Y = PLATE_TOP + 0.012;
const MARGIN = 8;

export interface ModelApi {
  fit: (animate?: boolean) => void;
  zoom: (factor: number) => void;
  rotate: (deg: number) => void;
}

export interface CityModelProps {
  data: CityData;
  dark: boolean;
  selected: string | null;
  focusDir: string | null;
  colorMode: ColorMode;
  heightMode?: HeightMode;
  arcs?: ArcsMode;
  labels?: LabelsMode;
  autoRotate?: boolean;
  onSelect?: (path: string | null) => void;
  /** Landing-page story chapter (0–4). Undefined in the app. */
  story?: number;
  /** Show the Bob crew deck (landing page, Fix chapter). */
  crew?: boolean;
  reduceMotion: boolean;
  apiRef?: Ref<ModelApi | null>;
  title?: string;
}

interface BuildingEntry {
  file: CityFile;
  mat: THREE.MeshPhysicalMaterial;
  base: THREE.Color;
  dir: string;
}

/** Eases a building material towards its target state. */
function easeMaterial(mat: THREE.MeshPhysicalMaterial, target: THREE.Color, emissive: number, k: number) {
  mat.color.lerp(target, k);
  mat.emissive.copy(mat.color);
  mat.emissiveIntensity += (emissive - mat.emissiveIntensity) * k;
}

/** Height for the "imports" mode: how many files use this one, on a log scale. */
function usageHeight(f: CityFile) {
  return 1.4 + 6.2 * Math.log10(1 + f.importedBy.length * 3);
}

export function CityModel({
  data,
  dark,
  selected,
  focusDir,
  colorMode,
  heightMode = "lines",
  arcs = "all",
  labels = "landmarks",
  autoRotate = false,
  onSelect,
  story,
  crew = false,
  reduceMotion,
  apiRef,
  title,
}: CityModelProps) {
  const p: ModelPalette = PALETTES[dark ? "dark" : "light"];
  const layout = useMemo(() => layoutCity(data), [data]);
  const heightOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of data.files) m.set(f.path, heightMode === "imports" ? usageHeight(f) : (layout.positions.get(f.path)?.h ?? 2));
    return m;
  }, [data, layout, heightMode]);
  const routes = useMemo(() => routeLinks(data.links, layout, TRACE_Y), [data, layout]);
  const dirIndex = useMemo(() => new Map(data.districts.map((d, i) => [d.dir, i])), [data]);
  const layerById = useMemo(() => new Map(data.layers.map((l) => [l.id, l])), [data]);
  const maxH = useMemo(() => Math.max(4, ...heightOf.values()), [heightOf]);
  const plinth = { w: layout.size.w + MARGIN * 2, d: layout.size.d + MARGIN * 2 };
  const storyMode = story !== undefined;

  const controls = useRef<CameraControls>(null);
  const chapterStart = useRef(-1);
  const { camera, size } = useThree();

  const shared = useMemo(() => createSharedMaterials(p, dark), [p, dark]);
  useEffect(() => () => shared.dispose(), [shared]);

  // Body materials: one per building so each can change state on its own; one shader program.
  const entries = useMemo(() => {
    const list: BuildingEntry[] = [];
    for (const f of data.files) {
      const h = heightOf.get(f.path) ?? 2;
      const mat = engravedMaterial(p, f.archetype === "quality" ? p.annex : p.building, {
        pattern: facadePattern(f.archetype),
        hatch: untestedHeight(f, h),
        base: PLATE_TOP,
      });
      if (colorMode === "folder") mat.color.lerp(new THREE.Color(FOLDER_TINT[(dirIndex.get(f.dir) ?? 0) % FOLDER_TINT.length]), dark ? 0.3 : 0.4);
      list.push({ file: f, mat, base: mat.color.clone(), dir: f.dir });
    }
    return list;
  }, [data, p, dark, colorMode, dirIndex, heightOf]);
  useEffect(() => () => entries.forEach((e) => e.mat.dispose()), [entries]);

  const [hovered, setHovered] = useState<string | null>(null);

  /* ─── Camera ─────────────────────────────────────────────────────────── */

  const radius = 0.5 * Math.hypot(plinth.w, plinth.d, maxH);
  const view = (azimuth: number, polar: number, distFactor: number, target = new THREE.Vector3(0, maxH * 0.18, 0), animate = true) => {
    const c = controls.current;
    if (!c) return;
    const persp = camera as THREE.PerspectiveCamera;
    const vFov = THREE.MathUtils.degToRad(persp.fov) / 2;
    const hFov = Math.atan(Math.tan(vFov) * (size.width / Math.max(1, size.height)));
    const dist = (radius / Math.sin(Math.min(vFov, hFov))) * distFactor;
    const pos = new THREE.Vector3().setFromSphericalCoords(dist, polar, azimuth).add(target);
    c.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, animate && !reduceMotion);
  };

  useImperativeHandle(apiRef, () => ({
    fit: (animate = true) => view(Math.PI / 4, 0.98, 0.78, undefined, animate),
    zoom: (f) => controls.current?.dolly(controls.current.distance * (1 - 1 / f), !reduceMotion),
    rotate: (deg) => controls.current?.rotate(THREE.MathUtils.degToRad(deg), 0, !reduceMotion),
  }));

  // First frame: fitted, no animation.
  useEffect(() => {
    if (!storyMode) view(Math.PI / 4, 0.98, 0.78, undefined, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, storyMode]);

  const src = useMemo(() => storySource(data), [data]);
  const srcPos = layout.positions.get(src);
  const impact = useMemo(() => impactRings(data, src), [data, src]);
  const crewZ = plinth.d / 2 + 3.2;

  // Story cameras, one per chapter.
  useEffect(() => {
    if (!storyMode) return;
    const t = srcPos ? new THREE.Vector3(srcPos.x * 0.6, maxH * 0.12, srcPos.z * 0.6) : undefined;
    const shots: [number, number, number, THREE.Vector3?][] = [
      [Math.PI / 4, 1.02, 0.86],
      [0.001, 0.06, 0.92],
      [-Math.PI / 5, 0.92, 0.72, t],
      // Over the crew's shoulders, into the city they are fixing.
      [0.3, 1.14, 0.66, new THREE.Vector3(0, maxH * 0.14, crew ? plinth.d * 0.18 : 0)],
      [Math.PI / 2.6, 1.16, 0.84],
    ];
    const s = shots[Math.min(story ?? 0, shots.length - 1)];
    view(s[0], s[1], s[2], s[3], true);
    chapterStart.current = -1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story, storyMode, layout, size.width, size.height]);

  /* ─── State, animated every frame ─────────────────────────────────────── */

  const idleTrace = useRef<{ material: THREE.Material & { opacity: number } } | null>(null);
  const bobTrace = useRef<{ material: THREE.Material & { opacity: number; dashOffset: number } } | null>(null);
  const storyTraces = useRef<({ material: THREE.Material & { opacity: number; color: THREE.Color; dashOffset: number } } | null)[]>([]);
  const pucks = useRef<THREE.InstancedMesh>(null);
  const selRing = useRef<THREE.Group>(null);
  const signal = useMemo(() => new THREE.Color(SIGNAL), []);
  const acid = useMemo(() => new THREE.Color(ACID), []);
  const fixed = useMemo(() => new THREE.Color(FIXED), []);
  const recede = useMemo(() => new THREE.Color(p.recede), [p]);

  const selFile = selected ? data.files.find((f) => f.path === selected) : undefined;
  const users = useMemo(() => new Set(selFile?.importedBy ?? []), [selFile]);
  const uses = useMemo(() => new Set(selFile?.imports ?? []), [selFile]);
  const ringOf = useMemo(() => {
    const m = new Map<string, number>();
    impact.rings.forEach((r, k) => r.forEach((q) => m.set(q, k)));
    return m;
  }, [impact]);

  const routeByKey = useMemo(() => new Map(routes.map((r) => [r.from + ">" + r.to, r])), [routes]);
  const storyRouteList: (Route | undefined)[] = useMemo(
    () => impact.edges.map((e) => routeByKey.get(e.from + ">" + e.to)),
    [impact, routeByKey],
  );
  // The frame loop reads the latest render through refs, so it never mutates render-scope values.
  const scratch = useRef({ color: new THREE.Color(), v: new THREE.Vector3(), m: new THREE.Matrix4() });
  const live = useRef({ entries, storyRouteList, ringOf, users, uses, hovered, beacon: shared.beacon });
  useEffect(() => {
    live.current = { entries, storyRouteList, ringOf, users, uses, hovered, beacon: shared.beacon };
  });

  const RING_STEP = 0.55;
  useFrame((state, dt) => {
    const now = state.clock.elapsedTime;
    const L = live.current;
    const tmpColor = scratch.current.color;
    const tmpV = scratch.current.v;
    const m4 = scratch.current.m;
    if (chapterStart.current < 0) chapterStart.current = now;
    const t = reduceMotion ? 99 : now - chapterStart.current;
    const ch = story ?? -1;
    const k = 1 - Math.exp(-dt * 7);

    // Slow turntable on the landing page (except in plan view), and when asked in the app.
    if (!reduceMotion && ((storyMode && ch !== 1) || (!storyMode && autoRotate))) controls.current?.rotate(dt * 0.035, 0, false);

    for (const e of L.entries) {
      const path = e.file.path;
      let target = e.base;
      let emissive = 0;
      if (storyMode) {
        const ring = L.ringOf.get(path);
        if (ring !== undefined && (ch === 2 || ch === 3)) {
          const lit = THREE.MathUtils.clamp((t - 0.35 - ring * RING_STEP) * 3, 0, 1);
          const strength = [1, 0.8, 0.62, 0.48, 0.38, 0.3][ring] ?? 0.3;
          tmpColor.copy(e.base).lerp(signal, lit * strength);
          if (ch === 3) {
            const arrive = 0.9 + ring * 0.6;
            const done = THREE.MathUtils.clamp((t - arrive) * 2.5, 0, 1);
            tmpColor.copy(e.base).lerp(signal, strength).lerp(fixed, done * 0.85);
          }
          target = tmpColor;
          emissive = dark ? 0.22 : 0;
        }
      } else {
        const dim = (selFile && path !== selected && !L.users.has(path) && !L.uses.has(path)) || (focusDir && e.dir !== focusDir);
        if (path === selected) {
          target = tmpColor.copy(e.base).lerp(acid, 0.9);
          emissive = dark ? 0.3 : 0.05;
        } else if (L.users.has(path)) target = tmpColor.copy(e.base).lerp(signal, 0.4);
        else if (dim) target = tmpColor.copy(e.base).lerp(recede, 0.82);
        else if (path === L.hovered) target = tmpColor.copy(e.base).offsetHSL(0, 0, dark ? 0.1 : -0.05);
      }
      easeMaterial(e.mat, target, emissive, k);
    }

    // Critical beacons breathe.
    if (!reduceMotion) {
      const b = 0.75 + 0.25 * Math.sin(now * 2.2);
      L.beacon.color.set(ACID).multiplyScalar((dark ? 2.4 : 1.1) * b);
    }

    // Parser traces: etched and quiet; brighter in the plan view; faint when a file is picked.
    const idle = idleTrace.current?.material;
    if (idle) {
      const want = storyMode ? (ch === 1 ? 0.95 : ch === 2 || ch === 3 ? 0.28 : 0.55) : selFile || focusDir ? 0.2 : 0.7;
      idle.opacity += (want - idle.opacity) * k;
    }
    // Bob traces: always visible, flowing.
    const bob = bobTrace.current?.material;
    if (bob) {
      const want = selFile || focusDir ? 0.35 : 1;
      bob.opacity += (want - bob.opacity) * k;
      if (!reduceMotion) bob.dashOffset -= dt * 1.2;
    }

    // Story traces: each lights when its ring lights, and flows.
    impact.edges.forEach((edge, i) => {
      const m = storyTraces.current[i]?.material;
      if (!m) return;
      const on = ch === 2 || ch === 3 ? THREE.MathUtils.clamp((t - 0.35 - edge.ring * RING_STEP + 0.25) * 3, 0, 1) : 0;
      m.opacity += (on - m.opacity) * k;
      const doneFix = ch === 3 ? THREE.MathUtils.clamp((t - 0.9 - edge.ring * 0.6) * 2.5, 0, 1) : 0;
      m.color.copy(signal).lerp(fixed, doneFix);
      if (!reduceMotion) m.dashOffset -= dt * 1.6;
    });

    // Agents: one puck per fix, travelling the route to the file it fixes.
    const pk = pucks.current;
    if (pk) {
      let n = 0;
      if (ch === 3) {
        impact.edges.forEach((edge, i) => {
          const r = L.storyRouteList[i];
          if (!r) return;
          const start = 0.3 + edge.ring * 0.6;
          const u = THREE.MathUtils.clamp((t - start) / 0.6, 0, 1);
          if (u <= 0 || u >= 1) return;
          pointAt(r, u * r.lengths[r.lengths.length - 1], tmpV);
          m4.makeTranslation(tmpV.x, tmpV.y + 0.18, tmpV.z);
          pk.setMatrixAt(n++, m4);
        });
      }
      pk.count = n;
      pk.instanceMatrix.needsUpdate = true;
    }

    if (selRing.current) {
      const s = 1 + Math.sin(now * 2.4) * (reduceMotion ? 0 : 0.03);
      selRing.current.scale.set(s, 1, s);
    }
  });

  /* ─── Geometry ───────────────────────────────────────────────────────── */

  // Traces, merged into one draw call per kind.
  const segmentsOf = (list: Route[]) => {
    const pts: THREE.Vector3[] = [];
    for (const r of list) for (let i = 1; i < r.points.length; i++) pts.push(r.points[i - 1], r.points[i]);
    return pts;
  };
  const parserSegments = useMemo(() => segmentsOf(routes.filter((r) => !r.bob)), [routes]);
  const bobSegments = useMemo(() => segmentsOf(routes.filter((r) => r.bob)), [routes]);

  const selectedRoutes = useMemo(
    () => (selected ? routes.filter((r) => r.from === selected || r.to === selected) : []),
    [routes, selected],
  );

  // Engravings: folder names in front of each plate, and a title block on the plinth.
  const [engravings, setEngravings] = useState<{ tex: THREE.Texture; w: number; h: number; x: number; z: number }[]>([]);
  useEffect(() => {
    let alive = true;
    const made: THREE.Texture[] = [];
    document.fonts.ready.then(() => {
      if (!alive) return;
      const list = layout.districts.map((d) => {
        const count = data.districts.find((x) => x.dir === d.dir)?.files.length ?? 0;
        const e = engraveTexture(
          [
            { text: d.dir.toUpperCase(), size: 0.62, weight: 600, mono: true, tracking: 0.16 },
            { text: `${count} ${count === 1 ? "FILE" : "FILES"}`, size: 0.36, weight: 500, mono: true, tracking: 0.2 },
          ],
          Math.max(4, d.w),
          p,
        );
        made.push(e.texture);
        return { tex: e.texture, w: e.width, h: e.height, x: d.x + d.w / 2, z: d.z + d.d + 0.35 + e.height / 2 };
      });
      const titleTex = engraveTexture(
        [
          { text: (title ?? "System model").toUpperCase(), size: 0.9, weight: 600, mono: true, tracking: 0.12 },
          {
            text: `${data.stats.files} FILES · ${data.stats.links} DEPENDENCIES · ${data.stats.districts} DISTRICTS`,
            size: 0.38,
            mono: true,
            tracking: 0.18,
          },
          {
            text: `SYSTEMDNA · HEIGHT = ${heightMode === "imports" ? "FILES THAT USE IT" : "LINES OF CODE"} · FORM = WHAT THE FILE HOLDS`,
            size: 0.3,
            mono: true,
            tracking: 0.18,
          },
        ],
        Math.min(24, plinth.w * 0.55),
        p,
        "left",
      );
      made.push(titleTex.texture);
      list.push({
        tex: titleTex.texture,
        w: titleTex.width,
        h: titleTex.height,
        x: -plinth.w / 2 + 1.6 + titleTex.width / 2,
        z: plinth.d / 2 - 1.2 - titleTex.height / 2,
      });
      setEngravings(list);
    });
    return () => {
      alive = false;
      made.forEach((t) => t.dispose());
    };
  }, [layout, data, p, plinth.w, plinth.d, title, heightMode]);

  const pickFor = (path: string) =>
    storyMode
      ? {}
      : {
          onClick: (e: ThreeEvent<MouseEvent>) => {
            if (e.delta > 4) return;
            e.stopPropagation();
            onSelect?.(path);
          },
          onPointerOver: (e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            setHovered(path);
            document.body.style.cursor = "pointer";
          },
          onPointerOut: () => {
            setHovered((h) => (h === path ? null : h));
            document.body.style.cursor = "";
          },
        };

  const tagFor = (f: CityFile) => {
    if (storyMode) return (story === 2 || story === 3) && f.path === src;
    if (f.path === hovered) return false; // the card takes over
    if (f.path === selected) return true;
    if (labels === "none") return false;
    if (labels === "all") return !selFile || users.has(f.path) || uses.has(f.path);
    const related = selFile && (users.has(f.path) || uses.has(f.path));
    return (!selFile && !focusDir && Boolean(f.landmark)) || (related && selFile!.importedBy.length + selFile!.imports.length <= 8);
  };

  const hoveredFile = !storyMode && hovered ? data.files.find((f) => f.path === hovered) : undefined;
  const showParser = storyMode || arcs === "all";
  const showBob = arcs !== "none";
  const showSelected = !storyMode && arcs !== "none";

  return (
    <>
      <color attach="background" args={[p.background]} />
      <CameraControls
        ref={controls}
        makeDefault
        smoothTime={storyMode ? 1.1 : 0.45}
        minPolarAngle={0.04}
        maxPolarAngle={1.32}
        minDistance={radius * 0.5}
        maxDistance={radius * 14}
        mouseButtons={storyMode ? { left: 0, middle: 0, right: 0, wheel: 0 } : { left: 2, middle: 16, right: 1, wheel: 16 }}
        touches={storyMode ? { one: 0, two: 0, three: 0 } : { one: 128, two: 32768, three: 0 }}
      />

      {/* Studio light. Charcoal: a top softbox, a strong rim from behind, and a faint acid
          card that puts a yellow edge on glossy volumes. Bone: soft, even daylight. */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={dark ? 1.6 : 1.3} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[24, 24, 1]} />
        <Lightformer form="rect" intensity={dark ? 2.6 : 1.1} position={[-10, 5, -10]} rotation-y={Math.PI / 4} scale={[18, 4, 1]} />
        <Lightformer form="rect" intensity={dark ? 0.9 : 1.3} position={[12, 4, 2]} rotation-y={-Math.PI / 2} scale={[12, 5, 1]} />
        <Lightformer form="rect" intensity={dark ? 0.8 : 0.9} position={[0, 4, 12]} rotation-y={Math.PI} scale={[16, 5, 1]} />
        <Lightformer form="rect" color={ACID} intensity={dark ? 0.9 : 0.25} position={[10, 3, -8]} rotation-y={-Math.PI / 3} scale={[6, 2, 1]} />
      </Environment>
      <ambientLight intensity={dark ? 0.18 : 0.12} />
      <directionalLight
        castShadow
        position={[radius * 0.25, radius * 1.5, radius * 1.05]}
        intensity={dark ? 2.4 : 2.8}
        color={dark ? "#e6ebf2" : "#fff6ea"}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.025}
        shadow-camera-left={-radius * 1.1}
        shadow-camera-right={radius * 1.1}
        shadow-camera-top={radius * 1.1}
        shadow-camera-bottom={-radius * 1.1}
        shadow-camera-near={1}
        shadow-camera-far={radius * 5}
      />

      {/* Plinth: a milled block, matte top, engraved grid in the streets. */}
      <RoundedBox args={[plinth.w, 1.1, plinth.d]} radius={0.3} smoothness={4} position={[0, -0.55, 0]} receiveShadow>
        <meshPhysicalMaterial color={p.plinthSide} roughness={dark ? 0.32 : 0.55} metalness={dark ? 0.75 : 0.2} clearcoat={0.5} clearcoatRoughness={0.3} />
      </RoundedBox>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, 0]} receiveShadow>
        <planeGeometry args={[plinth.w - 0.7, plinth.d - 0.7]} />
        <meshStandardMaterial color={p.plinthTop} roughness={0.92} />
      </mesh>
      <Grid
        position={[0, 0.004, 0]}
        args={[plinth.w - 1, plinth.d - 1]}
        cellSize={CELL / 4}
        sectionSize={CELL}
        cellThickness={0.5}
        sectionThickness={0.9}
        cellColor={p.grid}
        sectionColor={p.gridSection}
        fadeDistance={radius * 20}
        fadeStrength={0}
      />

      {/* District plates. */}
      {layout.districts.map((d) => {
        const i = dirIndex.get(d.dir) ?? 0;
        const base = new THREE.Color(p.plate);
        if (colorMode === "folder") base.lerp(new THREE.Color(FOLDER_TINT[i % FOLDER_TINT.length]), dark ? 0.18 : 0.3);
        const inFocus = !focusDir || focusDir === d.dir;
        return (
          <RoundedBox
            key={d.dir}
            args={[d.w, PLATE_TOP, d.d]}
            radius={0.04}
            smoothness={2}
            position={[d.x + d.w / 2, PLATE_TOP / 2, d.z + d.d / 2]}
            receiveShadow
          >
            <meshStandardMaterial color={inFocus ? base : base.clone().lerp(new THREE.Color(p.plinthTop), 0.6)} roughness={0.8} />
          </RoundedBox>
        );
      })}

      {/* Engravings. */}
      {engravings.map((e, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[e.x, 0.006, e.z]}>
          <planeGeometry args={[e.w, e.h]} />
          <meshBasicMaterial map={e.tex} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      ))}

      {/* Dependency traces: parser links etched, Bob links in acid. */}
      {showParser && parserSegments.length > 0 ? (
        <Line ref={idleTrace as never} points={parserSegments} segments color={p.traceIdle} lineWidth={0.075} worldUnits transparent opacity={0.7} depthWrite={false} />
      ) : null}
      {showBob && bobSegments.length > 0 ? (
        <Line
          ref={bobTrace as never}
          points={bobSegments}
          segments
          color={new THREE.Color(ACID).multiplyScalar(dark ? 1.5 : 0.75)}
          lineWidth={0.11}
          worldUnits
          dashed
          dashSize={0.55}
          gapSize={0.3}
          transparent
          opacity={1}
          depthWrite={false}
          toneMapped={false}
        />
      ) : null}
      {storyMode
        ? storyRouteList.map((r, i) =>
            r ? (
              <Line
                key={i}
                ref={(el) => {
                  storyTraces.current[i] = el as never;
                }}
                points={r.points}
                color={SIGNAL}
                lineWidth={0.15}
                worldUnits
                dashed
                dashSize={0.9}
                gapSize={0.35}
                transparent
                opacity={0}
                depthWrite={false}
                toneMapped={false}
              />
            ) : null,
          )
        : showSelected
          ? selectedRoutes.map((r) => (
              <FlowTrace
                key={r.from + ">" + r.to}
                route={r}
                color={r.to === selected ? SIGNAL : dark ? "#f3f4ee" : "#1a1b17"}
                reduceMotion={reduceMotion}
              />
            ))
          : null}

      {/* Fix pucks. */}
      <instancedMesh ref={pucks} args={[undefined, undefined, Math.max(1, impact.edges.length)]} frustumCulled={false}>
        <sphereGeometry args={[0.2, 16, 12]} />
        <meshBasicMaterial color={new THREE.Color(FIXED).multiplyScalar(2)} toneMapped={false} />
      </instancedMesh>

      {/* Buildings. */}
      {entries.map((e) => {
        const pos = layout.positions.get(e.file.path);
        if (!pos) return null;
        const h = heightOf.get(e.file.path) ?? pos.h;
        const accent = (e.file.layer && layerById.get(e.file.layer)?.accent) || STONE;
        return (
          <group key={e.file.path} position={[pos.x, PLATE_TOP, pos.z]}>
            <Building file={e.file} h={h} body={e.mat} accent={accent} shared={shared} pick={pickFor(e.file.path)} />
            {tagFor(e.file) ? (
              <Html position={[0, roofHeight(e.file, h) + 0.6, 0]} center={false} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
                <div className="model-tag" data-state={e.file.path === selected || (storyMode && e.file.path === src) ? "selected" : undefined}>
                  <span className="model-tag-name">{e.file.path.split("/").pop()}</span>
                  {storyMode ? <span className="model-tag-meta">field renamed</span> : null}
                </div>
              </Html>
            ) : null}
          </group>
        );
      })}

      {/* Hover: the building's full profile. */}
      {hoveredFile && layout.positions.get(hoveredFile.path) ? (
        <Html
          position={[
            layout.positions.get(hoveredFile.path)!.x,
            PLATE_TOP + roofHeight(hoveredFile, heightOf.get(hoveredFile.path) ?? 2) + 0.6,
            layout.positions.get(hoveredFile.path)!.z,
          ]}
          zIndexRange={[30, 0]}
          style={{ pointerEvents: "none" }}
        >
          <ModelCard file={hoveredFile} layer={hoveredFile.layer ? layerById.get(hoveredFile.layer) : undefined} bobLinks={routes.filter((r) => r.bob && (r.from === hoveredFile.path || r.to === hoveredFile.path)).length} />
        </Html>
      ) : null}

      {/* Selection: an acid ring on the plate around the picked file. */}
      {selFile && layout.positions.get(selFile.path) ? (
        <group ref={selRing} position={[layout.positions.get(selFile.path)!.x, TRACE_Y + 0.004, layout.positions.get(selFile.path)!.z]}>
          <mesh rotation-x={-Math.PI / 2}>
            <ringGeometry args={[footprintFor(selFile.components) * 0.72 + 0.6, footprintFor(selFile.components) * 0.72 + 0.7, 72]} />
            <meshBasicMaterial color={new THREE.Color(ACID).multiplyScalar(dark ? 1.6 : 0.8)} toneMapped={false} transparent opacity={0.95} />
          </mesh>
        </group>
      ) : null}

      {/* The Bob crew, in front of the model. */}
      {crew ? (
        <group position={[0, 0, crewZ]}>
          <Crew active={story === 3} working={story === 3} reduceMotion={reduceMotion} />
        </group>
      ) : null}

      <EffectComposer multisampling={0} enableNormalPass={false}>
        <N8AO aoRadius={2.2} distanceFalloff={1.1} intensity={dark ? 2.4 : 2.6} quality="medium" halfRes />
        <Bloom mipmapBlur luminanceThreshold={0.95} luminanceSmoothing={0.2} intensity={dark ? 0.85 : 0.3} radius={0.6} />
        <SMAA />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        <Vignette offset={0.3} darkness={dark ? 0.4 : 0} />
      </EffectComposer>
    </>
  );
}

/** Hover card: what the building is, and how healthy. */
export function ModelCard({ file, layer, bobLinks }: { file: CityFile; layer?: { label: string; accent: string }; bobLinks: number }) {
  const tested = file.components - file.untested;
  return (
    <div className="model-card">
      <div className="model-card-head">
        <span className="model-card-dot" style={{ background: layer?.accent ?? STONE }} />
        <span>{layer?.label ?? file.dir}</span>
        {(layer?.label ?? file.dir).toLowerCase() !== ARCHETYPE_LABEL[file.archetype].toLowerCase() ? (
          <>
            <span className="model-card-sep" />
            <span>{ARCHETYPE_LABEL[file.archetype]}</span>
          </>
        ) : null}
      </div>
      <div className="model-card-name">{file.path.split("/").pop()}</div>
      <div className="model-card-path">{file.path}</div>
      <dl className="model-card-stats">
        <div>
          <dt>Lines</dt>
          <dd>{file.lines.toLocaleString("en-US")}</dd>
        </div>
        <div>
          <dt>Parts</dt>
          <dd>{file.components}</dd>
        </div>
        <div>
          <dt>Tested</dt>
          <dd>{file.components ? `${tested}/${file.components}` : "–"}</dd>
        </div>
        <div>
          <dt>Used by</dt>
          <dd>{file.importedBy.length}</dd>
        </div>
      </dl>
      {file.pii || file.critical || file.untested > 0 || bobLinks > 0 ? (
        <div className="model-card-flags">
          {file.critical ? <span data-kind="critical">Critical</span> : null}
          {file.pii ? <span data-kind="pii">Personal data</span> : null}
          {file.untested > 0 ? <span data-kind="untested">{file.untested} untested</span> : null}
          {bobLinks > 0 ? <span data-kind="bob">{bobLinks} found by Bob</span> : null}
        </div>
      ) : null}
      {file.owners.length ? <div className="model-card-owner">Owner · {file.owners.join(", ")}</div> : null}
    </div>
  );
}

/** A selected dependency: brighter, wider, and flowing from the used file to its user. */
function FlowTrace({ route, color, reduceMotion }: { route: Route; color: string; reduceMotion: boolean }) {
  const ref = useRef<{ material: { dashOffset: number } } | null>(null);
  useFrame((_, dt) => {
    if (ref.current && !reduceMotion) ref.current.material.dashOffset -= dt * 1.4;
  });
  return <Line ref={ref as never} points={route.points} color={color} lineWidth={0.13} worldUnits dashed dashSize={0.8} gapSize={0.32} toneMapped={false} />;
}
