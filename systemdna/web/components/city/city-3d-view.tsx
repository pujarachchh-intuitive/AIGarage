"use client";

import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, X } from "lucide-react";
import { City3D, districtColor } from "@/components/city/city-3d";
import { Badge } from "@/components/ui/badge";
import { buildCityData, type CityFile } from "@/lib/city";
import { useCityPrefs } from "@/lib/city-prefs";
import { cn } from "@/lib/cn";
import { useIsDark } from "@/lib/theme";
import type { Graph } from "@/lib/types";

const LANDMARK_INFO = {
  entry: { label: "Entry point", body: "Where execution starts. Read these first.", swatch: "bg-info" },
  core: { label: "Core module", body: "Imported by the most files. Changing one ripples.", swatch: "bg-text-inverse ring-1 ring-text-primary" },
  hotspot: { label: "Hotspot", body: "Unusually large. Often where complexity hides.", swatch: "bg-warning" },
} as const;

const FORMS = [
  { id: "storage", name: "Vault", body: "Tables, columns, datasets." },
  { id: "transform", name: "Terraces", body: "SQL models and jobs that refine data." },
  { id: "logic", name: "Tower", body: "Modules, functions, models." },
  { id: "contract", name: "Prism", body: "Types, schemas, fields." },
  { id: "interface", name: "Broadcast", body: "Endpoints; the ring is the API it serves." },
  { id: "ui", name: "Pavilion", body: "Components and pages, in glass." },
  { id: "insight", name: "Observatory", body: "Dashboards, lit display on the roof." },
  { id: "business", name: "Dome", body: "Business processes." },
  { id: "quality", name: "Annex", body: "Tests and docs." },
] as const;

// Language bar uses zinc shades, like every chart in the design system.
const LANG_SHADES = ["var(--pie-1)", "var(--pie-3)", "var(--pie-5)", "var(--pie-6)", "var(--pie-4)", "var(--pie-2)"];

function Section({ title, count, children, defaultOpen = true }: { title: string; count?: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-b-0">
      <button onClick={() => setOpen(!open)} className="cursor-pointer w-full flex items-center justify-between px-4 py-3">
        <span className="type-label">{title}</span>
        <span className="flex items-center gap-2">
          {count !== undefined ? <span className="type-caption">{count}</span> : null}
          <ChevronDown className={cn("size-4 text-icon-secondary transition-transform", !open && "-rotate-90")} />
        </span>
      </button>
      {open ? <div className="px-4 pb-4 flex flex-col gap-3">{children}</div> : null}
    </div>
  );
}

function FileLink({ path, onSelect }: { path: string; onSelect: (p: string) => void }) {
  return (
    <button
      onClick={() => onSelect(path)}
      className="cursor-pointer w-full text-left px-2 py-1 rounded-md hover:bg-surface-hover text-body text-text-primary truncate transition-colors"
      title={path}
    >
      {path}
    </button>
  );
}

