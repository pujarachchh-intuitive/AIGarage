"use client";

import Link from "next/link";
import { siteConfig } from "./siteConfig";

export function FooterSection() {
  return (
    <footer
      className="py-12 px-6 border-t"
      style={{
        background: "#03050a",
        borderColor: "rgba(255,255,255,0.07)",
      }}
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        {/* Left: brand */}
        <div className="flex flex-col items-center sm:items-start gap-1">
          <span
            className="text-lg font-bold"
            style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}
          >
            System<span style={{ color: "#38bdf8" }}>DNA</span>
          </span>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            Find References for your whole system, and fix them all.
          </span>
        </div>

        {/* Centre: event */}
        <div className="text-center">
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
            Built for the{" "}
            <span style={{ color: "#a78bfa" }}>{siteConfig.eventName}</span>
            {" "}on {siteConfig.eventPlatform}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
            {siteConfig.eventDates}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
            Team of {siteConfig.teamSize}: {siteConfig.teamDescription}
          </p>
        </div>

        {/* Right: GitHub */}
        <div>
          <Link
            href={siteConfig.githubUrl}
            className="inline-flex items-center gap-2 text-xs px-4 py-2 rounded-lg border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            style={{
              borderColor: "rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.55)",
              background: "rgba(255,255,255,0.04)",
            }}
            aria-label="View source on GitHub"
          >
            {/* GitHub SVG icon */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            GitHub
          </Link>
        </div>
      </div>
    </footer>
  );
}
