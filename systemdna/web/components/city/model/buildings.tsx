"use client";

// One building per file. Its form says what the file is; its marks say how healthy it is.
//
//   Form        what the file holds (majority component type)
//   Height      lines of code (log scale)
//   Footprint   how many components live in it
//   Hairline    the layer, as a thin accent outline on the ground
//   Hatch       untested components: fine diagonal lines over the untested share (facade shader)
//   Gold ring   holds personal data
//   Acid beacon high criticality

import { useMemo } from "react";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { Archetype, CityFile } from "@/lib/city";
import { BRASS, COPPER, FACADE, FLOOR, SLATE, type ModelPalette } from "@/components/city/model/kit";

/** Which facade each kind of building wears. */
export function facadePattern(a: Archetype) {
  if (a === "logic" || a === "transform" || a === "insight") return FACADE.ribbons;
  if (a === "interface" || a === "contract") return FACADE.mullions;
  return FACADE.plain;
}

/** Height of the untested share, for the facade hatch. */
export function untestedHeight(file: CityFile, h: number) {
  if (!file.untested || !file.components) return 0;
  return h * (file.untested / file.components);
}

export const LANDMARK_METAL = { entry: SLATE, core: BRASS, hotspot: COPPER } as const;

/** Footprint in scene units: more components, broader building. Fits the 3.2-unit cell. */
export function footprintFor(components: number) {
  if (components <= 0) return 1.5;
  return THREE.MathUtils.clamp(1.3 + Math.sqrt(components) * 0.34, 1.3, 2.7);
}

/** Materials shared by every building in a theme. */
export interface SharedMaterials {
  glass: THREE.MeshPhysicalMaterial;
  slab: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  metal: THREE.MeshPhysicalMaterial;
  pii: THREE.MeshPhysicalMaterial;
  beacon: THREE.MeshBasicMaterial;
  accent: (color: string) => THREE.MeshBasicMaterial;
  screen: (color: string) => THREE.MeshBasicMaterial;
  dispose: () => void;
}

export function createSharedMaterials(p: ModelPalette, dark: boolean): SharedMaterials {
  const accents = new Map<string, THREE.MeshBasicMaterial>();
  const screens = new Map<string, THREE.MeshBasicMaterial>();
  const mats: THREE.Material[] = [];
  const keep = <M extends THREE.Material>(m: M) => (mats.push(m), m);
  return {
    glass: keep(
      new THREE.MeshPhysicalMaterial({
        color: p.glass,
        metalness: 0.1,
        roughness: 0.06,
        transparent: true,
        opacity: dark ? 0.2 : 0.32,
        envMapIntensity: 2.2,
        clearcoat: 1,
        depthWrite: false,
      }),
    ),
    slab: keep(new THREE.MeshStandardMaterial({ color: dark ? "#3a3d35" : "#d9d6cc", roughness: 0.7 })),
    roof: keep(new THREE.MeshStandardMaterial({ color: dark ? "#1f211c" : "#d4d1c7", roughness: 0.85 })),
    metal: keep(new THREE.MeshPhysicalMaterial({ color: dark ? "#8d9084" : "#a9a79d", metalness: 0.9, roughness: 0.3, clearcoat: 0.5 })),
    pii: keep(
      new THREE.MeshPhysicalMaterial({
        color: "#e8b04a",
        metalness: 1,
        roughness: 0.22,
        emissive: "#e8b04a",
        emissiveIntensity: dark ? 0.35 : 0.08,
      }),
    ),
    // Colour above 1.0 feeds the bloom pass in the charcoal studio.
    beacon: keep(new THREE.MeshBasicMaterial({ color: new THREE.Color("#D8F53F").multiplyScalar(dark ? 2.4 : 1.1), toneMapped: false })),
    accent: (color) => {
      let m = accents.get(color);
      if (!m) {
        m = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(dark ? 1.35 : 0.85), toneMapped: false }));
        accents.set(color, m);
      }
      return m;
    },
    screen: (color) => {
      let m = screens.get(color);
      if (!m) {
        m = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(dark ? 1.15 : 0.9), toneMapped: false }));
        screens.set(color, m);
      }
      return m;
    },
    dispose: () => mats.forEach((m) => m.dispose()),
  };
}

