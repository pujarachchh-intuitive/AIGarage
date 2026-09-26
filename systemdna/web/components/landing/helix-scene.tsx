"use client";

// A slowly turning double helix built from the sample repo's real node types.
// Each bead is a node (coloured by its type, in the same share as the real graph);
// each rung is a link, with small lights running across it.
// Scrolling past the section speeds the spin up for a moment.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { typeColor } from "@/components/landing/palette";

interface Props {
  nodeTypes: { type: string; count: number }[];
  className?: string;
}

const PAIRS = 72;

export function HelixScene({ nodeTypes, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const width = () => Math.max(1, host.clientWidth);
    const height = () => Math.max(1, host.clientHeight);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(width(), height());
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, width() / height(), 0.1, 200);
    camera.position.set(0, 0, 34);

    scene.add(new THREE.HemisphereLight("#ffffff", "#1a1a22", 1.6));
    const key = new THREE.DirectionalLight("#ffffff", 1.4);
    key.position.set(6, 10, 12);
    scene.add(key);

    // Spread the real node types over the beads in their real proportions.
    const total = nodeTypes.reduce((n, t) => n + t.count, 0) || 1;
    const bag: string[] = [];
    for (const t of nodeTypes) for (let i = 0; i < Math.max(1, Math.round((t.count / total) * PAIRS * 2)); i++) bag.push(t.type);
    // Deterministic shuffle so types are mixed along the strands.
    let seed = 11;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }

    const group = new THREE.Group();
    group.rotation.z = -0.42;
    scene.add(group);

    const radius = 3.2;
    const rise = 0.5;
    const turn = 0.32;
    const beads = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.26, 2),
      new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.2, emissive: "#ffffff", emissiveIntensity: 0.08 }),
      PAIRS * 2,
    );
    const m = new THREE.Matrix4();
    const ends: [THREE.Vector3, THREE.Vector3][] = [];
    for (let i = 0; i < PAIRS; i++) {
      const a = i * turn;
      const y = (i - PAIRS / 2) * rise;
      const p1 = new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius);
      const p2 = new THREE.Vector3(Math.cos(a + Math.PI) * radius, y, Math.sin(a + Math.PI) * radius);
      ends.push([p1, p2]);
      const s1 = 0.8 + rand() * 0.5;
      const s2 = 0.8 + rand() * 0.5;
      m.makeScale(s1, s1, s1).setPosition(p1);
      beads.setMatrixAt(i * 2, m);
      m.makeScale(s2, s2, s2).setPosition(p2);
      beads.setMatrixAt(i * 2 + 1, m);
      beads.setColorAt(i * 2, new THREE.Color(typeColor(bag[(i * 2) % bag.length])));
      beads.setColorAt(i * 2 + 1, new THREE.Color(typeColor(bag[(i * 2 + 1) % bag.length])));
    }
    group.add(beads);

    // Backbones: smooth tubes through each strand.
    const strandMat = new THREE.MeshStandardMaterial({ color: "#3f3f46", roughness: 0.6, transparent: true, opacity: 0.55 });
    for (const side of [0, 1] as const) {
      const curve = new THREE.CatmullRomCurve3(ends.map((e) => e[side]));
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, PAIRS * 4, 0.06, 6, false), strandMat));
    }

    // Rungs (links) with a light running across some of them.
    const rungPos = new Float32Array(PAIRS * 6);
    ends.forEach(([a, b], i) => rungPos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6));
    const rungGeo = new THREE.BufferGeometry();
    rungGeo.setAttribute("position", new THREE.BufferAttribute(rungPos, 3));
    group.add(new THREE.LineSegments(rungGeo, new THREE.LineBasicMaterial({ color: "#71717a", transparent: true, opacity: 0.45 })));

    const sparks = ends.filter((_, i) => i % 3 === 0).map((e, i) => ({ e, t: (i * 0.29) % 1, dir: i % 2 ? 1 : -1 }));
    const sparkMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffffff" }), sparks.length);
    group.add(sparkMesh);
    const v = new THREE.Vector3();

    let scrollBoost = 0;
    let lastScroll = window.scrollY;
    const onScroll = () => {
      scrollBoost = Math.min(3, scrollBoost + Math.abs(window.scrollY - lastScroll) * 0.004);
      lastScroll = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const draw = (dt: number) => {
      scrollBoost *= Math.exp(-dt * 2);
      group.rotation.y += dt * (0.22 + scrollBoost);
      sparks.forEach((s, i) => {
        s.t = (s.t + dt * 0.5) % 1;
        const u = s.dir > 0 ? s.t : 1 - s.t;
        v.copy(s.e[0]).lerp(s.e[1], u);
        m.makeTranslation(v.x, v.y, v.z);
        sparkMesh.setMatrixAt(i, m);
      });
      sparkMesh.instanceMatrix.needsUpdate = true;
      renderer.render(scene, camera);
    };

    const resize = () => {
      camera.aspect = width() / height();
      // Keep the helix a similar size on narrow screens.
      camera.position.z = 34 * Math.max(1, 0.9 / camera.aspect);
      camera.updateProjectionMatrix();
      renderer.setSize(width(), height());
      if (!running) draw(0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);

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
    let inView = false;
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      if (inView && !document.hidden) start();
      else stop();
    });
    io.observe(host);
    const onVisibility = () => (document.hidden || !inView ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    draw(0);

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("scroll", onScroll);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [nodeTypes]);

  return <div ref={hostRef} className={className} aria-hidden="true" />;
}
