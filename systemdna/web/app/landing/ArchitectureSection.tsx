"use client";

/**
 * Architecture section — animated SVG diagram showing the data flow:
 * Bob IDE → Load Balancer → EC2 (API, MCP, Orchestrator, Graph Engine, Bob Workers)
 *         → DynamoDB / S3 / Secrets Manager / CloudWatch
 *         → CloudFront + S3 (static dashboard)
 *
 * Light dots travel along the arrows using CSS animation.
 */

const NODES = [
  { id: "ide", label: "Bob IDE", x: 60, y: 160, color: "#38bdf8", w: 90, h: 36 },
  { id: "lb", label: "Load Balancer\nHTTPS + WS", x: 210, y: 160, color: "#a78bfa", w: 110, h: 36 },
  { id: "ec2", label: "EC2\nAPI · MCP · Orchestrator\nGraph · Workers · Hooks", x: 380, y: 120, color: "#22e39a", w: 150, h: 52 },
  { id: "dynamo", label: "DynamoDB\nEvents · Audit", x: 580, y: 60, color: "#ffb020", w: 120, h: 36 },
  { id: "s3", label: "S3\nGraph · Replays", x: 580, y: 120, color: "#ffb020", w: 120, h: 36 },
  { id: "secrets", label: "Secrets Manager", x: 580, y: 180, color: "#ffb020", w: 120, h: 36 },
  { id: "cw", label: "CloudWatch", x: 580, y: 240, color: "#ffb020", w: 120, h: 36 },
  { id: "cf", label: "CloudFront + S3\nDashboard", x: 380, y: 240, color: "#f472b6", w: 140, h: 36 },
];

const ARROWS = [
  { from: "ide", to: "lb", label: "" },
  { from: "lb", to: "ec2", label: "" },
  { from: "ec2", to: "dynamo", label: "" },
  { from: "ec2", to: "s3", label: "" },
  { from: "ec2", to: "secrets", label: "" },
  { from: "ec2", to: "cw", label: "" },
  { from: "lb", to: "cf", label: "" },
];

function nodeCenter(n: (typeof NODES)[0]) {
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
}

function getNodeById(id: string) {
  return NODES.find((n) => n.id === id)!;
}

export function ArchitectureSection() {
  const SVG_W = 760;
  const SVG_H = 320;

  return (
    <section
      id="architecture"
      className="py-24 px-6"
      style={{ background: "#05070d" }}
    >
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <span
            className="text-xs font-semibold tracking-widest uppercase mb-4 block"
            style={{ color: "#38bdf8", fontFamily: "'JetBrains Mono', monospace" }}
          >
            Architecture
          </span>
          <h2
            className="text-4xl sm:text-5xl font-bold mb-4"
            style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}
          >
            How it all connects.
          </h2>
        </div>

        <div
          className="rounded-2xl border overflow-x-auto"
          style={{
            background: "rgba(15,20,35,0.55)",
            borderColor: "rgba(56,189,248,0.15)",
            backdropFilter: "blur(10px)",
          }}
        >
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="w-full"
            style={{ minWidth: 480 }}
            role="img"
            aria-label="Architecture diagram showing Bob IDE connecting through a load balancer to an EC2 host running the API, MCP server, orchestrator, graph engine and Bob workers, which writes to DynamoDB, S3, Secrets Manager and CloudWatch, while the dashboard is served from CloudFront and S3."
          >
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill="rgba(255,255,255,0.3)" />
              </marker>
              {ARROWS.map((a, i) => {
                const fn = nodeCenter(getNodeById(a.from));
                const tn = nodeCenter(getNodeById(a.to));
                return (
                  <path
                    key={i}
                    id={`path-${i}`}
                    d={`M${fn.x},${fn.y} L${tn.x},${tn.y}`}
                    fill="none"
                  />
                );
              })}
            </defs>

            {/* Arrows */}
            {ARROWS.map((a, i) => {
              const fn = nodeCenter(getNodeById(a.from));
              const tn = nodeCenter(getNodeById(a.to));
              return (
                <line
                  key={i}
                  x1={fn.x}
                  y1={fn.y}
                  x2={tn.x}
                  y2={tn.y}
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth="1.5"
                  markerEnd="url(#arrow)"
                />
              );
            })}

            {/* Travelling dots */}
            {ARROWS.map((a, i) => {
              const delay = (i * 0.7).toFixed(1);
              const fn = nodeCenter(getNodeById(a.from));
              const tn = nodeCenter(getNodeById(a.to));
              const fromNode = getNodeById(a.from);
              return (
                <circle key={`dot-${i}`} r="3.5" fill={fromNode.color} opacity="0.9">
                  <animateMotion
                    dur="2.8s"
                    begin={`${delay}s`}
                    repeatCount="indefinite"
                    path={`M${fn.x},${fn.y} L${tn.x},${tn.y}`}
                  />
                </circle>
              );
            })}

            {/* Nodes */}
            {NODES.map((n) => {
              const lines = n.label.split("\n");
              return (
                <g key={n.id}>
                  <rect
                    x={n.x}
                    y={n.y}
                    width={n.w}
                    height={n.h}
                    rx="6"
                    fill="rgba(15,20,35,0.85)"
                    stroke={n.color}
                    strokeWidth="1.2"
                    strokeOpacity="0.6"
                  />
                  {lines.map((line, li) => (
                    <text
                      key={li}
                      x={n.x + n.w / 2}
                      y={n.y + (n.h / (lines.length + 1)) * (li + 1) + 4}
                      textAnchor="middle"
                      fontSize="9.5"
                      fill={li === 0 ? n.color : "rgba(255,255,255,0.6)"}
                      fontFamily="'JetBrains Mono', monospace"
                      fontWeight={li === 0 ? "bold" : "normal"}
                    >
                      {line}
                    </text>
                  ))}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </section>
  );
}
