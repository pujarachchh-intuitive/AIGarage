"use client";

import { useEffect, useRef, useState } from "react";

const STEPS = [
  {
    number: "01",
    title: "Map",
    color: "#38bdf8",
    description:
      "Scans a repo into a knowledge graph of every component across 7 layers — database, data pipelines, backend, API, frontend, dashboards, and business processes.",
    icon: "map",
  },
  {
    number: "02",
    title: "Predict",
    color: "#a78bfa",
    description:
      "Pick one change, see the ripple: what breaks, how badly, in what order, and which business process is hit. Impact computed in under a second.",
    icon: "predict",
  },
  {
    number: "03",
    title: "Fix",
    color: "#22e39a",
    description:
      "Parallel Bob agents fix every affected component in dependency order. Each agent may only edit the files on its permit.",
    icon: "fix",
  },
  {
    number: "04",
    title: "Govern & Observe",
    color: "#ffb020",
    description:
      "The Agent City shows every agent live. City rules are enforced by Bob lifecycle hooks — not just drawn on a diagram.",
    icon: "govern",
  },
  {
    number: "05",
    title: "Prove",
    color: "#f472b6",
    description:
      "A re-scan shows 0 dangling references, tests pass. Output: one PR, an impact report, and a full audit trail.",
    icon: "prove",
  },
];

/** Tiny animated SVG icons for each step. */
function StepIcon({ icon, color, active }: { icon: string; color: string; active: boolean }) {
  const opacity = active ? 1 : 0.4;
  const size = 40;

  if (icon === "map") {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="12" cy="20" r="4" fill={color} opacity={opacity} />
        <circle cx="28" cy="12" r="4" fill={color} opacity={opacity} />
        <circle cx="28" cy="28" r="4" fill={color} opacity={opacity} />
        <line x1="16" y1="20" x2="24" y2="12" stroke={color} strokeWidth="1.5" opacity={opacity * 0.6} />
        <line x1="16" y1="20" x2="24" y2="28" stroke={color} strokeWidth="1.5" opacity={opacity * 0.6} />
        {active && (
          <>
            <circle cx="20" cy="8" r="3" fill={color} opacity={0.6} />
            <line x1="16" y1="19" x2="17" y2="9" stroke={color} strokeWidth="1.2" opacity={0.4} />
          </>
        )}
      </svg>
    );
  }
  if (icon === "predict") {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="14" fill="none" stroke={color} strokeWidth="1.2" opacity={opacity * 0.3} />
        <circle cx="20" cy="20" r="9" fill="none" stroke={color} strokeWidth="1.5" opacity={opacity * 0.5} />
        <circle cx="20" cy="20" r="4" fill={color} opacity={opacity} />
        {active && (
          <circle cx="20" cy="20" r="18" fill="none" stroke={color} strokeWidth="1" opacity={0.2} />
        )}
      </svg>
    );
  }
  if (icon === "fix") {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
        <rect x="6" y="16" width="8" height="8" rx="2" fill={color} opacity={opacity} />
        <rect x="16" y="10" width="8" height="8" rx="2" fill={color} opacity={opacity * 0.7} />
        <rect x="26" y="16" width="8" height="8" rx="2" fill={color} opacity={opacity * 0.5} />
        <rect x="16" y="22" width="8" height="8" rx="2" fill={color} opacity={opacity * 0.7} />
        {active && (
          <>
            <line x1="14" y1="20" x2="16" y2="14" stroke={color} strokeWidth="1.2" opacity={0.5} />
            <line x1="14" y1="20" x2="16" y2="26" stroke={color} strokeWidth="1.2" opacity={0.5} />
            <line x1="26" y1="14" x2="26" y2="20" stroke={color} strokeWidth="1.2" opacity={0.5} />
            <line x1="26" y1="26" x2="26" y2="20" stroke={color} strokeWidth="1.2" opacity={0.5} />
          </>
        )}
      </svg>
    );
  }
  if (icon === "govern") {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
        <rect x="13" y="18" width="14" height="12" rx="2" fill={color} opacity={opacity * 0.7} />
        <path d="M15 18 v-4 a5 5 0 0 1 10 0 v4" fill="none" stroke={color} strokeWidth="2" opacity={opacity} />
        <circle cx="20" cy="24" r="2.5" fill="#05070d" opacity={opacity} />
        {active && (
          <line x1="32" y1="14" x2="36" y2="14" stroke="#ff3b5c" strokeWidth="2.5" opacity={0.8} strokeLinecap="round" />
        )}
      </svg>
    );
  }
  // prove
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="8" y="28" width="24" height="4" rx="2" fill={color} opacity={opacity * 0.3} />
      <rect x="8" y="22" width="16" height="4" rx="2" fill={color} opacity={opacity * 0.5} />
      <rect x="8" y="16" width="8" height="4" rx="2" fill={color} opacity={opacity * 0.7} />
      <text x="22" y="20" fontSize="10" fill={color} opacity={opacity} fontFamily="'JetBrains Mono', monospace" fontWeight="bold">
        {active ? "0" : "…"}
      </text>
    </svg>
  );
}