type PickHandlers = {
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
};

interface BuildingProps {
  file: CityFile;
  h: number;
  /** State-driven body material (selection, impact, dimming). */
  body: THREE.MeshPhysicalMaterial;
  accent: string;
  shared: SharedMaterials;
  pick: PickHandlers;
}

/** Height of the roof, where beacons and landmark plates sit. */
export function roofHeight(file: CityFile, h: number) {
  const w = footprintFor(file.components);
  switch (file.archetype) {
    case "insight":
      return Math.max(0.8, h - 0.5) + 0.05;
    case "business":
      return Math.max(0.8, h - w * 0.45) + w * 0.45;
    case "quality":
      return h + 0.08;
    default:
      return h;
  }
}

export function Building({ file, h, body, accent, shared, pick }: BuildingProps) {
  const w = footprintFor(file.components);
  const round = file.archetype === "storage";
  return (
    <>
      <Form file={file} w={w} h={h} body={body} shared={shared} pick={pick} accent={accent} />
      {["logic", "transform", "contract", "quality"].includes(file.archetype) && w >= 1.45 && h > 1.6 ? (
        <RoofKit seed={hashPath(file.path)} w={file.archetype === "transform" ? w * 0.56 : file.archetype === "logic" && h > 8 ? w * 0.72 : w} y={roofHeight(file, h) + (file.archetype === "quality" ? 0 : 0.1)} shared={shared} />
      ) : null}
      {facadePattern(file.archetype) !== FACADE.plain ? <Canopy w={file.archetype === "interface" ? w * 0.8 : w} shared={shared} /> : null}
      <LayerOutline w={w} round={round} material={shared.accent(accent)} />
      {file.pii ? (
        <mesh rotation-x={-Math.PI / 2} position-y={0.02} material={shared.pii}>
          <ringGeometry args={[w * 0.72 + 0.34, w * 0.72 + 0.44, 72]} />
        </mesh>
      ) : null}
      {file.critical ? <Beacon y={roofHeight(file, h) + (file.archetype === "interface" ? 0.95 : 0)} shared={shared} /> : null}
      {file.landmark && !["interface", "business", "insight"].includes(file.archetype) ? (
        <RoundedBox args={[w * 0.5, 0.06, w * 0.5]} radius={0.02} smoothness={2} position={[0, roofHeight(file, h) + 0.03, 0]}>
          <meshPhysicalMaterial color={LANDMARK_METAL[file.landmark]} metalness={0.9} roughness={0.28} clearcoat={0.6} />
        </RoundedBox>
      ) : null}
    </>
  );
}

/* ─── Forms ──────────────────────────────────────────────────────────────── */

function Form({
  file,
  w,
  h,
  body,
  shared,
  pick,
  accent,
}: {
  file: CityFile;
  w: number;
  h: number;
  body: THREE.Material;
  shared: SharedMaterials;
  pick: PickHandlers;
  accent: string;
}) {
  switch (file.archetype) {
    case "storage":
      return <Vault w={w} h={h} body={body} shared={shared} pick={pick} />;
    case "transform":
      return <Terraces w={w} h={h} body={body} shared={shared} pick={pick} />;
    case "interface":
      return <Broadcast w={w} h={h} body={body} shared={shared} pick={pick} accent={accent} />;
    case "contract":
      return <Prism w={w} h={h} body={body} pick={pick} />;
    case "ui":
      return <Pavilion w={w} h={h} body={body} shared={shared} pick={pick} />;
    case "insight":
      return <Observatory w={w} h={h} body={body} shared={shared} pick={pick} accent={accent} />;
    case "business":
      return <Dome w={w} h={h} body={body} shared={shared} pick={pick} />;
    case "quality":
      return <Annex w={w} h={h} body={body} shared={shared} pick={pick} />;
    default:
      return <Tower w={w} h={h} body={body} shared={shared} pick={pick} />;
  }
}

