"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

const LAYER_COLORS: Record<string, string> = {
  db: "#38bdf8",
  pipe: "#a78bfa",
  be: "#22e39a",
  api: "#ffb020",
  fe: "#f472b6",
  dash: "#ff3b5c",
  biz: "#38bdf8",
};

/** A lightweight canvas mini-city that ripples green, no external deps. */
function MiniCityCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const DPR = Math.min(devicePixelRatio, 2);
    const resize = () => {
      canvas.width = canvas.offsetWidth * DPR;
      canvas.height = canvas.offsetHeight * DPR;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Static building layout
    const BUILDINGS = [
      { x: 0.12, y: 0.55, w: 0.07, h: 0.28, layer: "db" },
      { x: 0.22, y: 0.48, w: 0.06, h: 0.38, layer: "pipe" },
      { x: 0.31, y: 0.52, w: 0.08, h: 0.32, layer: "be" },
      { x: 0.42, y: 0.42, w: 0.07, h: 0.44, layer: "api" },
      { x: 0.53, y: 0.50, w: 0.09, h: 0.35, layer: "fe" },
      { x: 0.65, y: 0.55, w: 0.07, h: 0.28, layer: "dash" },
      { x: 0.75, y: 0.46, w: 0.06, h: 0.40, layer: "biz" },
      { x: 0.84, y: 0.52, w: 0.08, h: 0.34, layer: "db" },
    ];

    let t = 0;
    // Ripple: each building turns green in sequence
    const RIPPLE_PERIOD = 240; // frames for one full cycle

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // Ground
      ctx.fillStyle = "rgba(7,9,15,0.95)";
      ctx.fillRect(0, 0, W, H);

      // Grid dots
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      for (let gx = 0; gx < W; gx += 20 * DPR)
        for (let gy = 0; gy < H; gy += 20 * DPR) {
          ctx.beginPath();
          ctx.arc(gx, gy, DPR, 0, Math.PI * 2);
          ctx.fill();
        }

      const rippleIdx = (t / RIPPLE_PERIOD) * BUILDINGS.length;

      for (let i = 0; i < BUILDINGS.length; i++) {
        const b = BUILDINGS[i];
        const bx = b.x * W;
        const by = b.y * H;
        const bw = b.w * W;
        const bh = b.h * H;
        const baseColor = LAYER_COLORS[b.layer];

        const dist = rippleIdx - i;
        // Green ripple window
        const green = dist >= 0 && dist < 1.5;
        const done = dist >= 1.5;

        const fillColor = done
          ? "#22e39a"
          : green
          ? `rgba(34,227,154,${0.6 + 0.4 * Math.sin(dist * Math.PI)})`
          : baseColor;

        // Shadow / glow
        ctx.shadowColor = done ? "#22e39a" : green ? "#22e39a" : baseColor;
        ctx.shadowBlur = (done || green ? 14 : 8) * DPR;

        ctx.fillStyle = fillColor;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(bx, by, bw, bh);
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        // Edge lines
        ctx.strokeStyle = done ? "rgba(34,227,154,0.6)" : `${baseColor}55`;
        ctx.lineWidth = DPR;
        ctx.strokeRect(bx, by, bw, bh);

        // Ripple ring expanding outward
        if (green) {
          const ring = dist * 30 * DPR;
          ctx.beginPath();
          ctx.arc(bx + bw / 2, by + bh / 2, ring, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(34,227,154,0.4)";
          ctx.lineWidth = 1.5 * DPR;
          ctx.stroke();
        }
      }

      t = (t + 1) % RIPPLE_PERIOD;
      frameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-xl"
      style={{ height: 220 }}
      aria-label="Animated Agent City preview showing buildings lighting up green as agents complete their fixes"
      role="img"
    />
  );
}

const LEGEND = [
  { color: "#38bdf8", label: "Database" },
  { color: "#a78bfa", label: "Pipelines" },
  { color: "#22e39a", label: "Backend" },
  { color: "#ffb020", label: "API" },
  { color: "#f472b6", label: "Frontend" },
  { color: "#ff3b5c", label: "Dashboards" },
];

const AGENT_STATES = [
  { color: "#ffb020", dot: "●", label: "Fixing" },
  { color: "#22e39a", dot: "●", label: "Done" },
  { color: "#ff3b5c", dot: "✕", label: "Blocked" },
  { color: "rgba(255,255,255,0.3)", dot: "○", label: "Waiting" },
];

export function AgentCityPreviewSection() {
  return (
    <section
      id="city-preview"
      className="py-24 px-6"
      style={{ background: "#05070d" }}
    >
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <span
            className="text-xs font-semibold tracking-widest uppercase mb-4 block"
            style={{ color: "#22e39a", fontFamily: "'JetBrains Mono', monospace" }}
          >
            Agent City
          </span>
          <h2
            className="text-4xl sm:text-5xl font-bold mb-4"
            style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}
          >
            Watch the swarm work.
          </h2>
          <p className="text-base leading-relaxed max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.6)" }}>
            Every building is a component. Every agent is visible. The ripple spreads in dependency order — and stops when all buildings turn green.
          </p>
        </div>

        {/* Mini city canvas */}
        <div
          className="rounded-2xl p-4 border mb-6"
          style={{
            background: "rgba(15,20,35,0.55)",
            borderColor: "rgba(34,227,154,0.2)",
            backdropFilter: "blur(10px)",
          }}
        >
          <MiniCityCanvas />
        </div>

        {/* Legends */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div
            className="rounded-xl p-4 border"
            style={{ background: "rgba(15,20,35,0.45)", borderColor: "rgba(255,255,255,0.08)" }}
          >
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: "rgba(255,255,255,0.4)", fontFamily: "'JetBrains Mono', monospace" }}
            >
              Building layers
            </p>
            <div className="grid grid-cols-2 gap-2">
              {LEGEND.map((l) => (
                <div key={l.label} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ background: l.color }}
                    aria-hidden="true"
                  />
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                    {l.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            className="rounded-xl p-4 border"
            style={{ background: "rgba(15,20,35,0.45)", borderColor: "rgba(255,255,255,0.08)" }}
          >
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: "rgba(255,255,255,0.4)", fontFamily: "'JetBrains Mono', monospace" }}
            >
              Agent states
            </p>
            <div className="flex flex-col gap-2">
              {AGENT_STATES.map((s) => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className="w-4 text-center text-xs font-bold" style={{ color: s.color }} aria-hidden="true">
                    {s.dot}
                  </span>
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-center mt-8 gap-4">
          <Link
            href="/city"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
            style={{
              borderColor: "rgba(34,227,154,0.4)",
              color: "#22e39a",
              background: "rgba(34,227,154,0.08)",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            Enter the live city →
          </Link>
        </div>
      </div>
    </section>
  );
}
