"use client";

// The public landing page. It explains SystemDNA in plain words, shows the real
// sample repo in 3D, and points people into the dashboard.
//
// Sections: hero (3D change ripple) - numbers - the problem (grep vs graph) -
// how it works - inside the dashboard - the knowledge graph (3D helix) -
// features - safety - call to action - footer.

import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Check,
  Eye,
  FileLock2,
  FolderGit2,
  Gauge,
  GitPullRequest,
  KeyRound,
  Layers,
  Map as MapIcon,
  Moon,
  Network,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Sun,
  UserCheck,
  Waypoints,
  Wrench,
  X,
} from "lucide-react";
import Logo from "@/components/icons/logo";
import { DashboardPreview } from "@/components/landing/dashboard-preview";
import type { HeroPhase } from "@/components/landing/hero-scene";
import { typeColor } from "@/components/landing/palette";
import { cn } from "@/lib/cn";
import type { LandingData } from "@/lib/landing-data";
import { setDarkMode, useIsDark } from "@/lib/theme";

// Three.js loads only in the browser, in its own bundle.
const HeroScene = dynamic(() => import("@/components/landing/hero-scene").then((m) => m.HeroScene), { ssr: false });
const HelixScene = dynamic(() => import("@/components/landing/helix-scene").then((m) => m.HelixScene), { ssr: false });

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** True once the element has scrolled into view (stays true). */
function useInView<T extends Element>(margin = "0px 0px -12% 0px") {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [margin, seen]);
  return [ref, seen] as const;
}

/** Fades and lifts its children in when they scroll into view. */
function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} data-shown={seen || undefined} className={cn("landing-reveal", className)} style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}>
      {children}
    </div>
  );
}

/** Counts up to a number the first time it is seen. */
function CountUp({ value, format = (n: number) => n.toLocaleString("en-US") }: { value: number; format?: (n: number) => string }) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!seen) return;
    // Reduced motion: jump straight to the final number.
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1400;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = duration ? Math.min(1, (now - start) / duration) : 1;
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [seen, value]);
  return (
    <span ref={ref} className="tabular-nums">
      {format(shown)}
    </span>
  );
}

function SectionHeading({ eyebrow, title, children, center = false, dark = false }: { eyebrow: string; title: ReactNode; children?: ReactNode; center?: boolean; dark?: boolean }) {
  return (
    <Reveal className={cn("flex flex-col gap-4 max-w-2xl", center && "mx-auto text-center items-center")}>
      <span className={cn("inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]", dark ? "text-zinc-400" : "text-text-tertiary")}>
        <span className={cn("h-px w-6", dark ? "bg-zinc-600" : "bg-border-strong")} />
        {eyebrow}
      </span>
      <h2 className={cn("text-3xl sm:text-[2.6rem] sm:leading-[1.1] font-semibold tracking-[-0.03em]", dark ? "text-white" : "text-text-primary")}>{title}</h2>
      {children ? <p className={cn("text-base sm:text-lg leading-relaxed", dark ? "text-zinc-400" : "text-text-secondary")}>{children}</p> : null}
    </Reveal>
  );
}

const fileName = (p: string) => p.split("/").pop() ?? p;

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

const NAV = [
  { href: "#problem", label: "Why" },
  { href: "#how", label: "How it works" },
  { href: "#dashboard", label: "Dashboard" },
  { href: "#graph", label: "Knowledge graph" },
  { href: "#safety", label: "Safety" },
];

function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const isDark = useIsDark();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      className={cn(
        "fixed top-0 inset-x-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300 border-b",
        scrolled ? "bg-background/75 backdrop-blur-xl border-border" : "bg-transparent border-transparent",
      )}
    >
      <div className="mx-auto max-w-7xl h-16 px-4 sm:px-6 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label="SystemDNA home">
          <span className={cn("size-8 rounded-lg flex items-center justify-center border", scrolled ? "bg-surface border-border" : "bg-white/10 border-white/15")}>
            <Logo className={cn("size-4", !scrolled && "brightness-[2.4]")} />
          </span>
          <span className={cn("text-[15px] font-semibold tracking-tight", scrolled ? "text-text-primary" : "text-white")}>SystemDNA</span>
        </Link>
        <nav className="hidden lg:flex items-center gap-1 mx-auto" aria-label="Sections">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className={cn(
                "px-3 h-8 inline-flex items-center rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                scrolled ? "text-text-secondary hover:text-text-primary hover:bg-surface-hover" : "text-zinc-300 hover:text-white hover:bg-white/10",
              )}
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2 ml-auto lg:ml-0">
          <button
            onClick={() => setDarkMode(!isDark)}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className={cn(
              "cursor-pointer size-9 inline-flex items-center justify-center rounded-lg border transition-colors",
              scrolled ? "border-border bg-surface text-icon-secondary hover:text-text-primary" : "border-white/15 bg-white/5 text-zinc-300 hover:text-white",
            )}
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <Link
            href="/overview"
            className={cn(
              "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-[background-color,transform] active:scale-[0.98]",
              scrolled ? "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200" : "bg-white text-zinc-900 hover:bg-zinc-200",
            )}
          >
            Open dashboard
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

