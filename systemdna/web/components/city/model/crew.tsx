"use client";

// The Bob crew: three agents at an operations deck in front of the model.
// Characters, desks, chairs and monitors are ported from the Agent Atlas studio
// (Office.jsx), re-materialled for the charcoal studio. They appear in the Fix chapter.

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html, RoundedBox } from "@react-three/drei";

const INK = {
  deck: "#151612",
  desk: "#26281f",
  deskEdge: "#D8F53F",
  leg: "#30332a",
  monitor: "#1a1b17",
  screen: "#0e100c",
  metal: "#6f7268",
  trouser: "#2f322b",
  shoe: "#e9e6dc",
};

export interface CrewMember {
  id: "mira" | "leo" | "nova";
  name: string;
  permit: string;
  color: string;
  skin: string;
  hair: string;
}

export const CREW: CrewMember[] = [
  { id: "mira", name: "Bob 01", permit: "pipelines", color: "#D8F53F", skin: "#e8b995", hair: "#3b2a22" },
  { id: "leo", name: "Bob 02", permit: "backend + api", color: "#7AA2FF", skin: "#c98d67", hair: "#1e1a17" },
  { id: "nova", name: "Bob 03", permit: "frontend", color: "#FF9F6B", skin: "#8d5b3e", hair: "#15110f" },
];

function Mat({ color, roughness = 0.6, metalness = 0 }: { color: string; roughness?: number; metalness?: number }) {
  return <meshPhysicalMaterial color={color} roughness={roughness} metalness={metalness} clearcoat={0.25} clearcoatRoughness={0.5} />;
}

function Box({
  size,
  position = [0, 0, 0],
  color,
  radius = 0.04,
  rotation,
  roughness,
  metalness,
}: {
  size: [number, number, number];
  position?: [number, number, number];
  color: string;
  radius?: number;
  rotation?: [number, number, number];
  roughness?: number;
  metalness?: number;
}) {
  return (
    <RoundedBox args={size} radius={Math.min(radius, ...size.map((n) => n / 2))} smoothness={3} position={position} rotation={rotation} castShadow receiveShadow>
      <Mat color={color} roughness={roughness} metalness={metalness} />
    </RoundedBox>
  );
}

function Ball({ position = [0, 0, 0], size, color }: { position?: [number, number, number]; size: [number, number, number]; color: string }) {
  return (
    <mesh position={position} scale={size} castShadow>
      <sphereGeometry args={[1, 20, 14]} />
      <meshPhysicalMaterial color={color} roughness={0.55} clearcoat={0.3} />
    </mesh>
  );
}

function Cylinder({
  position,
  radius = 0.1,
  top = radius,
  height = 1,
  color,
  rotation,
}: {
  position: [number, number, number];
  radius?: number;
  top?: number;
  height?: number;
  color: string;
  rotation?: [number, number, number];
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <cylinderGeometry args={[top, radius, height, 24]} />
      <meshPhysicalMaterial color={color} roughness={0.5} clearcoat={0.2} />
    </mesh>
  );
}

function Limb({ from, to, radius = 0.06, color }: { from: [number, number, number]; to: [number, number, number]; radius?: number; color: string }) {
  const key = [...from, ...to].join(",");
  const { length, position, rotation } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    return {
      length: a.distanceTo(b),
      position: a.clone().add(b).multiplyScalar(0.5),
      rotation: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <mesh position={position} quaternion={rotation} castShadow>
      <capsuleGeometry args={[radius, Math.max(0.001, length - radius * 2), 4, 12]} />
      <meshPhysicalMaterial color={color} roughness={0.7} />
    </mesh>
  );
}

function Chair({ color }: { color: string }) {
  return (
    <group position={[0, 0, 0.78]}>
      <Cylinder position={[0, 0.36, 0]} height={0.65} radius={0.055} color={INK.leg} />
      {Array.from({ length: 5 }, (_, i) => (
        <group key={i} rotation={[0, (i * Math.PI * 2) / 5, 0]}>
          <Box position={[0, 0.08, 0.15]} size={[0.055, 0.05, 0.42]} color={INK.leg} radius={0.025} />
        </group>
      ))}
      <Box position={[0, 0.72, 0]} size={[0.66, 0.12, 0.62]} color={color} radius={0.055} roughness={0.8} />
      <Box position={[0, 1.08, 0.27]} size={[0.62, 0.66, 0.12]} color={INK.desk} radius={0.06} rotation={[-0.1, 0, 0]} />
    </group>
  );
}

