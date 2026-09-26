"use client";

// "Inside the dashboard": a tilted 3D browser window that shows each main screen.
// The screens are small HTML versions of the real pages, filled with the sample
// repo's real numbers. The window leans toward the pointer; the tabs advance on
// their own until the visitor picks one.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Boxes, Check, FileCode2, GitPullRequest, Layers, Map as MapIcon, Network, ShieldCheck, Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";
import type { LandingData } from "@/lib/landing-data";

type Tab = "overview" | "city" | "change" | "run" | "governance";

const TABS: { id: Tab; label: string; route: string; blurb: string; icon: typeof Boxes }[] = [
  { id: "overview", label: "Overview", route: "/overview", blurb: "Your whole system on one page: components, links, layers and recent agent work.", icon: Boxes },
  { id: "city", label: "Agent City", route: "/city", blurb: "Walk through your code as a city. One building per file, one block per folder.", icon: MapIcon },
  { id: "change", label: "New change", route: "/changes/new", blurb: "Pick a field, type the new name, and see every file it touches before you start.", icon: Sparkles },
  { id: "run", label: "Change run", route: "/changes", blurb: "Agents fix one file each, wave by wave, and open a draft pull request.", icon: GitPullRequest },
  { id: "governance", label: "Governance", route: "/governance", blurb: "City laws every agent must follow, and a log of every action they take.", icon: ShieldCheck },
];

const SEVERITY_STATUS = { breaking: "Breaking", needs_update: "Needs update", update: "Update", safe: "Safe" } as const;

function Kpi({ label, value, icon: Icon }: { label: string; value: ReactNode; icon: typeof Boxes }) {
  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-text-tertiary">{label}</span>
        <Icon className="size-3.5 text-icon-secondary" />
      </div>
      <span className="text-xl font-semibold tracking-tight text-text-primary tabular-nums">{value}</span>
    </div>
  );
}

function Panel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface p-3 flex flex-col gap-2 min-w-0", className)}>
      <span className="text-[11px] font-semibold text-text-primary">{title}</span>
      {children}
    </div>
  );
}

