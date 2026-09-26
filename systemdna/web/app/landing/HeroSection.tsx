"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";

/** Detect WebGL support once. */
function hasWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(
      c.getContext("webgl2") ||
      c.getContext("webgl") ||
      c.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

/** A single glowing node in the DNA helix. */
interface NodeDot {
  x: number;
  y: number;
  color: string;
  alpha: number;
  radius: number;
}

const LAYER_COLORS = [
  "#38bdf8", // cyan  – database
  "#a78bfa", // violet – pipelines
  "#22e39a", // green  – backend
  "#ffb020", // amber  – API
  "#f472b6", // pink   – frontend
  "#ff3b5c", // red    – dashboards
  "#38bdf8", // cyan   – business
];

/** Canvas-based DNA helix (no external deps, respects reduceMotion). */
function HelixCanvas({ reduceMotion }: { reduceMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shockRef = useRef<{ progress: number; active: boolean }>({ progress: 0, active: false });
  const frameRef = useRef(0);
  const scrollRef = useRef(0);

  // Track scroll for morph
  useEffect(() => {
    if (reduceMotion) return;
    const onScroll = () => {
      scrollRef.current = Math.min(1, window.scrollY / (window.innerHeight * 0.8));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [reduceMotion]);

  // Click → shockwave
  const handleClick = () => {
    if (reduceMotion) return;
    shockRef.current = { progress: 0, active: true };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let t = 0;
    const PAIRS = 18;
    const BASE_SPREAD = 110;

    const resize = () => {
      canvas.width = canvas.offsetWidth * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const scroll = scrollRef.current;
      const cx = w / 2;
      const cy = h / 2;
      const dpr = devicePixelRatio;

      const shock = shockRef.current;
      if (shock.active) shock.progress = Math.min(1, shock.progress + 0.018);

      const nodes: NodeDot[] = [];

      for (let i = 0; i < PAIRS; i++) {
        const frac = i / (PAIRS - 1);
        // Y position along helix
        const baseY = (frac - 0.5) * h * 0.78;

        // scroll morph: nodes fly outward → neural net → skyline
        const spread = reduceMotion ? 0 : scroll * BASE_SPREAD * dpr;
        const morphY = reduceMotion ? baseY : baseY + scroll * (cy * 0.3 - baseY) * 0.4;

        const angle = frac * Math.PI * 4 + (reduceMotion ? 0 : t);
        const rx = Math.cos(angle) * (BASE_SPREAD * dpr - spread) + (scroll > 0.5 ? Math.cos(frac * Math.PI * 2) * spread * 0.6 : 0);
        const lx = Math.cos(angle + Math.PI) * (BASE_SPREAD * dpr - spread) - (scroll > 0.5 ? Math.cos(frac * Math.PI * 2) * spread * 0.6 : 0);
        const ry = Math.sin(angle) * 18 * dpr + morphY;
        const ly = Math.sin(angle + Math.PI) * 18 * dpr + morphY;

        const color = LAYER_COLORS[i % LAYER_COLORS.length];

        // shockwave dims colour: red → amber → grey
        let nodeColor = color;
        if (shock.active) {
          const dist = Math.abs(frac - shock.progress);
          if (dist < 0.1) nodeColor = "#ff3b5c";
          else if (dist < 0.2) nodeColor = "#ffb020";
          else if (shock.progress > frac) nodeColor = "#444860";
        }

        nodes.push({ x: cx + rx, y: cy + ry, color: nodeColor, alpha: 0.9, radius: 5 * dpr });
        nodes.push({ x: cx + lx, y: cy + ly, color: nodeColor, alpha: 0.9, radius: 5 * dpr });

        // Strand between the two nodes
        ctx.beginPath();
        ctx.moveTo(cx + rx, cy + ry);
        ctx.lineTo(cx + lx, cy + ly);
        ctx.strokeStyle = `${nodeColor}44`;
        ctx.lineWidth = 1.2 * dpr;
        ctx.stroke();

        // Backbone lines
        if (i > 0) {
          const prev = nodes[nodes.length - 4];
          const prevR = nodes[nodes.length - 4];
          const prevL = nodes[nodes.length - 3];
          if (prev) {
            ctx.beginPath();
            ctx.moveTo(prevR.x, prevR.y);
            ctx.lineTo(cx + rx, cy + ry);
            ctx.strokeStyle = `${nodeColor}66`;
            ctx.lineWidth = 1.5 * dpr;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(prevL.x, prevL.y);
            ctx.lineTo(cx + lx, cy + ly);
            ctx.strokeStyle = `${nodeColor}66`;
            ctx.lineWidth = 1.5 * dpr;
            ctx.stroke();
          }
        }
      }

      // Draw nodes on top
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.globalAlpha = n.alpha;
        // Glow
        ctx.shadowColor = n.color;
        ctx.shadowBlur = 12 * dpr;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      if (!reduceMotion) t += 0.008;
      if (shock.active && shock.progress >= 1) shock.active = false;

      frameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
    };
  }, [reduceMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full cursor-crosshair"
      onClick={handleClick}
      aria-label="Interactive DNA helix visualisation. Click to send a ripple."
      role="img"
    />
  );
}

/** Static gradient fallback when WebGL (or canvas) is unavailable. */
function StaticHero() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(56,189,248,0.18) 0%, rgba(167,139,250,0.12) 40%, transparent 70%)",
      }}
      aria-hidden="true"
    />
  );
}