type FormProps = { w: number; h: number; body: THREE.Material; pick: PickHandlers };

/** Logic: a tower that sets back once when it is tall. */
function Tower({ w, h, body, shared, pick }: FormProps & { shared: SharedMaterials }) {
  const setback = h > 8;
  const lower = setback ? h * 0.8 : h;
  return (
    <>
      <RoundedBox args={[w, lower, w]} radius={0.06} smoothness={3} position-y={lower / 2} material={body} castShadow receiveShadow {...pick} />
      {setback ? (
        <RoundedBox args={[w * 0.72, h - lower, w * 0.72]} radius={0.05} smoothness={3} position-y={lower + (h - lower) / 2} material={body} castShadow {...pick} />
      ) : null}
      <Cornice w={setback ? w * 0.72 : w} y={h} material={shared.roof} />
      {setback ? <Cornice w={w} y={lower} material={shared.roof} /> : null}
      <RoundedBox args={[w * 0.3, 0.28, w * 0.22]} radius={0.03} smoothness={2} position={[w * 0.1, h + 0.2, -w * 0.08]} material={shared.roof} castShadow />
    </>
  );
}

/** Storage: a drum vault with two metal bands. */
function Vault({ w, h, body, shared, pick }: FormProps & { shared: SharedMaterials }) {
  const r = w / 2;
  const geo = useMemo(() => new THREE.CylinderGeometry(r, r, h, 64, 1), [r, h]);
  return (
    <>
      <mesh geometry={geo} material={body} position-y={h / 2} castShadow receiveShadow {...pick} />
      {[0.34, 0.68].map((f) =>
        h * f > 0.8 ? (
          <mesh key={f} position-y={h * f} rotation-x={Math.PI / 2} material={shared.metal}>
            <torusGeometry args={[r + 0.01, 0.035, 8, 64]} />
          </mesh>
        ) : null,
      )}
      <mesh position-y={h + 0.02} material={shared.roof}>
        <cylinderGeometry args={[r - 0.14, r - 0.14, 0.04, 48]} />
      </mesh>
    </>
  );
}

/** Transform: stages stepping back, like data refined on its way up. */
function Terraces({ w, h, body, shared, pick }: FormProps & { shared: SharedMaterials }) {
  const tiers = h < 2.4 ? [[w, 0.6], [w * 0.74, 0.4]] : [[w, 0.48], [w * 0.78, 0.31], [w * 0.56, 0.21]];
  let y = 0;
  return (
    <>
      {tiers.map(([tw, f], i) => {
        const th = h * f;
        const cy = y + th / 2;
        y += th;
        return (
          <group key={i}>
            <RoundedBox args={[tw, th, tw]} radius={0.05} smoothness={3} position-y={cy} material={body} castShadow receiveShadow {...pick} />
            <Cornice w={tw} y={y} material={shared.roof} />
          </group>
        );
      })}
    </>
  );
}

/** Interface: a slim tower with a broadcast ring above it. */
function Broadcast({ w, h, body, shared, pick, accent }: FormProps & { shared: SharedMaterials; accent: string }) {
  return (
    <>
      <RoundedBox args={[w * 0.8, h, w * 0.8]} radius={0.06} smoothness={3} position-y={h / 2} material={body} castShadow receiveShadow {...pick} />
      <Cornice w={w * 0.8} y={h} material={shared.roof} />
      <mesh position-y={h + 0.45} material={shared.metal}>
        <cylinderGeometry args={[0.035, 0.05, 0.9, 8]} />
      </mesh>
      <mesh position-y={h + 0.42} rotation-x={Math.PI / 2} material={shared.accent(accent)}>
        <torusGeometry args={[w * 0.5, 0.04, 8, 64]} />
      </mesh>
      <mesh position-y={h + 0.2} rotation-x={Math.PI / 2} material={shared.accent(accent)}>
        <torusGeometry args={[w * 0.32, 0.03, 8, 48]} />
      </mesh>
    </>
  );
}

