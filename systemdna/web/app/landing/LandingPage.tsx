"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { buildCityData, impactRings, storySource } from "@/lib/city";
import type { Graph } from "@/lib/types";
import marketplaceGraph from "@/lib/mock/marketplace-dashboard.graph.json";
import { metrics } from "./metrics";
import { siteConfig } from "./siteConfig";

const StoryModel = lazy(() => import("./StoryModel"));

function hasWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
// Probing WebGL creates a context, so do it once per page load.
let webglSupport: boolean | undefined;
const webglSnapshot = () => (webglSupport ??= hasWebGL());
const noSubscribe = () => () => {};

const GRAPH = marketplaceGraph as unknown as Graph;

export function LandingPage() {
  const webgl = useSyncExternalStore<boolean | null>(noSubscribe, webglSnapshot, () => null);
  const data = useMemo(() => buildCityData(GRAPH), []);
  const src = useMemo(() => storySource(data), [data]);
  const impact = useMemo(() => impactRings(data, src), [data, src]);
  const affected = impact.rings.slice(1).reduce((n, r) => n + r.length, 0);
  const hops = impact.rings.length - 1;
  const srcName = src.split("/").pop() ?? src;

  const [chapter, setChapter] = useState(0);
  const chapterRefs = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    // ?fig=2 pins the story to one chapter: handy for demos and screenshots.
    const pinned = Number(new URLSearchParams(window.location.search).get("fig"));
    if (pinned >= 1 && pinned <= 4) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChapter(pinned);
      return;
    }
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setChapter(Number((e.target as HTMLElement).dataset.chapter));
      },
      { rootMargin: "-48% 0px -48% 0px" },
    );
    chapterRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const chapters = [
    {
      fig: "Overview",
      label: null,
      readout: [
        ["Repository", GRAPH.repo],
        ["Files", String(data.stats.files)],
        ["Dependencies", String(data.stats.links)],
        ["Folders", String(data.stats.districts)],
      ],
    },
    {
      fig: "Map",
      label: "01",
      title: "Every file, every dependency. One model.",
      body: "SystemDNA scans the repository and builds a knowledge graph across seven layers: database, data pipelines, backend, API, frontend, dashboards and business processes. The model beside this text is that graph, built from our demo repo.",
      readout: [
        ["Files", String(data.stats.files)],
        ["Dependencies", String(data.stats.links)],
        ["Lines", data.stats.lines.toLocaleString("en-US")],
        ["Median file", `${data.stats.medianLines} lines`],
      ],
    },
    {
      fig: "Impact",
      label: "02",
      title: "Change one thing. See everything it touches.",
      body: `Rename a field in ${srcName}. SystemDNA follows it through every file that depends on it, including the links a text search misses, and orders them by distance from the change.`,
      readout: [
        ["Changed", srcName],
        ["Affected", `${affected} files`],
        ["Depth", `${hops} ${hops === 1 ? "hop" : "hops"}`],
        ["Source", "Demo scan"],
      ],
    },
    {
      fig: "Fix",
      label: "03",
      title: "A governed crew fixes it, in order.",
      body: "Parallel IBM Bob agents each take one permit and fix the affected files in dependency order. Lifecycle hooks block any edit outside a permit, so the rules are enforced, not just drawn.",
      readout: [
        ["Agents", `${affected}`],
        ["Order", "Dependency first"],
        ["Outside permit", "Blocked"],
        ["Mode", "Simulated preview"],
      ],
    },
    {
      fig: "Proof",
      label: "04",
      title: "Complete, and provably so.",
      body: "A fresh scan of the graph checks that no reference is left dangling and the tests run. You get one pull request with the impact report and a full audit trail of what every agent did.",
      readout: [
        ["Output", "1 pull request"],
        ["Re-scan", "Dangling references"],
        ["Tests", "Run on the branch"],
        ["Audit", "Every agent action"],
      ],
    },
  ];
  const active = chapters[chapter];

  return (
    <div className="lp">
      <a href="#hero" className="lp-skip">
        Skip to main content
      </a>

      <header className="lp-nav" data-scrolled={scrolled || undefined}>
        <div className="lp-wrap lp-nav-inner">
          <span className="lp-brand">
            <svg viewBox="0 0 20 20" className="lp-brand-mark" aria-hidden="true">
              <rect x="1" y="9" width="5" height="10" rx="1.2" />
              <rect x="7.5" y="4" width="5" height="15" rx="1.2" />
              <rect x="14" y="1" width="5" height="18" rx="1.2" />
            </svg>
            SystemDNA
          </span>
          <nav className="lp-nav-links" aria-label="Primary">
            <a href="#model">Model</a>
            <a href="#proof">Proof</a>
            <Link href="/overview" className="lp-nav-cta">
              Open app
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content">
        <div className="lp-story">
          {/* The model: sticky, framed like a figure in a technical monograph. */}
          <div className="lp-stage" aria-hidden="true">
            <div className="lp-stage-inner">
              {webgl ? (
                <Suspense fallback={null}>
                  <StoryModel data={data} chapter={chapter} title={GRAPH.repo} />
                </Suspense>
              ) : null}
              <span className="lp-crop lp-crop-tl" />
              <span className="lp-crop lp-crop-tr" />
              <span className="lp-crop lp-crop-bl" />
              <span className="lp-crop lp-crop-br" />
              <div className="lp-hud lp-hud-top">
                <span>Fig. {String(chapter).padStart(2, "0")}</span>
                <span className="lp-hud-sep" />
                <span>{active.fig}</span>
              </div>
              <dl className="lp-hud lp-hud-readout">
                {active.readout.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="lp-hud lp-hud-progress">
                {chapters.map((c, i) => (
                  <span key={c.fig} data-on={i <= chapter || undefined} />
                ))}
              </div>
            </div>
          </div>

          <div className="lp-text">
            <section
              id="hero"
              className="lp-chapter lp-hero"
              data-chapter={0}
              ref={(el) => {
                chapterRefs.current[0] = el;
              }}
            >
              <p className="lp-kicker">Change intelligence · Built with IBM Bob 2.0</p>
              <h1 className="lp-title">SystemDNA</h1>
              <p className="lp-tagline">Find References for your whole system, and fix them all.</p>
              <p className="lp-lede">
                SystemDNA shows what a code change will break across a whole system, then has a governed crew of IBM Bob
                agents fix every affected part and prove the change is complete.
              </p>
              <div className="lp-ctas">
                <Link href="/city" className="lp-btn lp-btn-primary">
                  Enter Agent City
                </Link>
                <Link href="/city?mode=replay" className="lp-btn lp-btn-quiet">
                  Watch the replay
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
                  </svg>
                </Link>
              </div>
              <p className="lp-scrollcue" aria-hidden="true">
                <span />
                Scroll to follow one change through the system
              </p>
            </section>

            <div id="model">
              {chapters.slice(1).map((c, i) => (
                <section
                  key={c.fig}
                  className="lp-chapter"
                  data-chapter={i + 1}
                  data-active={chapter === i + 1 || undefined}
                  ref={(el) => {
                    chapterRefs.current[i + 1] = el;
                  }}
                >
                  <p className="lp-chapter-label">
                    <span>{c.label}</span>
                    {c.fig}
                  </p>
                  <h2 className="lp-h2">{c.title}</h2>
                  <p className="lp-body">{c.body}</p>
                </section>
              ))}
            </div>
          </div>
        </div>

        {/* Proof: targets, stated plainly until they are measured. */}
        <section id="proof" className="lp-proof">
          <div className="lp-wrap">
            <div className="lp-proof-head">
              <p className="lp-chapter-label">
                <span>05</span>Proof
              </p>
              <h2 className="lp-h2">Numbers, not claims.</h2>
              <p className="lp-body">
                Every figure below is a target. Each is measured live in the demo against a hand-made answer key, and
                shown here only once it has been.
              </p>
            </div>
            <div className="lp-spec" role="list">
              {metrics.map((m) => (
                <div key={m.label} className="lp-spec-row" role="listitem">
                  <div className="lp-spec-label">
                    <span>{m.label}</span>
                    <span className="lp-badge">Target</span>
                  </div>
                  <p className="lp-spec-desc">{m.description}</p>
                  <p className="lp-spec-value">
                    {m.value === null ? (
                      <span className="lp-spec-pending">Measured live in the demo</span>
                    ) : (
                      <>
                        {m.value}
                        {m.unit ? <span className="lp-spec-unit"> {m.unit}</span> : null}
                      </>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-close">
          <div className="lp-wrap lp-close-inner">
            <h2 className="lp-close-title">See your system as it really is.</h2>
            <Link href="/overview" className="lp-btn lp-btn-primary lp-btn-lg">
              Open the dashboard
            </Link>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-inner">
          <span>SystemDNA</span>
          <span>
            {siteConfig.eventName} · {siteConfig.eventPlatform} · {siteConfig.eventDates}
          </span>
          <span>
            Team of {siteConfig.teamSize}: {siteConfig.teamDescription}
          </span>
          {siteConfig.githubUrl !== "#" ? <a href={siteConfig.githubUrl}>GitHub</a> : null}
        </div>
      </footer>
    </div>
  );
}