function OverviewScreen({ data }: { data: LandingData }) {
  const max = Math.max(...data.layers.map((l) => l.count));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-2">
        <Kpi label="Components" value={data.stats.components} icon={Boxes} />
        <Kpi label="Dependencies" value={data.stats.links} icon={Network} />
        <Kpi label="Files" value={data.stats.files} icon={FileCode2} />
        <Kpi label="Layers" value={data.stats.layers} icon={Layers} />
      </div>
      <div className="grid grid-cols-5 gap-2">
        <Panel title="Components per layer" className="col-span-3">
          <div className="flex items-end gap-2 h-28 pt-2">
            {data.layers.map((l) => (
              <div key={l.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="w-full rounded-t-md bg-gradient-to-t from-zinc-900 to-zinc-500 dark:from-zinc-200 dark:to-zinc-500" style={{ height: `${Math.max(6, (l.count / max) * 88)}px` }} />
                <span className="text-[9px] text-text-tertiary truncate w-full text-center">{l.label}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="How links were found" className="col-span-2">
          <div className="flex items-center gap-3 pt-1">
            <div className="relative size-16 shrink-0 rounded-full" style={{ background: "conic-gradient(var(--text-primary) 0 100%, var(--border) 0)" }}>
              <div className="absolute inset-2 rounded-full bg-surface flex items-center justify-center text-[11px] font-semibold text-text-primary">100%</div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-text-primary font-semibold">{data.stats.links} by the compiler</span>
              <span className="text-[10px] text-text-tertiary leading-snug">TypeScript language service, not text search.</span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** A small isometric SVG of the real city. Files the change touches are amber. */
function CityScreen({ data }: { data: LandingData }) {
  const touched = useMemo(() => new Set(data.change.fixUnits.map((u) => u.file)), [data]);
  const { polys, box } = useMemo(() => {
    const s = 5;
    const cos = Math.cos(Math.PI / 6);
    const sin = Math.sin(Math.PI / 6);
    const iso = (x: number, z: number, y: number) => [(x - z) * cos * s, (x + z) * sin * s - y * s] as const;
    const out: { d: string; fill: string; key: string }[] = [];
    const pts = (p: (readonly [number, number])[]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    for (const d of data.city.districts) {
      out.push({ key: `d-${d.dir}`, fill: "var(--surface-secondary)", d: pts([iso(d.x, d.z, 0), iso(d.x + d.w, d.z, 0), iso(d.x + d.w, d.z + d.d, 0), iso(d.x, d.z + d.d, 0)]) });
    }
    const sorted = [...data.city.buildings].sort((a, b) => a.x + a.z - (b.x + b.z));
    for (const b of sorted) {
      const r = 0.9;
      const [x0, x1, z0, z1] = [b.x - r, b.x + r, b.z - r, b.z + r];
      const hot = touched.has(b.path);
      const src = b.path === data.change.source;
      const tone = src ? ["#93c5fd", "#3b82f6", "#1d4ed8"] : hot ? ["#fcd34d", "#f59e0b", "#b45309"] : ["var(--city-top)", "var(--city-left)", "var(--city-right)"];
      out.push({ key: `${b.path}-l`, fill: tone[1], d: pts([iso(x0, z1, 0), iso(x1, z1, 0), iso(x1, z1, b.h), iso(x0, z1, b.h)]) });
      out.push({ key: `${b.path}-r`, fill: tone[2], d: pts([iso(x1, z0, 0), iso(x1, z1, 0), iso(x1, z1, b.h), iso(x1, z0, b.h)]) });
      out.push({ key: `${b.path}-t`, fill: tone[0], d: pts([iso(x0, z0, b.h), iso(x1, z0, b.h), iso(x1, z1, b.h), iso(x0, z1, b.h)]) });
    }
    const all = out.flatMap((p) => p.d.split(" ").map((xy) => xy.split(",").map(Number)));
    const xs = all.map((p) => p[0]);
    const ys = all.map((p) => p[1]);
    const pad = 6;
    return { polys: out, box: `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + pad * 2} ${Math.max(...ys) - Math.min(...ys) + pad * 2}` };
  }, [data, touched]);

  return (
    <div className="grid grid-cols-3 gap-2 h-full">
      <div className="col-span-2 rounded-xl border border-border bg-surface p-2 flex items-center justify-center [--city-top:#e4e4e7] [--city-left:#a1a1aa] [--city-right:#71717a] dark:[--city-top:#52525b] dark:[--city-left:#3f3f46] dark:[--city-right:#27272a]">
        <svg viewBox={box} className="w-full h-[210px]">
          {polys.map((p) => (
            <polygon key={p.key} points={p.d} fill={p.fill} stroke="var(--surface)" strokeWidth={0.4} />
          ))}
        </svg>
      </div>
      <div className="flex flex-col gap-2">
        <Panel title="Selected file">
          <span className="text-[11px] font-semibold text-text-primary truncate">{data.change.source.split("/").pop()}</span>
          <span className="text-[10px] text-text-tertiary">Holds {data.change.field}</span>
        </Panel>
        <Panel title="Legend">
          {[
            ["#3b82f6", "The changed field"],
            ["#f59e0b", "Files it touches"],
            ["#a1a1aa", "Everything else"],
          ].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1.5 text-[10px] text-text-secondary">
              <span className="size-2 rounded-sm" style={{ background: c }} />
              {l}
            </span>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function ChangeScreen({ data }: { data: LandingData }) {
  const c = data.change;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 p-2.5 rounded-xl border border-border bg-surface text-[11px]">
        <span className="px-2 py-1 rounded-md bg-surface-secondary font-mono text-text-primary">{c.field}</span>
        <ArrowRight className="size-3.5 text-icon-secondary" />
        <span className="px-2 py-1 rounded-md bg-surface-secondary font-mono text-text-primary">{c.to}</span>
        <span className="ml-auto flex items-center gap-2 text-text-tertiary">
          Risk
          <span className="w-16 h-1.5 rounded-full bg-border overflow-hidden">
            <span className="block h-full bg-text-primary rounded-full" style={{ width: `${c.risk}%` }} />
          </span>
          <span className="font-semibold text-text-primary tabular-nums">{c.risk}</span>
        </span>
      </div>
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="grid grid-cols-[1fr_80px_60px_90px] gap-2 px-3 py-1.5 border-b border-border text-[10px] font-semibold text-text-tertiary">
          <span>File</span>
          <span>Layer</span>
          <span>Wave</span>
          <span>Impact</span>
        </div>
        {c.fixUnits.slice(0, 6).map((u) => (
          <div key={u.file} className="grid grid-cols-[1fr_80px_60px_90px] gap-2 px-3 py-1.5 border-b border-divider last:border-0 items-center text-[11px]">
            <span className="truncate font-mono text-text-primary">{u.file}</span>
            <span className="text-text-secondary truncate">{u.layer}</span>
            <span className="text-text-secondary tabular-nums">{u.wave}</span>
            <StatusBadge status={SEVERITY_STATUS[u.severity]} className="scale-90 origin-left" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="Files to change" value={c.files} icon={FileCode2} />
        <Kpi label="Waves" value={c.waves} icon={Layers} />
        <Kpi label="Grep would miss" value={c.grep.missed.length} icon={Network} />
      </div>
    </div>
  );
}

function RunScreen({ data }: { data: LandingData }) {
  const c = data.change;
  const waves = Array.from({ length: c.waves }, (_, i) => i + 1);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="font-semibold text-text-primary">Rename {c.oldName}</span>
        <StatusBadge status="Completed" className="scale-90" />
        <span className="ml-auto text-text-tertiary">Simulated run</span>
      </div>
      {waves.map((w) => (
        <div key={w} className="rounded-xl border border-border bg-surface p-2.5 flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold text-text-tertiary">Wave {w}</span>
          {c.fixUnits
            .filter((u) => u.wave === w)
            .slice(0, 4)
            .map((u) => (
              <div key={u.file} className="flex items-center gap-2 text-[11px]">
                <span className="size-4 rounded-full bg-success-soft text-success flex items-center justify-center">
                  <Check className="size-2.5" strokeWidth={3} />
                </span>
                <span className="font-mono text-text-primary truncate">fix-{u.name.replace(/\.[^.]+$/, "").toLowerCase()}</span>
                <span className="text-text-tertiary truncate">{u.file}</span>
                <span className="ml-auto text-[10px] text-text-tertiary shrink-0">checks passed</span>
              </div>
            ))}
        </div>
      ))}
      <div className="rounded-xl border border-border bg-surface p-2.5 flex items-center gap-2 text-[11px]">
        <GitPullRequest className="size-3.5 text-success" />
        <span className="text-text-primary font-semibold">Draft pull request opened</span>
        <span className="font-mono text-text-tertiary truncate">systemdna/rename-{c.oldName.toLowerCase()}</span>
      </div>
    </div>
  );
}

const LAWS = [
  ["Permit law", "Edit only the files on your permit"],
  ["One builder per building", "No two agents on one file"],
  ["Traffic lights", "A wave starts only when the one before is green"],
  ["Approval gate", "Protected files wait for a person"],
  ["Completeness law", "Done only when a re-scan finds 0 broken references"],
  ["Record law", "Every action is logged"],
];

function GovernanceScreen() {
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="grid grid-cols-[150px_1fr_80px] gap-2 px-3 py-1.5 border-b border-border text-[10px] font-semibold text-text-tertiary">
        <span>Law</span>
        <span>Rule</span>
        <span>Status</span>
      </div>
      {LAWS.map(([law, rule]) => (
        <div key={law} className="grid grid-cols-[150px_1fr_80px] gap-2 px-3 py-2 border-b border-divider last:border-0 items-center text-[11px]">
          <span className="font-semibold text-text-primary">{law}</span>
          <span className="text-text-secondary truncate">{rule}</span>
          <StatusBadge status="Enforced" className="scale-90 origin-left" />
        </div>
      ))}
    </div>
  );
}

export function DashboardPreview({ data }: { data: LandingData }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [auto, setAuto] = useState(true);
  const [tilt, setTilt] = useState({ x: 8, y: -14 });

  // Advance the tabs on their own until the visitor picks one.
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setTab((t) => TABS[(TABS.findIndex((x) => x.id === t) + 1) % TABS.length].id), 5200);
    return () => clearInterval(id);
  }, [auto]);

  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-10 items-center">
      <div className="flex flex-col gap-1.5" role="tablist" aria-label="Dashboard screens">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTab(t.id);
                setAuto(false);
              }}
              className={cn(
                "cursor-pointer relative text-left p-4 rounded-2xl border transition-all duration-300 overflow-hidden",
                active ? "bg-surface border-border-strong shadow-md" : "border-transparent hover:bg-surface/60",
              )}
            >
              <span className="flex items-center gap-2.5">
                <t.icon className={cn("size-4", active ? "text-text-primary" : "text-icon-secondary")} />
                <span className={cn("text-[15px] font-semibold", active ? "text-text-primary" : "text-text-secondary")}>{t.label}</span>
              </span>
              <span className={cn("grid transition-all duration-300", active ? "grid-rows-[1fr] opacity-100 mt-1.5" : "grid-rows-[0fr] opacity-0")}>
                <span className="overflow-hidden text-sm text-text-secondary leading-relaxed">{t.blurb}</span>
              </span>
              {active && auto ? <span key={tab} className="absolute left-0 bottom-0 h-0.5 bg-text-primary landing-progress" /> : null}
            </button>
          );
        })}
      </div>

      <div
        className="relative [perspective:1800px]"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          setTilt({ x: 6 - py * 8, y: -10 + px * 14 });
        }}
        onPointerLeave={() => setTilt({ x: 8, y: -14 })}
      >
        <div
          className="relative transition-transform duration-500 ease-out [transform-style:preserve-3d]"
          style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
        >
          {/* The browser window */}
          <div className="rounded-2xl border border-border bg-background shadow-[0_40px_120px_-30px_rgba(0,0,0,0.45)] overflow-hidden">
            <div className="flex items-center gap-2 px-4 h-10 border-b border-border bg-surface">
              <span className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                <span className="size-2.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                <span className="size-2.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
              </span>
              <span className="mx-auto px-3 h-6 inline-flex items-center rounded-md bg-surface-secondary text-[11px] text-text-tertiary font-mono">
                systemdna.app{current.route}
              </span>
            </div>
            <div className="flex min-h-[380px]">
              <div className="hidden sm:flex flex-col gap-1 w-36 shrink-0 border-r border-border bg-surface p-2">
                {TABS.map((t) => (
                  <span
                    key={t.id}
                    className={cn("flex items-center gap-2 px-2 h-7 rounded-md text-[11px] font-medium", t.id === tab ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-text-secondary")}
                  >
                    <t.icon className="size-3.5" />
                    {t.label}
                  </span>
                ))}
              </div>
              <div className="flex-1 min-w-0 p-4 flex flex-col gap-3">
                <div className="flex flex-col">
                  <span className="text-base font-semibold text-text-primary">{current.label}</span>
                  <span className="text-[11px] text-text-tertiary">{data.repo}</span>
                </div>
                <div key={tab} className="landing-screen-in">
                  {tab === "overview" ? <OverviewScreen data={data} /> : null}
                  {tab === "city" ? <CityScreen data={data} /> : null}
                  {tab === "change" ? <ChangeScreen data={data} /> : null}
                  {tab === "run" ? <RunScreen data={data} /> : null}
                  {tab === "governance" ? <GovernanceScreen /> : null}
                </div>
              </div>
            </div>
          </div>

          {/* Floating cards that sit in front of the window */}
          <div className="hidden md:flex absolute -left-6 -top-6 items-center gap-2 px-3 py-2 rounded-xl border border-border bg-surface shadow-lg [transform:translateZ(80px)]">
            <span className="size-7 rounded-lg bg-warning-soft text-warning flex items-center justify-center">
              <Sparkles className="size-4" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[11px] text-text-tertiary">Impact found in</span>
              <span className="text-sm font-semibold text-text-primary">{Math.max(1, Math.round(data.change.computedMs))} ms</span>
            </span>
          </div>
          <div className="hidden md:flex absolute -right-6 bottom-16 items-center gap-2 px-3 py-2 rounded-xl border border-border bg-surface shadow-lg [transform:translateZ(110px)]">
            <span className="size-7 rounded-lg bg-success-soft text-success flex items-center justify-center">
              <Check className="size-4" strokeWidth={3} />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[11px] text-text-tertiary">After the fix</span>
              <span className="text-sm font-semibold text-text-primary">0 broken references</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