function Character({ agent, working, animate }: { agent: CrewMember; working: boolean; animate: boolean }) {
  const head = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const phase = agent.id === "mira" ? 0 : agent.id === "leo" ? 2 : 4;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!head.current || !body.current || !leftArm.current || !rightArm.current) return;
    head.current.rotation.y = animate ? Math.sin(t * 0.7 + phase) * (working ? 0.07 : 0.17) : 0;
    head.current.rotation.x = working ? 0.08 : -0.03;
    body.current.position.y = animate ? Math.sin(t * 1.7 + phase) * 0.012 : 0;
    leftArm.current.rotation.x = working && animate ? Math.sin(t * 10 + phase) * 0.1 : 0;
    rightArm.current.rotation.x = working && animate ? Math.sin(t * 11 + 2 + phase) * 0.1 : 0;
  });
  return (
    <group ref={body}>
      <Box position={[0, 0.83, 0.66]} size={[0.42, 0.25, 0.34]} color={INK.trouser} radius={0.09} />
      <mesh position={[0, 1.15, 0.69]} castShadow>
        <capsuleGeometry args={[0.255, 0.27, 6, 18]} />
        <meshPhysicalMaterial color={agent.color} roughness={0.7} sheen={0.6} sheenColor={new THREE.Color("#fff4dd")} />
      </mesh>
      <Cylinder position={[0, 1.48, 0.66]} height={0.15} radius={0.09} color={agent.skin} />
      <group ref={head} position={[0, 1.68, 0.64]}>
        <Ball size={[0.235, 0.27, 0.225]} color={agent.skin} />
        <Ball position={[0, 0.13, 0.035]} size={[0.24, 0.19, 0.22]} color={agent.hair} />
        <Ball position={[-0.17, 0.04, 0]} size={[0.09, 0.17, 0.15]} color={agent.hair} />
        {agent.id === "mira" ? <Ball position={[0, 0.18, 0.22]} size={[0.18, 0.18, 0.17]} color={agent.hair} /> : null}
        {agent.id === "nova"
          ? Array.from({ length: 7 }, (_, i) => (
              <Ball key={i} position={[Math.sin(i * 1.6) * 0.15, 0.17 + (i % 2) * 0.025, Math.cos(i * 1.6) * 0.13]} size={[0.12, 0.13, 0.12]} color={agent.hair} />
            ))
          : null}
        {[-1, 1].map((s) => (
          <group key={s}>
            <Ball position={[s * 0.23, -0.01, 0]} size={[0.042, 0.065, 0.05]} color={agent.skin} />
            <Ball position={[s * 0.087, 0.013, -0.211]} size={[0.019, 0.027, 0.012]} color="#1d1a17" />
            {agent.id === "leo" ? (
              <mesh position={[s * 0.092, 0.008, -0.229]}>
                <torusGeometry args={[0.066, 0.009, 5, 18]} />
                <meshStandardMaterial color="#1d1f1a" />
              </mesh>
            ) : null}
          </group>
        ))}
        <Ball position={[0, -0.035, -0.218]} size={[0.043, 0.045, 0.055]} color={agent.skin} />
      </group>
      {[-1, 1].map((s) => (
        <group key={s}>
          <Limb from={[s * 0.13, 0.78, 0.61]} to={[s * 0.16, 0.68, 0.17]} radius={0.1} color={INK.trouser} />
          <Limb from={[s * 0.16, 0.68, 0.17]} to={[s * 0.16, 0.18, 0.13]} radius={0.075} color={INK.trouser} />
          <Box position={[s * 0.16, 0.12, 0.04]} size={[0.18, 0.13, 0.34]} radius={0.06} color={INK.shoe} />
          <group ref={s === -1 ? leftArm : rightArm} position={[s * 0.24, 1.33, 0.66]}>
            <Limb from={[0, 0, 0]} to={[s * 0.07, -0.23, -0.13]} radius={0.1} color={agent.color} />
            <Limb from={[s * 0.07, -0.23, -0.13]} to={[-s * 0.05, -0.12, -0.47]} radius={0.058} color={agent.skin} />
            <Ball position={[-s * 0.05, -0.12, -0.48]} size={[0.068, 0.037, 0.09]} color={agent.skin} />
          </group>
        </group>
      ))}
    </group>
  );
}