// Probing WebGL creates a context, so do it once per page load.
let webglSupport: boolean | undefined;
const webglSnapshot = () => (webglSupport ??= hasWebGL());
const noSubscribe = () => () => {};

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const subscribeReducedMotion = (onChange: () => void) => {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const reducedMotionSnapshot = () => window.matchMedia(REDUCED_MOTION).matches;

export function HeroSection() {
  // Server render has no WebGL info: null keeps the background empty until the client knows.
  const webgl = useSyncExternalStore<boolean | null>(noSubscribe, webglSnapshot, () => null);
  const reduceMotion = useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => false);

  return (
    <section
      id="hero"
      className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden"
      style={{ background: "#05070d" }}
    >
      {/* Background canvas / fallback */}
      {webgl === null ? null : webgl ? (
        <HelixCanvas reduceMotion={reduceMotion} />
      ) : (
        <StaticHero />
      )}

      {/* Radial vignette overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 50%, transparent 30%, #05070d 100%)",
        }}
        aria-hidden="true"
      />

      {/* Text overlay */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-3xl mx-auto gap-6">
        <span
          className="text-xs font-semibold tracking-widest uppercase px-3 py-1 rounded-full border"
          style={{
            color: "#38bdf8",
            borderColor: "rgba(56,189,248,0.35)",
            background: "rgba(56,189,248,0.08)",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          Built with IBM Bob 2.0
        </span>

        <h1
          className="text-5xl sm:text-6xl md:text-7xl font-bold leading-tight tracking-tight"
          style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}
        >
          System<span style={{ color: "#38bdf8" }}>DNA</span>
        </h1>

        <p
          className="text-xl sm:text-2xl font-semibold"
          style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#a78bfa" }}
        >
          Find References for your whole system, and fix them all.
        </p>

        <p className="text-base sm:text-lg leading-relaxed max-w-2xl" style={{ color: "rgba(255,255,255,0.72)" }}>
          SystemDNA shows what a code change will break across a whole system, then has a governed
          crew of IBM Bob agents fix every affected part and prove the change is complete.
        </p>

        <div className="flex flex-wrap gap-4 justify-center mt-2">
          <Link
            href="/city"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            style={{
              background: "linear-gradient(135deg, #38bdf8 0%, #a78bfa 100%)",
              color: "#05070d",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            Enter Agent City
          </Link>
          <Link
            href="/city?mode=replay"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            style={{
              borderColor: "rgba(167,139,250,0.5)",
              color: "#a78bfa",
              background: "rgba(167,139,250,0.08)",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            Watch the replay
          </Link>
        </div>
      </div>

      {/* Scroll hint */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none"
        aria-hidden="true"
      >
        <span className="text-xs tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>
          scroll
        </span>
        <div className="w-px h-8" style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.3), transparent)" }} />
      </div>
    </section>
  );
}