export function HowItWorksSection() {
  const [activeStep, setActiveStep] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => {
      const el = containerRef.current;
      if (!el) return;
      const { top, height } = el.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (-top + window.innerHeight * 0.4) / (height * 0.7)));
      setActiveStep(Math.min(STEPS.length - 1, Math.floor(progress * STEPS.length)));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section
      id="how-it-works"
      ref={containerRef}
      className="py-24 px-6"
      style={{ background: "#05070d" }}
    >
      <div className="max-w-3xl mx-auto">
        {/* Heading */}
        <div className="text-center mb-16">
          <span
            className="text-xs font-semibold tracking-widest uppercase mb-4 block"
            style={{ color: "#a78bfa", fontFamily: "'JetBrains Mono', monospace" }}
          >
            How it works
          </span>
          <h2
            className="text-4xl sm:text-5xl font-bold"
            style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}
          >
            Five steps, zero surprises.
          </h2>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Synapse line */}
          <div
            className="absolute left-[19px] top-4 w-0.5 transition-all duration-500"
            style={{
              background: `linear-gradient(to bottom, ${STEPS.map((s) => s.color).join(", ")})`,
              height: `${((activeStep + 1) / STEPS.length) * 100}%`,
              maxHeight: "calc(100% - 2rem)",
            }}
            aria-hidden="true"
          />
          <div
            className="absolute left-[19px] top-4 w-0.5 opacity-15"
            style={{ background: "#fff", bottom: "1rem", top: "1rem" }}
            aria-hidden="true"
          />

          <div className="flex flex-col gap-10">
            {STEPS.map((step, i) => {
              const isActive = i <= activeStep;
              return (
                <div
                  key={i}
                  className="relative pl-14 transition-all duration-500"
                  style={{ opacity: isActive ? 1 : 0.35 }}
                  onMouseEnter={() => setActiveStep(i)}
                >
                  {/* Step dot */}
                  <div
                    className="absolute left-0 top-1 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300"
                    style={{
                      borderColor: isActive ? step.color : "rgba(255,255,255,0.1)",
                      background: isActive ? `${step.color}18` : "transparent",
                    }}
                    aria-hidden="true"
                  >
                    <span
                      className="text-xs font-bold"
                      style={{ color: isActive ? step.color : "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {step.number}
                    </span>
                  </div>

                  {/* Content */}
                  <div
                    className="rounded-xl p-5 border transition-all duration-300"
                    style={{
                      background: "rgba(15,20,35,0.55)",
                      borderColor: isActive ? `${step.color}44` : "rgba(255,255,255,0.07)",
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    <div className="flex items-center gap-4 mb-2">
                      <StepIcon icon={step.icon} color={step.color} active={isActive} />
                      <h3
                        className="text-xl font-bold"
                        style={{ fontFamily: "'Space Grotesk', sans-serif", color: isActive ? step.color : "rgba(255,255,255,0.5)" }}
                      >
                        {step.title}
                      </h3>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.65)" }}>
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
