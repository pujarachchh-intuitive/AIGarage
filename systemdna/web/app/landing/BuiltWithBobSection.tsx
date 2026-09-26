"use client";

const BOB_FEATURES = [
  {
    category: "Modes",
    color: "#38bdf8",
    items: [
      { name: "Agent mode", description: "Fixer agents edit real files in the repo." },
      { name: "Plan mode → hand-off", description: "Change Planner analyses impact, then hands off a typed plan to Agent." },
      { name: "Custom modes", description: "Cartographer, Change Planner, Fixer, Inspector — each with locked tool sets." },
    ],
  },
  {
    category: "Parallel agents",
    color: "#a78bfa",
    items: [
      { name: "Parallel subagents", description: "Cartographers scan each of the 7 layers simultaneously." },
      { name: "Parallel fixers", description: "One Bob worker per affected component, all running concurrently." },
      { name: "Bob Shell", description: "bob -p workers with --max-cost and --max-turns for budget control." },
    ],
  },
  {
    category: "Intelligence",
    color: "#22e39a",
    items: [
      { name: "Document understanding", description: "Reads the data dictionary PDF and ADR to extract owners and PII flags." },
      { name: "Skills", description: "propagate-rename fix recipes — reusable, versioned, shareable." },
      { name: "MCP tools", description: "get_impact, plan_change, start_wave, get_status, verify — all via MCP." },
    ],
  },
  {
    category: "Governance hooks",
    color: "#ff3b5c",
    items: [
      { name: "PreToolUse hook", description: "Blocks any edit outside the agent's file permit before it executes." },
      { name: "SessionStart / PostToolUse / Stop", description: "Stream every event to the audit log and the Agent City dashboard." },
      { name: "Lifecycle hook rules", description: "City laws are enforced at runtime, not just visualised." },
    ],
  },
];

export function BuiltWithBobSection() {
  return (
    <section
      id="built-with-bob"
      className="py-24 px-6"
      style={{ background: "#05070d" }}
    >
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <span
            className="text-xs font-semibold tracking-widest uppercase mb-4 block"
            style={{ color: "#a78bfa", fontFamily: "'JetBrains Mono', monospace" }}
          >
            Technology
          </span>
          <h2
            className="text-4xl sm:text-5xl font-bold mb-4"
            style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}
          >
            Built with IBM Bob 2.0
          </h2>
          <p className="text-base leading-relaxed max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.6)" }}>
            Every SystemDNA capability maps directly to a Bob 2.0 feature — no wrappers, no workarounds.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {BOB_FEATURES.map((group) => (
            <div
              key={group.category}
              className="rounded-2xl p-6 border"
              style={{
                background: "rgba(15,20,35,0.55)",
                borderColor: `${group.color}33`,
                backdropFilter: "blur(10px)",
              }}
            >
              <h3
                className="text-sm font-bold uppercase tracking-widest mb-4"
                style={{ color: group.color, fontFamily: "'JetBrains Mono', monospace" }}
              >
                {group.category}
              </h3>
              <div className="flex flex-col gap-4">
                {group.items.map((item) => (
                  <div key={item.name} className="flex items-start gap-3">
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                      style={{ background: group.color }}
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "#fff" }}>
                        {item.name}
                      </p>
                      <p className="text-xs leading-relaxed mt-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