const PHASE_ORDER: HeroPhase[] = ["change", "impact", "fix", "pr"];
const PHASE_COLOR: Record<HeroPhase, string> = { idle: "#a1a1aa", change: "#60a5fa", impact: "#f59e0b", fix: "#22c55e", pr: "#22c55e" };

function Hero({ data }: { data: LandingData }) {
  const [phase, setPhase] = useState<HeroPhase>("idle");
  const c = data.change;
  const steps: { id: HeroPhase; title: string; detail: string }[] = [
    { id: "change", title: "Change", detail: `Rename ${c.oldName}` },
    { id: "impact", title: "Impact", detail: `${c.files} files in ${c.waves} ${c.waves === 1 ? "wave" : "waves"}` },
    { id: "fix", title: "Fix", detail: "One agent per file, checked" },
    { id: "pr", title: "Review", detail: "A draft pull request opens" },
  ];
  const activeIdx = PHASE_ORDER.indexOf(phase);

  return (
    <section className="relative isolate lg:min-h-[max(680px,100svh)] overflow-hidden bg-zinc-950 text-white">
      {/* Fallback glow while (or if) WebGL loads. */}
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_at_70%_60%,#1e293b_0%,#09090b_60%)]" />
      {/* Shade the left side so the words stay easy to read, and fade into the page below. */}
      <div className="pointer-events-none absolute inset-0 -z-[5] hidden lg:block bg-gradient-to-r from-zinc-950 via-zinc-950/40 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 -z-10 bg-gradient-to-t from-zinc-950 to-transparent" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-28 lg:pt-32 pb-16 lg:min-h-[max(680px,100svh)] flex flex-col justify-center">
        <div className="max-w-2xl flex flex-col gap-7">
          <span className="landing-rise inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300 backdrop-blur-sm">
            <span className="relative flex size-2">
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
              <span className="relative size-2 rounded-full bg-emerald-400" />
            </span>
            Knowledge graph + governed AI agents
          </span>
          <h1 className="landing-rise [animation-delay:80ms] text-[2.6rem] leading-[1.04] sm:text-6xl lg:text-7xl font-semibold tracking-[-0.045em]">
            See what a change
            <br />
            will break.{" "}
            <span className="bg-gradient-to-r from-amber-300 via-emerald-300 to-sky-300 bg-clip-text text-transparent">Then fix it safely.</span>
          </h1>
          <p className="landing-rise [animation-delay:160ms] text-lg sm:text-xl leading-relaxed text-zinc-400 max-w-xl">
            SystemDNA maps every file, type and field in your code. Rename one field and it shows every file that must change, in the right order. Then a crew
            of agents fixes each file, checks the work and opens a draft pull request for you to review.
          </p>
          <div className="landing-rise [animation-delay:240ms] flex flex-wrap items-center gap-3">
            <Link
              href="/overview"
              className="group inline-flex items-center gap-2 h-12 px-5 rounded-xl bg-white text-zinc-900 text-[15px] font-semibold shadow-[0_0_40px_-8px_rgba(255,255,255,0.5)] hover:bg-zinc-200 active:scale-[0.98] transition-[background-color,transform]"
            >
              Open the dashboard
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/changes/new"
              className="inline-flex items-center gap-2 h-12 px-5 rounded-xl border border-white/15 bg-white/5 text-[15px] font-semibold text-white backdrop-blur-sm hover:bg-white/10 active:scale-[0.98] transition-[background-color,transform]"
            >
              <Sparkles className="size-4" />
              Try a change
            </Link>
          </div>
        </div>

        {/* The 3D city: its own block on small screens, behind everything on large ones. */}
        <div className="relative -mx-4 sm:-mx-6 mt-10 h-[380px] sm:h-[460px] lg:absolute lg:inset-0 lg:m-0 lg:h-auto lg:-z-10">
          <HeroScene city={data.city} change={c} onPhase={setPhase} className="absolute inset-0" />
        </div>

        {/* The story the 3D city is playing, step by step. */}
        <div className="landing-rise [animation-delay:360ms] mt-4 lg:mt-20 lg:ml-auto w-full lg:w-[440px] rounded-2xl border border-white/10 bg-zinc-950/60 backdrop-blur-md p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-zinc-400">
              Replaying a real change on <span className="font-mono text-zinc-200">{data.repo}</span>
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Live 3D</span>
          </div>
          <ol className="grid grid-cols-4 gap-2">
            {steps.map((s, i) => {
              const active = s.id === phase;
              const done = activeIdx > i;
              return (
                <li key={s.id} className="flex flex-col gap-2 min-w-0">
                  <span className="h-1 rounded-full bg-white/10 overflow-hidden">
                    <span
                      className="block h-full rounded-full transition-all duration-700"
                      style={{ width: active || done ? "100%" : "0%", background: active ? PHASE_COLOR[s.id] : done ? "#52525b" : "transparent" }}
                    />
                  </span>
                  <span className={cn("text-xs font-semibold transition-colors", active ? "text-white" : "text-zinc-500")}>{s.title}</span>
                  <span className={cn("text-[11px] leading-snug transition-colors", active ? "text-zinc-300" : "text-zinc-600")}>{s.detail}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Numbers strip
// ---------------------------------------------------------------------------

function Numbers({ data }: { data: LandingData }) {
  const items: { label: string; value: number; format?: (n: number) => string; suffix?: string }[] = [
    { label: "Files mapped", value: data.stats.files },
    { label: "Lines of code", value: data.stats.lines },
    { label: "Components found", value: data.stats.components },
    { label: "Dependencies traced", value: data.stats.links },
    { label: "To work out the impact", value: Math.max(1, Math.round(data.change.computedMs)), suffix: " ms" },
  ];
  return (
    <section className="relative border-b border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 grid grid-cols-2 md:grid-cols-5 gap-8">
        {items.map((it, i) => (
          <Reveal key={it.label} delay={i * 70} className="flex flex-col gap-1">
            <span className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em] text-text-primary">
              <CountUp value={it.value} format={it.format} />
              {it.suffix ? <span className="text-text-tertiary text-2xl">{it.suffix}</span> : null}
            </span>
            <span className="text-sm text-text-tertiary">{it.label}</span>
          </Reveal>
        ))}
      </div>
      <p className="mx-auto max-w-7xl px-4 sm:px-6 pb-8 -mt-4 text-xs text-text-tertiary">
        Real numbers from the sample repo <span className="font-mono">{data.repo}</span>, scanned by SystemDNA.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The problem: text search vs the graph
// ---------------------------------------------------------------------------

function Problem({ data }: { data: LandingData }) {
  const c = data.change;
  const needed = new Set(c.fixUnits.map((u) => u.file));
  const falseAlarms = new Set(c.grep.falsePositives);
  const missed = new Set(c.grep.missed);
  const grepRows = [...new Set([...c.grep.found, ...c.grep.missed])].map((f) => ({
    file: f,
    status: missed.has(f) ? "missed" : falseAlarms.has(f) ? "wrong" : needed.has(f) ? "right" : "wrong",
  }));
  const grepRight = grepRows.filter((r) => r.status === "right").length;

  return (
    <section id="problem" className="scroll-mt-20 py-24 sm:py-32 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col gap-14">
        <SectionHeading eyebrow="The problem" title={<>Find and replace guesses.<br className="hidden sm:block" /> SystemDNA knows.</>}>
          Renaming a field sounds simple. But text search cannot tell two fields with the same name apart, and it cannot see files that use the field
          without spelling it out. So you either break something or check every file by hand.
        </SectionHeading>

        <div className="grid lg:grid-cols-2 gap-6">
          <Reveal>
            <div className="h-full rounded-3xl border border-border bg-surface p-6 sm:p-8 flex flex-col gap-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-sm text-text-tertiary">Search for &ldquo;{c.oldName}&rdquo;</span>
                  <span className="text-xl font-semibold text-text-primary">Find and replace</span>
                </div>
                <span className="text-sm font-semibold text-error bg-error-soft px-2.5 py-1 rounded-full">
                  {c.grep.falsePositives.length + c.grep.missed.length} mistakes
                </span>
              </div>
              <ul className="flex flex-col divide-y divide-divider rounded-2xl border border-border overflow-hidden">
                {grepRows.map((r) => (
                  <li key={r.file} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span
                      className={cn(
                        "size-5 rounded-full flex items-center justify-center shrink-0",
                        r.status === "right" ? "bg-surface-secondary text-text-secondary" : "bg-error-soft text-error",
                      )}
                    >
                      {r.status === "right" ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="font-mono text-[13px] text-text-primary truncate">{r.file}</span>
                    <span className={cn("ml-auto text-xs shrink-0", r.status === "right" ? "text-text-tertiary" : "text-error")}>
                      {r.status === "missed" ? "Missed" : r.status === "wrong" ? "Different field" : "Found"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-text-secondary">
                It gets {grepRight} files right, changes {c.grep.falsePositives.length} {c.grep.falsePositives.length === 1 ? "file" : "files"} it should not touch
                {c.grep.missed.length ? `, and misses ${c.grep.missed.length}` : ""}.
              </p>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="relative h-full rounded-3xl border border-border bg-surface p-6 sm:p-8 flex flex-col gap-5 overflow-hidden">
              <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-emerald-500/10 blur-3xl" />
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-sm text-text-tertiary">Rename {c.field}</span>
                  <span className="text-xl font-semibold text-text-primary">SystemDNA</span>
                </div>
                <span className="text-sm font-semibold text-success bg-success-soft px-2.5 py-1 rounded-full">Exact</span>
              </div>
              <ul className="flex flex-col divide-y divide-divider rounded-2xl border border-border overflow-hidden">
                {c.fixUnits.map((u) => (
                  <li key={u.file} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="size-5 rounded-full flex items-center justify-center shrink-0 bg-success-soft text-success">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    <span className="font-mono text-[13px] text-text-primary truncate">{u.file}</span>
                    <span className="ml-auto text-xs text-text-tertiary shrink-0">
                      Wave {u.wave} · {u.layer}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-text-secondary">
                {c.files} files, fixed in {c.waves} {c.waves === 1 ? "wave" : "waves"} so each file changes only after the files it depends on.
                {c.business.length ? ` It also shows the business areas affected: ${c.business.map((b) => b.name).slice(0, 3).join(", ")}.` : ""}
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

const STEPS: { icon: ComponentType<{ className?: string }>; title: string; body: string; note?: string }[] = [
  { icon: FolderGit2, title: "Connect", body: "Paste a public Git URL or upload a .zip. SystemDNA reads the code. It never installs, builds or runs it." },
  { icon: Network, title: "Map", body: "The TypeScript compiler finds every type, field, function, page and doc, and every link between them." },
  { icon: Eye, title: "Predict", body: "Pick a field and a new name. See every file that must change, the risk, the order and the business areas it touches." },
  {
    icon: Wrench,
    title: "Fix",
    body: "One agent per file, wave by wave, inside strict rules. Checks run on every file, then a draft pull request opens.",
    note: "The multi-agent run is a preview today. The GitHub agent that makes the edit and opens the pull request is live.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 py-24 sm:py-32 bg-surface-secondary/60 border-y border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col gap-14">
        <SectionHeading eyebrow="How it works" title="From repository to reviewed pull request in four steps" />
        <div className="relative grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="hidden lg:block absolute top-[38px] left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-border-strong to-transparent" />
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 110}>
              <div className="relative h-full rounded-3xl border border-border bg-surface p-6 flex flex-col gap-4 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="size-12 rounded-2xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 flex items-center justify-center shadow-md">
                    <s.icon className="size-5" />
                  </span>
                  <span className="text-5xl font-semibold tracking-tighter text-border-strong/80 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="text-xl font-semibold text-text-primary">{s.title}</h3>
                <p className="text-[15px] leading-relaxed text-text-secondary">{s.body}</p>
                {s.note ? <p className="mt-auto text-xs leading-relaxed text-text-tertiary border-t border-divider pt-3">{s.note}</p> : null}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Inside the dashboard
// ---------------------------------------------------------------------------

function Dashboard({ data }: { data: LandingData }) {
  return (
    <section id="dashboard" className="scroll-mt-20 py-24 sm:py-32 bg-background overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col gap-14">
        <SectionHeading eyebrow="Inside the dashboard" title="A control room for your whole codebase">
          Five screens take you from &ldquo;what do we have?&rdquo; to &ldquo;it is fixed and ready to review&rdquo;. Everything below uses the real sample repo.
        </SectionHeading>
        <Reveal>
          <DashboardPreview data={data} />
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The knowledge graph (3D helix)
// ---------------------------------------------------------------------------

function Graph({ data }: { data: LandingData }) {
  const total = data.nodeTypes.reduce((n, t) => n + t.count, 0) || 1;
  return (
    <section id="graph" className="scroll-mt-20 relative isolate overflow-hidden bg-zinc-950 text-white py-24 sm:py-32">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_75%_50%,rgba(99,102,241,0.14),transparent_60%)]" />
      <div className="absolute inset-0 -z-10 opacity-[0.07] bg-[linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
        <div className="flex flex-col gap-10">
          <SectionHeading dark eyebrow="The knowledge graph" title="Your system's DNA, read by the compiler">
            Every component is a bead. Every link is a rung. SystemDNA uses the TypeScript language service, the same engine behind &ldquo;find all
            references&rdquo; in your editor, so two fields with the same name are never mixed up.
          </SectionHeading>
          <Reveal delay={120}>
            <div className="flex flex-col gap-3">
              <div className="flex h-2.5 rounded-full overflow-hidden">
                {data.nodeTypes.map((t) => (
                  <span key={t.type} style={{ width: `${(t.count / total) * 100}%`, background: typeColor(t.type) }} title={`${t.label}: ${t.count}`} />
                ))}
              </div>
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5">
                {data.nodeTypes.map((t) => (
                  <li key={t.type} className="flex items-center gap-2 text-sm">
                    <span className="size-2.5 rounded-full shrink-0" style={{ background: typeColor(t.type) }} />
                    <span className="text-zinc-300">{t.label}</span>
                    <span className="ml-auto text-zinc-500 tabular-nums">{t.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={200}>
            <div className="grid grid-cols-3 gap-3">
              {[
                ["Types and fields", "Interfaces, classes and their fields"],
                ["Code", "Functions, constants, datasets"],
                ["Product", "Pages, components, business uses, docs"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <span className="block text-sm font-semibold text-white">{k}</span>
                  <span className="block text-xs text-zinc-500 mt-1 leading-relaxed">{v}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
        <div className="relative h-[460px] sm:h-[560px]">
          <HelixScene nodeTypes={data.nodeTypes} className="absolute inset-0" />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

/** A card with a soft light that follows the pointer. */
function Spotlight({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      className={cn("landing-spotlight group relative h-full rounded-3xl border border-border bg-surface p-6 sm:p-7 overflow-hidden transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lg", className)}
    >
      {children}
    </div>
  );
}

function FeatureIcon({ icon: Icon }: { icon: ComponentType<{ className?: string }> }) {
  return (
    <span className="size-10 rounded-xl border border-border bg-surface-secondary flex items-center justify-center text-text-primary">
      <Icon className="size-[18px]" />
    </span>
  );
}

function Features({ data }: { data: LandingData }) {
  const c = data.change;
  return (
    <section id="features" className="scroll-mt-20 py-24 sm:py-32 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col gap-14">
        <SectionHeading eyebrow="What you get" title="Everything you need to change code with confidence" />
        <div className="grid md:grid-cols-6 gap-5">
          <Reveal className="md:col-span-4">
            <Spotlight>
              <div className="flex flex-col gap-4 sm:max-w-[55%]">
                <FeatureIcon icon={Layers} />
                <h3 className="text-xl font-semibold text-text-primary">Fixed in the right order</h3>
                <p className="text-[15px] leading-relaxed text-text-secondary">
                  Files are grouped into waves by what depends on what. A wave starts only when the one before it passes its checks, so nothing is built on a
                  broken base.
                </p>
              </div>
              <div className="mt-6 sm:mt-0 sm:absolute sm:right-7 sm:top-7 sm:bottom-7 sm:w-[38%] flex flex-col justify-center gap-2">
                {Array.from({ length: c.waves }, (_, w) => (
                  <div key={w} className="rounded-2xl border border-border bg-surface-secondary/70 p-3 flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold text-text-tertiary">Wave {w + 1}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {c.fixUnits
                        .filter((u) => u.wave === w + 1)
                        .map((u) => (
                          <span key={u.file} title={u.file} className="max-w-full truncate px-2 py-0.5 rounded-md bg-surface border border-border text-[11px] font-mono text-text-primary">
                            {fileName(u.file)}
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </Spotlight>
          </Reveal>
          <Reveal className="md:col-span-2" delay={80}>
            <Spotlight>
              <div className="flex flex-col gap-4">
                <FeatureIcon icon={Gauge} />
                <h3 className="text-xl font-semibold text-text-primary">A risk score you can read</h3>
                <p className="text-[15px] leading-relaxed text-text-secondary">From 0 to 100, based on how far a change spreads, how critical the code is, personal data and missing tests.</p>
                <div className="flex items-end gap-2 mt-2">
                  <span className="text-5xl font-semibold tracking-tighter text-text-primary tabular-nums">{c.risk}</span>
                  <span className="text-sm text-text-tertiary mb-2">/ 100 for this change</span>
                </div>
                <span className="h-2 rounded-full bg-surface-secondary overflow-hidden">
                  <span className="block h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500" style={{ width: `${c.risk}%` }} />
                </span>
              </div>
            </Spotlight>
          </Reveal>
          <Reveal className="md:col-span-2" delay={0}>
            <Spotlight>
              <div className="flex flex-col gap-4">
                <FeatureIcon icon={MapIcon} />
                <h3 className="text-xl font-semibold text-text-primary">Three ways to look</h3>
                <p className="text-[15px] leading-relaxed text-text-secondary">A dependency map, a 3D city with one building per file, and a force graph of every node. Your selection follows you across all three.</p>
                <div className="flex gap-2 mt-1">
                  {["Map", "3D city", "Graph"].map((v) => (
                    <span key={v} className="px-2.5 py-1 rounded-full border border-border text-xs font-medium text-text-secondary">
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            </Spotlight>
          </Reveal>
          <Reveal className="md:col-span-2" delay={80}>
            <Spotlight>
              <div className="flex flex-col gap-4">
                <FeatureIcon icon={Boxes} />
                <h3 className="text-xl font-semibold text-text-primary">Business impact, not just files</h3>
                <p className="text-[15px] leading-relaxed text-text-secondary">See which products and teams a change reaches, so the right people hear about it before it ships.</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {(c.business.length ? c.business.map((b) => b.name) : ["No business use touched"]).slice(0, 4).map((b) => (
                    <span key={b} className="px-2.5 py-1 rounded-full bg-warning-soft text-warning text-xs font-medium">
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            </Spotlight>
          </Reveal>
          <Reveal className="md:col-span-2" delay={160}>
            <Spotlight>
              <div className="flex flex-col gap-4">
                <FeatureIcon icon={GitPullRequest} />
                <h3 className="text-xl font-semibold text-text-primary">A real pull request</h3>
                <p className="text-[15px] leading-relaxed text-text-secondary">
                  The GitHub agent makes the rename with the compiler, checks that no file gains a type error, shows you the diff, and opens a draft pull request
                  once you say yes.
                </p>
              </div>
            </Spotlight>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

const SAFETY: { icon: ComponentType<{ className?: string }>; title: string; body: string }[] = [
  { icon: Eye, title: "Reads code, never runs it", body: "No install, no build, no scripts from your repo. Temporary copies are always deleted." },
  { icon: FileLock2, title: "Permits for every agent", body: "Each agent may edit only the files on its permit. No two agents ever work on the same file." },
  { icon: UserCheck, title: "People approve risky files", body: "Protected files, like shared contracts and personal data, wait for a person before any edit." },
  { icon: GitPullRequest, title: "Drafts only", body: "Pull requests are always drafts on a new branch. The default branch is never touched." },
  { icon: KeyRound, title: "Your token stays on the server", body: "It is sent as a header only. It never appears in a URL, a log or an error message." },
  { icon: ScrollText, title: "Every action is recorded", body: "Permits, tool calls, blocks, approvals and checks all land in the audit log." },
];

function Safety() {
  return (
    <section id="safety" className="scroll-mt-20 py-24 sm:py-32 bg-surface-secondary/60 border-y border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 grid lg:grid-cols-[1fr_1.4fr] gap-14">
        <div className="flex flex-col gap-8">
          <SectionHeading eyebrow="Safety" title="Agents that follow the rules of the city">
            Automation is only useful if you can trust it. Every agent in SystemDNA works inside city laws that are checked on every single action.
          </SectionHeading>
          <Reveal delay={100}>
            <div className="relative w-fit">
              <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-2xl" />
              <div className="relative size-28 rounded-[2rem] border border-border bg-surface flex items-center justify-center shadow-lg landing-float">
                <ShieldCheck className="size-12 text-success" strokeWidth={1.5} />
              </div>
            </div>
          </Reveal>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {SAFETY.map((s, i) => (
            <Reveal key={s.title} delay={i * 70}>
              <div className="h-full rounded-2xl border border-border bg-surface p-5 flex gap-4">
                <span className="size-9 rounded-xl bg-success-soft text-success flex items-center justify-center shrink-0">
                  <s.icon className="size-4" />
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="text-[15px] font-semibold text-text-primary">{s.title}</h3>
                  <p className="text-sm leading-relaxed text-text-secondary">{s.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Call to action and footer
// ---------------------------------------------------------------------------

function CallToAction() {
  return (
    <section className="py-24 sm:py-32 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal>
          <div className="relative isolate overflow-hidden rounded-[2rem] bg-zinc-950 px-6 py-16 sm:px-16 sm:py-24 text-center">
            <div className="absolute inset-0 -z-10 opacity-[0.1] bg-[linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
            <div className="absolute left-1/2 top-full -z-10 size-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[conic-gradient(from_180deg,#f59e0b,#22c55e,#60a5fa,#f59e0b)] opacity-30 blur-3xl landing-spin" />
            <Waypoints className="mx-auto size-10 text-zinc-500 mb-6" strokeWidth={1.5} />
            <h2 className="text-3xl sm:text-5xl font-semibold tracking-[-0.035em] text-white max-w-3xl mx-auto">Map your own system in minutes</h2>
            <p className="mt-5 text-lg text-zinc-400 max-w-xl mx-auto">
              Connect a public repository or upload a .zip. You get the knowledge graph, the 3D city and a real impact report straight away.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link href="/repos/new" className="inline-flex items-center gap-2 h-12 px-5 rounded-xl bg-white text-zinc-900 text-[15px] font-semibold hover:bg-zinc-200 active:scale-[0.98] transition-[background-color,transform]">
                <FolderGit2 className="size-4" />
                Connect a repository
              </Link>
              <Link href="/city?view=3d" className="inline-flex items-center gap-2 h-12 px-5 rounded-xl border border-white/15 bg-white/5 text-[15px] font-semibold text-white hover:bg-white/10 active:scale-[0.98] transition-[background-color,transform]">
                <MapIcon className="size-4" />
                Explore the sample city
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 flex flex-col sm:flex-row gap-6 sm:items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="size-8 rounded-lg border border-border bg-surface flex items-center justify-center">
            <Logo className="size-4" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-text-primary">SystemDNA</span>
            <span className="text-xs text-text-tertiary">See the ripple before you make the change.</span>
          </div>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-secondary" aria-label="Footer">
          <Link href="/overview" className="hover:text-text-primary">Dashboard</Link>
          <Link href="/city" className="hover:text-text-primary">Agent City</Link>
          <Link href="/changes/new" className="hover:text-text-primary">New change</Link>
          <Link href="/repos" className="hover:text-text-primary">Repositories</Link>
          <Link href="/governance" className="hover:text-text-primary">Governance</Link>
        </nav>
      </div>
    </footer>
  );
}

export function LandingPage({ data }: { data: LandingData }) {
  return (
    <div className="flex flex-col bg-background text-text-primary font-sans">
      <LandingNav />
      <main>
        <Hero data={data} />
        <Numbers data={data} />
        <Problem data={data} />
        <HowItWorks />
        <Dashboard data={data} />
        <Graph data={data} />
        <Features data={data} />
        <Safety />
        <CallToAction />
      </main>
      <Footer />
    </div>
  );
}