/** Contract (types, schemas): a faceted octagonal pillar. */
function Prism({ w, h, body, pick }: FormProps) {
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(w / 2, w / 2, h, 8, 1).toNonIndexed();
    g.rotateY(Math.PI / 8);
    g.computeVertexNormals();
    return g;
  }, [w, h]);
  return (
    <>
      <mesh geometry={geo} material={body} position-y={h / 2} castShadow receiveShadow {...pick} />
      <mesh position-y={h + 0.05} rotation-y={Math.PI / 8}>
        <cylinderGeometry args={[w / 2 + 0.04, w / 2 + 0.04, 0.1, 8]} />
        <meshStandardMaterial color="#1f211c" roughness={0.6} />
      </mesh>
    </>
  );
}

/** UI: a glass pavilion with a solid core and floor plates seen through the glass. */
function Pavilion({ w, h, body, shared, pick }: FormProps & { shared: SharedMaterials }) {
  const floors = Math.min(10, Math.max(1, Math.floor(h / (FLOOR * 2))));
  return (
    <>
      <RoundedBox args={[w * 0.46, h * 0.98, w * 0.46]} radius={0.04} smoothness={2} position-y={(h * 0.98) / 2} material={body} castShadow receiveShadow />
      {Array.from({ length: floors }, (_, i) => (
        <mesh key={i} position-y={((i + 1) * h) / (floors + 1)} material={shared.slab} receiveShadow>
          <boxGeometry args={[w * 0.9, 0.05, w * 0.9]} />
        </mesh>
      ))}
      <RoundedBox args={[w, h, w]} radius={0.05} smoothness={3} position-y={h / 2} material={shared.glass} renderOrder={2} {...pick} />
    </>
  );
}

/** Insight (dashboards): a low hall with a lit display on its roof. */
function Observatory({ w, h, body, shared, pick, accent }: FormProps & { shared: SharedMaterials; accent: string }) {
  const hb = Math.max(0.8, h - 0.5);
  return (
    <>
      <RoundedBox args={[w, hb, w]} radius={0.06} smoothness={3} position-y={hb / 2} material={body} castShadow receiveShadow {...pick} />
      <Cornice w={w} y={hb} material={shared.roof} />
      <group position-y={hb + 0.34} rotation={[-Math.PI / 3.2, Math.PI / 4, 0]}>
        <RoundedBox args={[w * 0.9, w * 0.5, 0.06]} radius={0.02} smoothness={2} material={shared.roof} castShadow />
        <mesh position-z={0.035} material={shared.screen(accent)}>
          <planeGeometry args={[w * 0.82, w * 0.42]} />
        </mesh>
      </group>
    </>
  );
}

