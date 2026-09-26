"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Box, ChevronDown, Expand, GitBranch, ImageDown, Keyboard, Network, Orbit, Settings2, Shrink, X } from "lucide-react";
import { toast } from "sonner";
import { CityLegend } from "@/components/city/city-legend";
import { City3DView } from "@/components/city/city-3d-view";
import { CityMap } from "@/components/city/city-map";
import { GraphView } from "@/components/city/graph-view";
import { NodePanel } from "@/components/city/node-panel";
import { PageHeader, PageShell, PrimaryLink } from "@/components/ui/page";
import { downloadSnapshot } from "@/lib/city-export";
import { useCityPrefs, type CityView } from "@/lib/city-prefs";
import { cn } from "@/lib/cn";
import { useApp } from "@/lib/store";
import { useFullscreen } from "@/lib/use-fullscreen";
import type { LayerId } from "@/lib/types";

const VIEWS: { id: CityView; label: string; icon: typeof Network; key: string }[] = [
  { id: "map", label: "Dependency map", icon: Network, key: "1" },
  { id: "3d", label: "3D city", icon: Box, key: "2" },
  { id: "graph", label: "Graph", icon: Orbit, key: "3" },
];

const toolBtn =
  "cursor-pointer inline-flex items-center justify-center gap-2 h-9 px-2.5 bg-surface border border-border rounded-lg text-body font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-hover hover:border-border-strong shadow-2xs active:scale-95 transition-all duration-150 [&>svg]:size-4";

/** A small segmented control for preference rows. */
function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1 p-1 rounded-lg bg-surface-secondary border border-border" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={String(o.id)}
          onClick={() => onChange(o.id)}
          className={cn(
            "cursor-pointer h-7 px-1.5 rounded-md text-caption font-semibold transition-colors truncate",
            value === o.id ? "bg-surface text-text-primary shadow-2xs border border-border" : "text-text-tertiary hover:text-text-primary",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PrefRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-body text-text-primary">{label}</span>
        {hint ? <span className="type-caption">{hint}</span> : null}
      </span>
      {children}
    </div>
  );
}

