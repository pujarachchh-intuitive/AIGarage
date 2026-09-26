"use client";

import { metrics } from "./metrics";

export function ProofSection() {
  return (
    <section
      id="proof"
      className="py-24 px-6"
      style={{ background: "#07090f" }}
    >
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <span
            className="text-xs font-semibold tracking-widest uppercase mb-4 block"
            style={{ color: "#22e39a", fontFamily: "'JetBrains Mono', monospace" }}
          >
            Proof
          </span>
          <h2
            className="text-4xl sm:text-5xl font-bold mb-4"
            style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}
          >
            Numbers, not claims.
          </h2>
          <p className="text-base leading-relaxed max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.6)" }}>
            Every metric is a <strong style={{ color: "#ffb020" }}>Target</strong> — values are measured live during the demo.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-2xl p-6 border flex flex-col gap-2"
              style={{
                background: "rgba(15,20,35,0.55)",
                borderColor: "rgba(255,255,255,0.08)",
                backdropFilter: "blur(10px)",
              }}
              aria-label={`${metric.label}: Target — ${metric.value === null ? "Measured live in the demo" : String(metric.value) + (metric.unit ?? "")}`}
            >
              {/* Target badge */}
              <span
                className="text-xs font-semibold uppercase tracking-widest self-start px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(255,176,32,0.12)",
                  color: "#ffb020",
                  border: "1px solid rgba(255,176,32,0.25)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                Target
              </span>

              {/* Value */}
              <div className="flex items-baseline gap-1 mt-1">
                {metric.value === null ? (
                  <span
                    className="text-sm italic"
                    style={{ color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    Measured live in the demo
                  </span>
                ) : (
                  <>
                    <span
                      className="text-4xl font-bold"
                      style={{
                        fontFamily: "'Space Grotesk', sans-serif",
                        color: "#fff",
                      }}
                    >
                      {metric.value}
                    </span>
                    {metric.unit && (
                      <span className="text-lg font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>
                        {metric.unit}
                      </span>
                    )}
                  </>
                )}
              </div>

              {/* Label */}
              <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.8)" }}>
                {metric.label}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
                {metric.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