/** Business process: a hall under a dome. */
function Dome({ w, h, body, shared, pick }: FormProps & { shared: SharedMaterials }) {
  const r = w * 0.45;
  const hb = Math.max(0.8, h - r);
  return (
    <>
      <RoundedBox args={[w, hb, w]} radius={0.06} smoothness={3} position-y={hb / 2} material={body} castShadow receiveShadow {...pick} />
      <mesh position-y={hb} material={body} castShadow {...pick}>
        <sphereGeometry args={[r, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh position-y={hb + 0.02} rotation-x={Math.PI / 2} material={shared.metal}>
        <torusGeometry args={[r + 0.02, 0.03, 8, 64]} />
      </mesh>
    </>
  );
}

/** Tests and docs: a low annex under a thin overhanging roof. */
function Annex({ w, h, body, shared, pick }: FormProps & { shared: SharedMaterials }) {
  return (
    <>
      <RoundedBox args={[w, h, w]} radius={0.05} smoothness={3} position-y={h / 2} material={body} castShadow receiveShadow {...pick} />
      <RoundedBox args={[w + 0.26, 0.08, w + 0.26]} radius={0.02} smoothness={2} position-y={h + 0.04} material={shared.roof} castShadow />
    </>
  );
}

function hashPath(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Rooftop plant: a few units, a tank or an antenna, chosen by the file path so a repo always looks the same. */
function RoofKit({ seed, w, y, shared }: { seed: number; w: number; y: number; shared: SharedMaterials }) {
  const r = (n: number) => ((seed >>> n) & 255) / 255;
  const kind = seed % 3;
  const inset = w * 0.28;
  return (
    <group position-y={y}>
      {kind !== 1 ? (
        <RoundedBox args={[w * 0.34, 0.26, w * 0.24]} radius={0.03} smoothness={2} position={[-inset * (r(3) > 0.5 ? 1 : -1) * 0.6, 0.13, inset * 0.5]} material={shared.roof} castShadow />
      ) : null}
      {kind !== 2 ? (
        <group position={[inset * 0.7, 0, -inset * 0.6]}>
          <mesh position-y={0.24} material={shared.metal} castShadow>
            <cylinderGeometry args={[w * 0.1, w * 0.1, 0.34, 20]} />
          </mesh>
          <mesh position-y={0.43} material={shared.roof}>
            <coneGeometry args={[w * 0.11, 0.08, 20]} />
          </mesh>
        </group>
      ) : null}
      {kind === 2 || r(9) > 0.6 ? (
        <mesh position={[-inset * 0.8, 0.45, -inset * 0.7]} material={shared.metal}>
          <cylinderGeometry args={[0.018, 0.028, 0.9, 6]} />
        </mesh>
      ) : null}
      {r(14) > 0.45 ? (
        <RoundedBox args={[w * 0.18, 0.16, w * 0.18]} radius={0.02} smoothness={2} position={[inset * 0.2, 0.08, inset * 0.9]} material={shared.roof} castShadow />
      ) : null}
    </group>
  );
}

/** An entrance canopy over the glass lobby, on the street side. */
function Canopy({ w, shared }: { w: number; shared: SharedMaterials }) {
  return <RoundedBox args={[w * 0.46, 0.05, 0.36]} radius={0.015} smoothness={2} position={[0, 0.62, w / 2 + 0.16]} material={shared.roof} castShadow />;
}

/** A thin roof edge that finishes a flat roof. */
function Cornice({ w, y, material }: { w: number; y: number; material: THREE.Material }) {
  return <RoundedBox args={[w + 0.1, 0.1, w + 0.1]} radius={0.03} smoothness={2} position-y={y + 0.05} material={material} castShadow />;
}

/* ─── Marks ──────────────────────────────────────────────────────────────── */

/** The layer, drawn as a hairline around the footprint. */
function LayerOutline({ w, round, material }: { w: number; round: boolean; material: THREE.Material }) {
  const half = w / 2 + 0.2;
  if (round) {
    return (
      <mesh rotation-x={-Math.PI / 2} position-y={0.015} material={material}>
        <ringGeometry args={[half, half + 0.07, 72]} />
      </mesh>
    );
  }
  // A square ring: four segments, rotated so its sides run along the axes.
  const outer = (half + 0.07) * Math.SQRT2;
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.015} material={material}>
      <ringGeometry args={[half * Math.SQRT2, outer, 4, 1, Math.PI / 4]} />
    </mesh>
  );
}

/** High criticality: an acid light on a short mast. */
function Beacon({ y, shared }: { y: number; shared: SharedMaterials }) {
  return (
    <group position-y={y}>
      <mesh position-y={0.22} material={shared.metal}>
        <cylinderGeometry args={[0.025, 0.035, 0.44, 6]} />
      </mesh>
      <mesh position-y={0.5} material={shared.beacon}>
        <sphereGeometry args={[0.11, 16, 12]} />
      </mesh>
    </group>
  );
}