/** Click-outside popover anchored under a toolbar button. */
function Popover({ open, onClose, children, className }: { open: boolean; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className={cn(
        "absolute right-0 top-11 z-50 bg-surface border border-border rounded-2xl shadow-lg animate-in fade-in slide-in-from-top-2 duration-150",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CityClient() {
  const graph = useApp((s) => s.graph);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = params.get("node");
  const layer = (params.get("layer") as LayerId | null) ?? "all";
  const viewParam = params.get("view");
  const view: CityView = viewParam === "3d" || viewParam === "graph" ? viewParam : "map";
  const isReplay = params.get("mode") === "replay";

  const prefs = useCityPrefs();
  const { ref: fsRef, isFullscreen, toggle: toggleFullscreen } = useFullscreen<HTMLDivElement>();
  const [openPanel, setOpenPanel] = useState<"prefs" | "keys" | null>(null);
  const closePanel = useCallback(() => setOpenPanel(null), []);

  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );
  const setParam = (key: string, value: string | null) => setParams({ [key]: value });
  const setView = useCallback((v: CityView) => setParams({ view: v === "map" ? null : v }), [setParams]);

  // Open on the preferred view when the URL does not name one.
  const startApplied = useRef(false);
  useEffect(() => {
    if (startApplied.current || viewParam) {
      startApplied.current = true;
      return;
    }
    const apply = () => {
      if (startApplied.current) return;
      startApplied.current = true;
      const s = useCityPrefs.getState();
      const target = s.startView === "last" ? s.lastView : s.startView;
      if (target !== "map") setView(target);
    };
    if (useCityPrefs.persist.hasHydrated()) apply();
    else return useCityPrefs.persist.onFinishHydration(apply);
  }, [viewParam, setView]);

  // Remember the last view.
  const setLastView = prefs.setLastView;
  useEffect(() => {
    if (useCityPrefs.persist.hasHydrated()) setLastView(view);
  }, [view, setLastView]);

  const counts = useMemo(() => {
    if (!graph) return null;
    return {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      bob: graph.edges.filter((e) => e.source === "bob").length,
    };
  }, [graph]);

  const selectedNode = graph?.nodes.find((n) => n.id === selected);

  const downloadImage = useCallback(() => {
    const name = `${(graph?.repo ?? "systemdna").replace(/[^\w-]+/g, "-")}-${view}.png`;
    if (!downloadSnapshot(name)) toast.error("The view is still loading. Try again in a moment.");
  }, [graph?.repo, view]);

  // Keyboard shortcuts for the whole page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.metaKey || e.ctrlKey || e.altKey) return;
      const v = VIEWS.find((x) => x.key === e.key);
      if (v) setView(v.id);
      else if (e.key === "f" || e.key === "F") void toggleFullscreen();
      else if (e.key === "?") setOpenPanel((p) => (p === "keys" ? null : "keys"));
      else if (e.key === "Escape" && !document.fullscreenElement && !isFullscreen) {
        setOpenPanel(null);
        if (selected) setParams({ node: null });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView, toggleFullscreen, selected, setParams, isFullscreen]);

  // 3D city works with files: pass the selected node's file in, and turn a picked file back into a node.
  const onSelectFile = (path: string | null) => {
    if (!graph || !path) return;
    const node = graph.nodes.find((n) => n.file === path && !n.parent);
    if (node && node.id !== selected) setParams({ node: node.id });
  };

  const shortcuts: [string, string][] = [
    ["1  2  3", "Dependency map, 3D city, Graph"],
    ["F", "Full screen on and off"],
    ["Esc", "Clear the selection, or leave full screen"],
    ["Ctrl K", "Find a component"],
    ["?", "Show this list"],
    ["0", "3D city: fit everything in view"],
    ["[  ]", "3D city: rotate"],
    ["Right-drag", "3D city: tilt"],
  ];

  return (
    <PageShell className="h-full">
      <PageHeader
        title={isReplay ? "Agent City — Replay" : "Agent City"}
        subtitle={
          isReplay
            ? "Watching a recorded run. Use the controls below to step through agent activity."
            : counts
            ? `Every component and dependency in ${graph?.repo}: ${counts.nodes} components, ${counts.edges} dependencies, ${counts.bob} found by Bob.`
            : "Loading the knowledge graph…"
        }
        actions={
          <>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-surface-secondary border border-border" role="tablist" aria-label="City view">
              {VIEWS.map(({ id, label, icon: Icon, key }) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id)}
                  title={`${label} (${key})`}
                  className={cn(
                    "cursor-pointer h-8 px-3 inline-flex items-center gap-2 rounded-md text-body font-semibold transition-colors",
                    view === id ? "bg-surface text-text-primary shadow-2xs border border-border" : "text-text-tertiary hover:text-text-primary",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
            <PrimaryLink href={selected ? `/changes/new?node=${encodeURIComponent(selected)}` : "/changes/new"}>
              <GitBranch />
              New change
            </PrimaryLink>
          </>
        }
      />

      <div ref={fsRef} className={cn("flex flex-col gap-3 flex-1 min-h-[600px]", isFullscreen && "bg-background p-4 min-h-0")}>
        {/* View toolbar: what is selected on the left, tools on the right. */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {view === "map" ? (
              <div className="relative">
                <select
                  value={layer}
                  onChange={(e) => setParam("layer", e.target.value === "all" ? null : e.target.value)}
                  className="cursor-pointer appearance-none h-9 pl-3 pr-9 border border-border rounded-lg bg-surface text-body font-semibold text-text-primary shadow-2xs focus:outline-none focus:border-border-strong"
                  aria-label="Filter by district"
                >
                  <option value="all">All districts</option>
                  {(graph?.layers ?? []).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="size-4 text-zinc-400 absolute right-3 top-2.5 pointer-events-none" />
              </div>
            ) : null}
            {selectedNode ? (
              <span className="inline-flex items-center gap-2 h-9 pl-3 pr-1.5 border border-border rounded-lg bg-surface text-body min-w-0">
                <span className="type-caption shrink-0">Selected</span>
                <span className="font-semibold text-text-primary truncate">{selectedNode.name}</span>
                <button onClick={() => setParam("node", null)} className="cursor-pointer p-1 rounded-md text-icon-secondary hover:text-text-primary hover:bg-surface-hover" aria-label="Clear selection" title="Clear selection (Esc)">
                  <X className="size-3.5" />
                </button>
              </span>
            ) : (
              <span className="type-caption">Click anything to see what it depends on and what uses it.</span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button className={toolBtn} onClick={downloadImage} title="Download this view as a PNG">
              <ImageDown />
              <span className="hidden xl:inline">Image</span>
            </button>

            <div className="relative">
              <button className={cn(toolBtn, openPanel === "prefs" && "border-border-strong bg-surface-hover text-text-primary")} onClick={() => setOpenPanel((p) => (p === "prefs" ? null : "prefs"))} title="Preferences" aria-expanded={openPanel === "prefs"}>
                <Settings2 />
                <span className="hidden xl:inline">Preferences</span>
              </button>
              <Popover open={openPanel === "prefs"} onClose={closePanel} className="w-[320px] max-h-[70vh] overflow-y-auto scroll-thin">
                <div className="flex items-center justify-between px-4 pt-3 pb-2">
                  <span className="type-label">Preferences</span>
                  <span className="type-caption">Saved in this browser</span>
                </div>
                <div className="px-4 pb-4 flex flex-col gap-4">
                  <PrefRow label="Open on start">
                    <Segmented
                      value={prefs.startView}
                      onChange={prefs.setStartView}
                      options={[
                        { id: "last", label: "Last" },
                        { id: "map", label: "Map" },
                        { id: "3d", label: "3D" },
                        { id: "graph", label: "Graph" },
                      ]}
                    />
                  </PrefRow>

                  <div className="flex flex-col gap-3 pt-3 border-t border-border">
                    <p className="type-label">Dependency map</p>
                    <PrefRow label="Legend">
                      <Segmented value={prefs.map.showLegend ? "on" : "off"} onChange={(v) => prefs.setMap({ showLegend: v === "on" })} options={[{ id: "on", label: "Show" }, { id: "off", label: "Hide" }]} />
                    </PrefRow>
                  </div>

                  <div className="flex flex-col gap-3 pt-3 border-t border-border">
                    <p className="type-label">3D city</p>
                    <PrefRow label="Style">
                      <Segmented value={prefs.city3d.style} onChange={(v) => prefs.set3d({ style: v })} options={[{ id: "realistic", label: "Realistic" }, { id: "schematic", label: "Schematic" }]} />
                    </PrefRow>
                    {prefs.city3d.style === "realistic" ? (
                      <>
                        <PrefRow label="Time of day">
                          <Segmented value={prefs.city3d.time} onChange={(v) => prefs.set3d({ time: v })} options={[{ id: "auto", label: "Theme" }, { id: "day", label: "Day" }, { id: "dusk", label: "Sunset" }, { id: "night", label: "Night" }]} />
                        </PrefRow>
                        <PrefRow label="Weather">
                          <Segmented value={prefs.city3d.weather} onChange={(v) => prefs.set3d({ weather: v })} options={[{ id: "clear", label: "Clear" }, { id: "rain", label: "Rain" }]} />
                        </PrefRow>
                      </>
                    ) : null}
                    <PrefRow label="Building height">
                      <Segmented value={prefs.city3d.height} onChange={(v) => prefs.set3d({ height: v })} options={[{ id: "lines", label: "Lines of code" }, { id: "imports", label: "Times imported" }]} />
                    </PrefRow>
                    <PrefRow label={prefs.city3d.style === "realistic" ? "Tint by folder" : "Colour"}>
                      <Segmented value={prefs.city3d.colorMode} onChange={(v) => prefs.set3d({ colorMode: v })} options={[{ id: "zinc", label: "Zinc" }, { id: "folder", label: "By folder" }]} />
                    </PrefRow>
                    <PrefRow label="Import arcs">
                      <Segmented value={prefs.city3d.arcs} onChange={(v) => prefs.set3d({ arcs: v })} options={[{ id: "all", label: "All" }, { id: "selected", label: "Selected" }, { id: "none", label: "None" }]} />
                    </PrefRow>
                    <PrefRow label="Labels">
                      <Segmented value={prefs.city3d.labels} onChange={(v) => prefs.set3d({ labels: v })} options={[{ id: "landmarks", label: "Landmarks" }, { id: "all", label: "All" }, { id: "none", label: "None" }]} />
                    </PrefRow>
                    <PrefRow label="Auto-rotate" hint="Handy for demos">
                      <Segmented value={prefs.city3d.autoRotate ? "on" : "off"} onChange={(v) => prefs.set3d({ autoRotate: v === "on" })} options={[{ id: "off", label: "Off" }, { id: "on", label: "On" }]} />
                    </PrefRow>
                  </div>

                  <div className="flex flex-col gap-3 pt-3 border-t border-border">
                    <p className="type-label">Graph</p>
                    <PrefRow label="Local graph" hint="Hops from the selected node">
                      <Segmented value={prefs.graph.localDepth} onChange={(v) => prefs.setGraph({ localDepth: v })} options={[{ id: 0, label: "Off" }, { id: 1, label: "1" }, { id: 2, label: "2" }, { id: 3, label: "3" }]} />
                    </PrefRow>
                    <PrefRow label="Space theme" hint="Stars, planets and comets">
                      <Segmented value={prefs.graph.space ? "on" : "off"} onChange={(v) => prefs.setGraph({ space: v === "on" })} options={[{ id: "off", label: "Off" }, { id: "on", label: "On" }]} />
                    </PrefRow>
                    {prefs.graph.space ? (
                      <PrefRow label="Galaxy rotation">
                        <Segmented value={prefs.graph.autoRotate ? "on" : "off"} onChange={(v) => prefs.setGraph({ autoRotate: v === "on" })} options={[{ id: "off", label: "Off" }, { id: "on", label: "On" }]} />
                      </PrefRow>
                    ) : null}
                    <p className="type-caption">Forces, filters and display live in the graph&apos;s own settings panel. They are saved too.</p>
                  </div>

                  <button
                    onClick={() => {
                      prefs.reset();
                      toast.success("Preferences reset");
                    }}
                    className="cursor-pointer self-start text-caption font-semibold text-text-tertiary hover:text-text-primary"
                  >
                    Reset all preferences
                  </button>
                </div>
              </Popover>
            </div>

            <div className="relative">
              <button className={cn(toolBtn, openPanel === "keys" && "border-border-strong bg-surface-hover text-text-primary")} onClick={() => setOpenPanel((p) => (p === "keys" ? null : "keys"))} title="Keyboard shortcuts (?)" aria-expanded={openPanel === "keys"}>
                <Keyboard />
              </button>
              <Popover open={openPanel === "keys"} onClose={closePanel} className="w-[300px] p-4">
                <p className="type-label mb-3">Keyboard shortcuts</p>
                <div className="flex flex-col gap-2">
                  {shortcuts.map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-3">
                      <span className="type-caption">{v}</span>
                      <kbd className="px-1.5 h-5 inline-flex items-center rounded-md border border-border bg-surface-secondary text-caption font-semibold text-text-secondary whitespace-nowrap">{k}</kbd>
                    </div>
                  ))}
                </div>
              </Popover>
            </div>

            <button className={toolBtn} onClick={() => void toggleFullscreen()} title={isFullscreen ? "Leave full screen (F or Esc)" : "Full screen (F)"} aria-label={isFullscreen ? "Leave full screen" : "Full screen"}>
              {isFullscreen ? <Shrink /> : <Expand />}
              <span className="hidden xl:inline">{isFullscreen ? "Exit full screen" : "Full screen"}</span>
            </button>
          </div>
        </div>

        {/* The view itself, with its side panel. */}
        <div className="flex gap-4 flex-1 min-h-0">
          {!graph ? (
            <div className="flex-1 rounded-xl bg-zinc-50 animate-pulse" />
          ) : view === "graph" ? (
            <GraphView graph={graph} selectedId={selected} onSelect={(id) => setParam("node", id)} className="flex-1 min-h-0" />
          ) : view === "3d" ? (
            <City3DView
              graph={graph}
              initialPath={selectedNode?.file ?? null}
              onSelectPath={onSelectFile}
              onOpenNode={(id) => setParams({ view: null, node: id })}
              className="flex-1 min-h-0"
            />
          ) : (
            <div className="flex-1 flex flex-col gap-3 min-w-0">
              <CityMap graph={graph} selectedId={selected} onSelect={(id) => setParam("node", id)} layerFilter={layer} fullscreen={false} className="flex-1 min-h-0" />
              {prefs.map.showLegend ? <CityLegend /> : null}
            </div>
          )}
          {/* The 3D city has its own file panel. */}
          {view !== "3d" && graph && selected ? (
            <NodePanel graph={graph} nodeId={selected} onSelect={(id) => setParam("node", id)} onClose={() => setParam("node", null)} />
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
