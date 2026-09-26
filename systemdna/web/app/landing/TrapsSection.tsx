"use client";

import { useState } from "react";

const TRAPS = [
  {
    name: "Alias Chain",
    color: "#a78bfa",
    codeSnippet: `-- stg_orders.sql
SELECT
  o.cust_id AS customer_key
FROM orders o`,
    whyGrep: "Downstream SQL and Python files only reference customer_key — they never mention cust_id. A grep for cust_id finds nothing downstream.",
    whoFinds: "SQL lineage walker traces the alias and marks every consumer of customer_key as affected.",
  },
  {
    name: "Dynamic SQL",
    color: "#ffb020",
    codeSnippet: `# export_job.py
col = config["customer_col"]  # = "cust_id"
query = f"SELECT {col} FROM orders"
spark.sql(query)`,
    whyGrep: "The column name is stored in a config variable. grep searches for the string literal 'cust_id' in source code — it can't evaluate runtime values.",
    whoFinds: "A Bob Cartographer agent reads the config file, resolves the variable, and creates a medium-confidence edge to this file.",
  },
  {
    name: "Cross-Language",
    color: "#f472b6",
    codeSnippet: `# Python API
class OrderResponse(BaseModel):
    cust_id: str  # ← field name

// TypeScript type (generated)
interface Order {
  cust_id: string; // ← from API
}`,
    whyGrep: "The TypeScript type is generated from the Python schema — the connection is a contract, not a string match across files.",
    whoFinds: "The cross-layer linker traces API field → TypeScript type → React table column, creating typed edges across three files.",
  },
];

function FlipCard({ trap }: { trap: (typeof TRAPS)[0] }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className="relative h-72 cursor-pointer group"
      style={{ perspective: "1000px" }}
      onClick={() => setFlipped((f) => !f)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setFlipped((f) => !f)}
      tabIndex={0}
      role="button"
      aria-pressed={flipped}
      aria-label={`${trap.name} — ${flipped ? "showing explanation" : "showing code"}. Press to flip.`}
    >
      <div
        className="absolute inset-0 transition-all duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 rounded-2xl p-6 border flex flex-col gap-3 overflow-hidden"
          style={{
            backfaceVisibility: "hidden",
            background: "rgba(15,20,35,0.72)",
            borderColor: `${trap.color}44`,
            backdropFilter: "blur(10px)",
          }}
        >
          <div className="flex items-center justify-between">
            <span
              className="text-xs font-semibold tracking-widest uppercase"
              style={{ color: trap.color, fontFamily: "'JetBrains Mono', monospace" }}
            >
              {trap.name}
            </span>
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
              flip for explanation →
            </span>
          </div>
          <pre
            className="text-xs rounded-lg p-3 overflow-auto flex-1 leading-relaxed"
            style={{
              background: "rgba(0,0,0,0.4)",
              color: "#e2e8f0",
              fontFamily: "'JetBrains Mono', monospace",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
            aria-label={`Code example for ${trap.name}`}
          >
            {trap.codeSnippet}
          </pre>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            Click to see why grep misses this
          </p>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 rounded-2xl p-6 border flex flex-col gap-4"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: "rgba(15,20,35,0.88)",
            borderColor: `${trap.color}66`,
            backdropFilter: "blur(10px)",
          }}
        >
          <span
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: trap.color, fontFamily: "'JetBrains Mono', monospace" }}
          >
            {trap.name}
          </span>
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-wide mb-1"
              style={{ color: "#ff3b5c" }}
            >
              Why grep misses it
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
              {trap.whyGrep}
            </p>
          </div>
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-wide mb-1"
              style={{ color: "#22e39a" }}
            >
              Who finds it
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
              {trap.whoFinds}
            </p>
          </div>
          <p className="text-xs mt-auto" style={{ color: "rgba(255,255,255,0.3)" }}>
            Click to see the code
          </p>
        </div>
      </div>
    </div>
  );
}

export function TrapsSection() {
  return (
    <section
      id="traps"
      className="py-24 px-6"
      style={{ background: "#07090f" }}
    >
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <span
            className="text-xs font-semibold tracking-widest uppercase mb-4 block"
            style={{ color: "#ff3b5c", fontFamily: "'JetBrains Mono', monospace" }}
          >
            The 3 traps grep misses
          </span>
          <h2
            className="text-4xl sm:text-5xl font-bold"
            style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}
          >
            Grep finds half the list.
          </h2>
          <p className="text-base leading-relaxed mt-4 max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.6)" }}>
            These three patterns are invisible to string search. Flip each card to see why.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TRAPS.map((trap) => (
            <FlipCard key={trap.name} trap={trap} />
          ))}
        </div>
      </div>
    </section>
  );
}
