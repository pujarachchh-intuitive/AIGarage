"use client";

import { useEffect, useRef } from "react";

const LAWS = [
  {
    name: "Permit law",
    color: "#38bdf8",
    description: "Each agent may only edit the files listed on its permit.",
  },
  {
    name: "One builder per building",
    color: "#a78bfa",
    description: "No two agents may edit the same file simultaneously.",
  },
  {
    name: "Traffic lights",
    color: "#ffb020",
    description: "A wave starts only when the wave above it is green.",
  },
  {
    name: "Budget law",
    color: "#22e39a",
    description: "Bobcoin cap per agent and per change; no runaway spending.",
  },
  {
    name: "Two-strike law",
    color: "#ff3b5c",
    description: "Two blocked actions → automatic quarantine and rollback.",
  },
  {
    name: "Completeness law",
    color: "#f472b6",
    description: "Done only when the re-scan shows 0 dangling references.",
  },
  {
    name: "Record law",
    color: "#ffb020",
    description: "Every action is logged to an immutable audit trail.",
  },
];

/** Animated canvas: a worker dot tries to cross a boundary, bounces off a red barrier. */
function PermitAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 320;
    const H = 100;
    canvas.width = W;
    canvas.height = H;

    const PERMIT_X = 200; // boundary x
    let workerX = 40;
    let dir = 1;
    let bouncing = false;
    let bounceT = 0;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // Background
      ctx.fillStyle = "rgba(15,20,35,0.8)";
      ctx.fillRect(0, 0, W, H);

      // Permit zone fill
      ctx.fillStyle = "rgba(56,189,248,0.05)";
      ctx.fillRect(0, 0, PERMIT_X, H);
      ctx.fillStyle = "rgba(255,59,92,0.07)";
      ctx.fillRect(PERMIT_X, 0, W - PERMIT_X, H);

      // Permit boundary line
      const barrierOpacity = bouncing ? 0.9 : 0.4;
      ctx.strokeStyle = `rgba(255,59,92,${barrierOpacity})`;
      ctx.lineWidth = bouncing ? 2.5 : 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(PERMIT_X, 8);
      ctx.lineTo(PERMIT_X, H - 8);
      ctx.stroke();
      ctx.setLineDash([]);

      // Barrier label
      ctx.fillStyle = `rgba(255,59,92,${barrierOpacity})`;
      ctx.font = "bold 10px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("PERMIT BOUNDARY", PERMIT_X, H - 12);
      ctx.textAlign = "left";

      // Worker dot
      ctx.beginPath();
      ctx.arc(workerX, H / 2, 9, 0, Math.PI * 2);
      ctx.fillStyle = bouncing ? "#ff3b5c" : "#38bdf8";
      ctx.shadowColor = bouncing ? "#ff3b5c" : "#38bdf8";
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Worker label
      ctx.fillStyle = "#fff";
      ctx.font = "bold 8px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("BOT", workerX, H / 2 + 3);
      ctx.textAlign = "left";

      // Bounce shockwave
      if (bouncing) {
        const ring = bounceT * 20;
        ctx.beginPath();
        ctx.arc(PERMIT_X, H / 2, ring, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,59,92,${1 - bounceT / 20})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        bounceT++;
        if (bounceT > 20) {
          bouncing = false;
          bounceT = 0;
        }
      }

      // Move worker
      if (!bouncing) {
        workerX += dir * 1.8;
        if (workerX >= PERMIT_X - 12) {
          dir = -1;
          bouncing = true;
          bounceT = 0;
          workerX = PERMIT_X - 12;
        } else if (workerX <= 30) {
          dir = 1;
        }
      }

      frameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-lg"
      style={{ maxWidth: 320, height: 100 }}
      aria-label="Animation: a worker agent tries to edit a file outside its permit and is blocked by a red barrier"
      role="img"
    />
  );
}

export function GovernanceSection() {
  return (
    <section
      id="governance"
      className="py-24 px-6"
      style={{ background: "#07090f" }}
    >
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <span
            className="text-xs font-semibold tracking-widest uppercase mb-4 block"
            style={{ color: "#ff3b5c", fontFamily: "'JetBrains Mono', monospace" }}
          >
            Governance
          </span>
          <h2
            className="text-4xl sm:text-5xl font-bold mb-4"
            style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}
          >
            City laws are enforced,{" "}
            <span style={{ color: "#38bdf8" }}>not just drawn.</span>
          </h2>
          <p className="text-base leading-relaxed max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.6)" }}>
            Bob lifecycle hooks block out-of-permit edits before they happen. Agents can&apos;t cheat the rules — the rules are the runtime.
          </p>
        </div>

        {/* Permit animation */}
        <div className="flex justify-center mb-12">
          <div
            className="rounded-2xl p-6 border"
            style={{
              background: "rgba(15,20,35,0.55)",
              borderColor: "rgba(255,59,92,0.2)",
              backdropFilter: "blur(10px)",
            }}
          >
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-4 text-center"
              style={{ color: "#ff3b5c", fontFamily: "'JetBrains Mono', monospace" }}
            >
              PreToolUse hook blocks edit outside permit
            </p>
            <PermitAnimation />
          </div>
        </div>

        {/* City law badges */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {LAWS.map((law) => (
            <div
              key={law.name}
              className="rounded-xl p-4 border flex items-start gap-3"
              style={{
                background: "rgba(15,20,35,0.55)",
                borderColor: `${law.color}33`,
                backdropFilter: "blur(8px)",
              }}
            >
              <div
                className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                style={{ background: law.color, boxShadow: `0 0 8px ${law.color}` }}
                aria-hidden="true"
              />
              <div>
                <p
                  className="font-semibold text-sm"
                  style={{ color: law.color, fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {law.name}
                </p>
                <p className="text-xs leading-relaxed mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>
                  {law.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