export function City3DView({
  graph,
  onOpenNode,
  initialPath,
  onSelectPath,
  className,
}: {
  graph: Graph;
  /** Opens a graph node in the 2D map. */
  onOpenNode?: (id: string) => void;
  /** File to select on open (for example the file of the node picked in another view). */
  initialPath?: string | null;
  onSelectPath?: (path: string | null) => void;
  className?: string;
}) {
  const data = useMemo(() => buildCityData(graph), [graph]);
  const isDark = useIsDark();
  const prefs = useCityPrefs((s) => s.city3d);
  const set3d = useCityPrefs((s) => s.set3d);
  const colorMode = prefs.colorMode;
  const setColorMode = (m: "zinc" | "folder") => set3d({ colorMode: m });
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  // Until the user clicks, follow the selection passed in from the other views.
  const selected = picked === undefined ? (initialPath && data.files.some((f) => f.path === initialPath) ? initialPath : null) : picked;
  const setSelected = (p: string | null) => {
    setPicked(p);
    onSelectPath?.(p);
  };
  const [focusDir, setFocusDir] = useState<string | null>(null);

  const file: CityFile | undefined = selected ? data.files.find((f) => f.path === selected) : undefined;
  const fileNodes = file ? graph.nodes.filter((n) => n.file === file.path && !n.parent) : [];
  const totalLangLines = data.languages.reduce((n, l) => n + l.lines, 0) || 1;

  return (
    <div className={cn("border border-border rounded-xl overflow-hidden flex flex-col bg-surface", className)}>
      <div className="flex flex-1 min-h-0">
        {/* Left: how to read the map */}
        <aside className="w-[248px] shrink-0 border-r border-border overflow-y-auto scroll-thin">
          <Section title="Reading the map">
            {[
              ["Height", prefs.height === "lines" ? "Lines of code, on a log scale." : "How many files import it, on a log scale."],
              prefs.style === "realistic"
                ? ["Buildings", "Glass towers are the biggest files, offices the middle, brick the smallest. Docs are brick."]
                : ["Form", "What a file holds decides its shape (see Forms below)."],
              prefs.style === "realistic" ? ["Blocks", "One city block per top-level folder, with streets between them."] : ["Plate", "One per top-level folder, engraved with its name."],
              ["Arcs", "Local imports. Pick a file to see what it uses and what uses it. Acid arcs are links Bob found that the parser missed."],
              ["Hover", "Any building shows its layer, lines, components, test coverage, users and owner."],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-col">
                <span className="text-body font-semibold text-text-primary">{k}</span>
                <span className="type-caption">{v}</span>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-surface-secondary border border-border">
              {(["zinc", "folder"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setColorMode(m)}
                  className={cn(
                    "cursor-pointer h-7 rounded-md text-caption font-semibold transition-colors",
                    colorMode === m ? "bg-surface text-text-primary shadow-2xs border border-border" : "text-text-tertiary hover:text-text-primary",
                  )}
                >
                  {m === "zinc" ? "Zinc" : "By folder"}
                </button>
              ))}
            </div>
          </Section>

          {prefs.style !== "realistic" ? (
            <Section title="Forms">
              {FORMS.filter((f) => data.files.some((x) => x.archetype === f.id)).map((f) => (
                <div key={f.id} className="flex flex-col">
                  <span className="text-body font-semibold text-text-primary">
                    {f.name} <span className="type-caption">{data.files.filter((x) => x.archetype === f.id).length}</span>
                  </span>
                  <span className="type-caption">{f.body}</span>
                </div>
              ))}
              <span className="type-caption">Hatching: untested share. Gold ring: personal data. Acid light: critical.</span>
            </Section>
          ) : null}

          <Section title="Landmarks">
            {(Object.keys(LANDMARK_INFO) as (keyof typeof LANDMARK_INFO)[]).map((k) => {
              const list = data.landmarks[k];
              return (
                <div key={k} className="flex gap-2.5">
                  <span className={cn("size-2.5 rotate-45 mt-1.5 shrink-0 rounded-[2px]", LANDMARK_INFO[k].swatch)} />
                  <div className="flex flex-col min-w-0">
                    <span className="text-body font-semibold text-text-primary">
                      {LANDMARK_INFO[k].label} <span className="type-caption">{list.length}</span>
                    </span>
                    <span className="type-caption">{LANDMARK_INFO[k].body}</span>
                    {list.map((p) => (
                      <button key={p} onClick={() => setSelected(p)} className="cursor-pointer text-left text-caption font-semibold text-text-secondary hover:text-text-primary truncate mt-0.5" title={p}>
                        {p.split("/").pop()}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </Section>

          <Section title="Districts" count={data.districts.length}>
            <div className="flex flex-col -mx-2">
              {data.districts.map((d, i) => (
                <button
                  key={d.dir}
                  onClick={() => setFocusDir(focusDir === d.dir ? null : d.dir)}
                  className={cn(
                    "cursor-pointer flex items-center justify-between gap-2 px-2 py-1.5 rounded-md transition-colors",
                    focusDir === d.dir ? "bg-surface-hover" : "hover:bg-surface-hover",
                  )}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="size-2.5 rounded-[3px] shrink-0" style={{ background: districtColor(i, colorMode, isDark) }} />
                    <span className="text-body text-text-primary truncate">{d.dir}</span>
                  </span>
                  <span className="type-caption">{d.files.length}</span>
                </button>
              ))}
            </div>
            {focusDir ? (
              <button onClick={() => setFocusDir(null)} className="cursor-pointer self-start text-caption font-semibold text-text-tertiary hover:text-text-primary">
                Show all districts
              </button>
            ) : null}
          </Section>
        </aside>

        {/* Centre: the city */}
        <City3D
          data={data}
          selected={selected}
          onSelect={setSelected}
          focusDir={focusDir}
          colorMode={colorMode}
          realistic={prefs.style === "realistic"}
          time={prefs.time === "auto" ? (isDark ? "night" : "day") : prefs.time}
          weather={prefs.weather}
          heightMode={prefs.height}
          arcs={prefs.arcs}
          labels={prefs.labels}
          autoRotate={prefs.autoRotate}
          className="flex-1 min-w-0"
        />

        {/* Right: the selected file */}
        {file ? (
          <aside className="w-[300px] shrink-0 border-l border-border flex flex-col min-h-0 animate-in fade-in slide-in-from-right-2 duration-150">
            <header className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-border">
              <div className="flex flex-col min-w-0">
                <span className="type-caption truncate">{file.dir}</span>
                <h3 className="type-heading truncate" title={file.path}>{file.path.split("/").pop()}</h3>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {file.landmark ? <Badge variant={file.landmark === "hotspot" ? "warning" : file.landmark === "entry" ? "info" : "neutral"}>{LANDMARK_INFO[file.landmark].label}</Badge> : null}
                  <Badge variant="neutral">{file.language}</Badge>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="cursor-pointer p-1.5 rounded-lg text-icon-secondary hover:text-text-primary hover:bg-surface-hover" aria-label="Close file panel">
                <X className="size-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto scroll-thin p-3 flex flex-col gap-4">
              <dl className="px-1 grid grid-cols-[88px_1fr] gap-y-2">
                <dt className="type-caption">Path</dt>
                <dd className="text-body text-text-primary break-all">{file.path}</dd>
                <dt className="type-caption">Lines</dt>
                <dd className="text-body text-text-primary">{file.lines}{data.estimated ? " (estimated)" : ""}</dd>
              </dl>
              <div className="flex flex-col gap-1">
                <p className="type-label px-1 flex items-center gap-1.5"><ArrowDownLeft className="size-3.5" /> Imports ({file.imports.length})</p>
                {file.imports.length === 0 ? <p className="px-1 type-caption">No local imports</p> : null}
                {file.imports.map((p) => <FileLink key={p} path={p} onSelect={setSelected} />)}
              </div>
              <div className="flex flex-col gap-1">
                <p className="type-label px-1 flex items-center gap-1.5"><ArrowUpRight className="size-3.5" /> Imported by ({file.importedBy.length})</p>
                {file.importedBy.length === 0 ? <p className="px-1 type-caption">Nothing imports this file</p> : null}
                {file.importedBy.map((p) => <FileLink key={p} path={p} onSelect={setSelected} />)}
              </div>
              {fileNodes.length > 0 && onOpenNode ? (
                <div className="flex flex-col gap-1">
                  <p className="type-label px-1">In the knowledge graph ({fileNodes.length})</p>
                  {fileNodes.slice(0, 30).map((n) => (
                    <button
                      key={n.id}
                      onClick={() => onOpenNode(n.id)}
                      className="cursor-pointer flex items-center justify-between gap-2 px-2 py-1 rounded-md hover:bg-surface-hover text-left transition-colors"
                    >
                      <span className="text-body text-text-primary truncate">{n.name}</span>
                      <span className="type-caption shrink-0">{n.type}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>

      {/* Bottom: stats and languages */}
      <footer className="flex items-center gap-6 px-4 h-11 border-t border-border shrink-0">
        {[
          ["Files", data.stats.files.toLocaleString()],
          ["Lines", data.stats.lines >= 1000 ? `${(data.stats.lines / 1000).toFixed(1)}k` : String(data.stats.lines)],
          ["Districts", String(data.stats.districts)],
          ["Links", String(data.stats.links)],
          ["Median file", `${data.stats.medianLines} lines`],
        ].map(([k, v]) => (
          <span key={k} className="type-caption whitespace-nowrap">
            {k} <span className="text-body font-semibold text-text-primary">{v}</span>
          </span>
        ))}
        {data.estimated ? <span className="type-caption whitespace-nowrap">Line counts estimated</span> : null}
        <div className="flex-1 flex h-1.5 rounded-full overflow-hidden bg-zinc-100 min-w-[80px]">
          {data.languages.map((l, i) => (
            <div key={l.language} style={{ width: `${(l.lines / totalLangLines) * 100}%`, background: LANG_SHADES[i % LANG_SHADES.length] }} title={`${l.language}: ${l.lines} lines`} />
          ))}
        </div>
        <div className="flex items-center gap-3">
          {data.languages.slice(0, 4).map((l, i) => (
            <span key={l.language} className="inline-flex items-center gap-1.5 type-caption whitespace-nowrap">
              <span className="size-2 rounded-full" style={{ background: LANG_SHADES[i % LANG_SHADES.length] }} />
              {l.language}
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
}
