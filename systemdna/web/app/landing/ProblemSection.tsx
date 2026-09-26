"use client";

import { useState } from "react";

const LAYER_ITEMS = [
  {
    layer: "Database",
    color: "#38bdf8",
    item: "orders.cust_id → customer_id",
    sublabel: "Schema column rename",
    grepFinds: true,
  },
  {
    layer: "SQL Transform",
    color: "#a78bfa",
    item: "stg_orders.customer_key alias",
    sublabel: "Alias chain — downstream never mentions cust_id",
    grepFinds: false,
    grepReason: "Alias chain: downstream files use customer_key, not cust_id",
  },
  {
    layer: "Data Pipeline",
    color: "#ffb020",
    item: "export_job.py dynamic SQL",
    sublabel: "Builds query string at runtime",
    grepFinds: false,
    grepReason: "Dynamic SQL: column name is a variable, not a string literal",
  },
  {
    layer: "Backend",
    color: "#22e39a",
    item: "Python ORM model + API schema",
    sublabel: "Field definition and response shape",
    grepFinds: true,
  },
  {
    layer: "API",
    color: "#ffb020",
    item: "TypeScript type Order.cust_id",
    sublabel: "Typed from the Python API endpoint",
    grepFinds: false,
    grepReason: "Cross-language: typed relationship, not a string reference",
  },
  {
    layer: "Frontend",
    color: "#f472b6",
    item: "React <OrdersTable> column",
    sublabel: "Renders the renamed field",
    grepFinds: true,
  },
  {
    layer: "Dashboard / Business",
    color: "#ff3b5c",
    item: "Finance month-end close report",
    sublabel: "Revenue dashboard + Excel close process",
    grepFinds: false,
    grepReason: "Cross-layer: business process depends on a BI field alias",
  },
];

export function ProblemSection() {
  const [showGrep, setShowGrep] = useState(false);

  return (
    <section
      id="problem"
      className="py-24 px-6"
      style={{ background: "#07090f" }}
    >
      <div className="max-w-2xl mx-auto">
        {/* Heading */}
        <div className="text-center mb-12">
          <span
            className="text-xs font-semibold tracking-widest uppercase mb-4 block"
            style={{ color: "#38bdf8", fontFamily: "'JetBrains Mono', monospace" }}
          >
            The problem
          </span>
          <h2
            className="text-4xl sm:text-5xl font-bold mb-4"
            style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}
          >
            One rename.{" "}
            <span style={{ color: "#ff3b5c" }}>Seven layers.</span>
          </h2>
          <p className="text-base leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
            Renaming <code
              className="px-1.5 py-0.5 rounded text-xs"
              style={{ background: "rgba(56,189,248,0.12)", color: "#38bdf8", fontFamily: "'JetBrains Mono', monospace" }}
            >orders.cust_id</code>{" "}
            to <code
              className="px-1.5 py-0.5 rounded text-xs"
              style={{ background: "rgba(56,189,248,0.12)", color: "#38bdf8", fontFamily: "'JetBrains Mono', monospace" }}
            >customer_id</code>{" "}
            breaks things in at least 7 places. Today, developers grep, ask teammates, and find the rest when a job fails.
          </p>
        </div>

        {/* grep toggle */}
        <div className="flex justify-center mb-8">
          <div
            className="inline-flex rounded-lg p-1 gap-1"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            role="group"
            aria-label="Toggle view"
          >
            {(["SystemDNA", "grep"] as const).map((label) => (
              <button
                key={label}
                onClick={() => setShowGrep(label === "grep")}
                className="px-4 py-1.5 rounded-md text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                style={
                  (showGrep ? label === "grep" : label === "SystemDNA")
                    ? { background: "rgba(56,189,248,0.18)", color: "#38bdf8" }
                    : { color: "rgba(255,255,255,0.45)" }
                }
                aria-pressed={showGrep ? label === "grep" : label === "SystemDNA"}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Chain */}
        <div className="relative flex flex-col gap-0">
          {/* Vertical connector line */}
          <div
            className="absolute left-6 top-6 bottom-6 w-px"
            style={{ background: "linear-gradient(to bottom, #38bdf8, #a78bfa, #ff3b5c)" }}
            aria-hidden="true"
          />

          {LAYER_ITEMS.map((item, i) => {
            const dimmed = showGrep && !item.grepFinds;
            return (
              <div key={i} className="relative pl-16 pb-4">
                {/* Dot on the line */}
                <div
                  className="absolute left-[18px] top-4 w-3 h-3 rounded-full border-2 transition-all duration-300"
                  style={{
                    borderColor: item.color,
                    background: dimmed ? "#07090f" : item.color,
                    boxShadow: dimmed ? "none" : `0 0 8px ${item.color}`,
                  }}
                  aria-hidden="true"
                />

                {/* Card */}
                <div
                  className="rounded-xl p-4 border transition-all duration-300"
                  style={{
                    background: dimmed
                      ? "rgba(15,20,35,0.25)"
                      : "rgba(15,20,35,0.55)",
                    borderColor: dimmed ? "rgba(255,255,255,0.06)" : `${item.color}44`,
                    backdropFilter: "blur(8px)",
                    opacity: dimmed ? 0.4 : 1,
                  }}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <span
                        className="text-xs font-semibold tracking-widest uppercase"
                        style={{ color: item.color, fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {item.layer}
                      </span>
                      <p className="font-semibold text-sm mt-1" style={{ color: "#fff" }}>
                        {item.item}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                        {item.sublabel}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      {item.grepFinds ? (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: "rgba(34,227,154,0.12)", color: "#22e39a", border: "1px solid rgba(34,227,154,0.25)" }}
                        >
                          grep ✓
                        </span>
                      ) : (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: "rgba(255,59,92,0.12)", color: "#ff3b5c", border: "1px solid rgba(255,59,92,0.25)" }}
                        >
                          grep misses
                        </span>
                      )}
                    </div>
                  </div>
                  {showGrep && !item.grepFinds && item.grepReason && (
                    <p
                      className="text-xs mt-2 pt-2 border-t"
                      style={{ color: "#ffb020", borderColor: "rgba(255,176,32,0.2)" }}
                    >
                      ⚠ {item.grepReason}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