/** A monitor showing the agent's diff: code lines, the changed one in the agent's colour. */
function Monitor({ color, working, animate }: { color: string; working: boolean; animate: boolean }) {
  const lines = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!lines.current || !animate || !working) return;
    // Lines scroll up as the agent types.
    const t = (clock.elapsedTime * 0.25) % 1;
    lines.current.position.y = t * 0.087;
  });
  return (
    <group position={[0, 1.2, -0.32]}>
      <Box size={[0.4, 0.025, 0.24]} color={INK.metal} radius={0.01} metalness={0.8} roughness={0.3} />
      <Box position={[0, 0.2, -0.03]} size={[0.065, 0.36, 0.065]} color={INK.metal} metalness={0.8} roughness={0.3} />
      <Box position={[0, 0.45, -0.035]} size={[0.91, 0.58, 0.055]} color={INK.monitor} radius={0.035} />
      <mesh position={[0, 0.45, 0]}>
        <planeGeometry args={[0.82, 0.48]} />
        <meshBasicMaterial color={INK.screen} />
      </mesh>
      <group ref={lines}>
        {Array.from({ length: 5 }, (_, i) => (
          <mesh key={i} position={[-0.06 - (i % 2) * 0.05, 0.62 - i * 0.087, 0.004]}>
            <planeGeometry args={[i % 2 ? 0.44 : 0.6, 0.03]} />
            <meshBasicMaterial color={i === 2 && working ? new THREE.Color(color).multiplyScalar(1.6) : "#4a4d44"} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Desk({ agent, working, animate, showTag }: { agent: CrewMember; working: boolean; animate: boolean; showTag: boolean }) {
  return (
    <group>
      <Box position={[0, 1.12, -0.03]} size={[2.18, 0.13, 1.08]} color={INK.desk} radius={0.06} roughness={0.35} />
      <mesh position={[0, 1.06, 0.5]}>
        <boxGeometry args={[2.18, 0.02, 0.02]} />
        <meshBasicMaterial color={new THREE.Color(INK.deskEdge).multiplyScalar(1.3)} toneMapped={false} />
      </mesh>
      {[-0.88, 0.88].map((x) => (
        <Box key={x} position={[x, 0.57, -0.05]} size={[0.08, 1.05, 0.78]} color={INK.leg} radius={0.025} />
      ))}
      <Monitor color={agent.color} working={working} animate={animate} />
      <Box position={[0, 1.208, 0.23]} size={[0.56, 0.033, 0.19]} color="#2d3028" radius={0.016} />
      <Chair color={agent.color} />
      <Character agent={agent} working={working} animate={animate} />
      {showTag ? (
        <Html position={[0, 2.35, 0.3]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <div className="model-tag model-tag--crew">
            <span className="model-tag-name">{agent.name}</span>
            <span className="model-tag-meta">permit · {agent.permit}</span>
          </div>
        </Html>
      ) : null}
    </group>
  );
}

/**
 * The operations deck. `active` raises the crew into view; `working` starts typing.
 * Placed by the caller in front of the plinth, agents facing the model.
 */
export function Crew({ active, working, reduceMotion }: { active: boolean; working: boolean; reduceMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const target = active ? 1 : 0;
    const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 4);
    const s = THREE.MathUtils.lerp(g.scale.x, target, k);
    g.scale.setScalar(Math.max(0.0001, s));
    g.visible = s > 0.01;
  });
  return (
    <group ref={group} scale={0.0001}>
      <RoundedBox args={[10.4, 0.3, 3.6]} radius={0.12} smoothness={3} position={[0, -0.15, 0.35]} receiveShadow>
        <meshPhysicalMaterial color={INK.deck} roughness={0.5} metalness={0.4} clearcoat={0.4} />
      </RoundedBox>
      <mesh position={[0, 0.005, 2.12]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[10.2, 0.03]} />
        <meshBasicMaterial color={new THREE.Color(INK.deskEdge).multiplyScalar(1.2)} toneMapped={false} />
      </mesh>
      {CREW.map((a, i) => (
        <group key={a.id} position={[(i - 1) * 3.3, 0, 0]}>
          <Desk agent={a} working={working} animate={!reduceMotion} showTag={active} />
        </group>
      ))}
    </group>
  );
}
