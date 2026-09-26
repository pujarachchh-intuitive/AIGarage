// Data for the 3D city view: one building per file, one plate per top-level folder.

import type { Graph, RepoFile } from "@/lib/types";

export interface CityFile extends RepoFile {
  importedBy: string[];
  landmark?: "entry" | "core" | "hotspot";
}

export interface CityData {
  files: CityFile[];
  districts: { dir: string; files: CityFile[] }[];
  links: { from: string; to: string }[];
  stats: { files: number; lines: number; districts: number; links: number; medianLines: number };
  languages: { language: string; lines: number }[];
  landmarks: { entry: string[]; core: string[]; hotspot: string[] };
  /** True when line counts are guessed (hand-made graphs without scanner file data). */
  estimated: boolean;
}

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript",
  py: "python", sql: "sql", md: "markdown", pdf: "document", yaml: "yaml", yml: "yaml", json: "json",
};

/** Files for graphs that have no scanner file data: derived from nodes and edges. */
function estimateFiles(graph: Graph): RepoFile[] {
  const byFile = new Map<string, { nodes: number; imports: Set<string> }>();
  const fileOf = new Map(graph.nodes.map((n) => [n.id, n.file]));
  for (const n of graph.nodes) {
    const e = byFile.get(n.file) ?? { nodes: 0, imports: new Set<string>() };
    e.nodes += 1;
    byFile.set(n.file, e);
  }
  for (const e of graph.edges) {
    const from = fileOf.get(e.from);
    const to = fileOf.get(e.to);
    if (from && to && from !== to) byFile.get(to)?.imports.add(from);
  }
  return [...byFile.entries()].map(([path, e]) => ({
    path,
    dir: path.includes("/") ? path.split("/")[0] : "root",
    lines: 20 + e.nodes * 18 + e.imports.size * 6,
    language: LANGUAGE_BY_EXT[path.split(".").pop() ?? ""] ?? "other",
    imports: [...e.imports],
  }));
}

const ENTRY_PATTERNS = [/^app\/layout\.[jt]sx?$/, /^app\/page\.[jt]sx?$/, /^src\/main\.[jt]sx?$/, /^pages\/_app\.[jt]sx?$/, /^index\.[jt]sx?$/, /main\.py$/];

export function buildCityData(graph: Graph): CityData {
  const estimated = !graph.files;
  const raw = graph.files ?? estimateFiles(graph);
  const importedBy = new Map<string, string[]>();
  for (const f of raw) for (const i of f.imports) importedBy.set(i, [...(importedBy.get(i) ?? []), f.path]);
  const files: CityFile[] = raw.map((f) => ({ ...f, importedBy: importedBy.get(f.path) ?? [] }));

  const sortedLines = files.map((f) => f.lines).sort((a, b) => a - b);
  const medianLines = sortedLines.length ? sortedLines[Math.floor(sortedLines.length / 2)] : 0;

  // Landmarks, as in the reference design.
  const entry = ENTRY_PATTERNS.map((re) => files.find((f) => re.test(f.path))).find(Boolean);
  const core = [...files]
    .filter((f) => f.importedBy.length >= 3)
    .sort((a, b) => b.importedBy.length - a.importedBy.length)
    .slice(0, 2);
  const hotspot = [...files]
    .filter((f) => f.lines > medianLines * 2.5 && f.language !== "markdown" && !core.includes(f) && f !== entry)
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 2);
  for (const f of hotspot) f.landmark = "hotspot";
  for (const f of core) f.landmark = "core";
  if (entry) entry.landmark = "entry";

  const byDir = new Map<string, CityFile[]>();
  for (const f of files) byDir.set(f.dir, [...(byDir.get(f.dir) ?? []), f]);
  const districts = [...byDir.entries()]
    .map(([dir, fs]) => ({ dir, files: fs.sort((a, b) => b.lines - a.lines) }))
    .sort((a, b) => b.files.length - a.files.length);

  const links = files.flatMap((f) => f.imports.map((to) => ({ from: f.path, to })));
  const langMap = new Map<string, number>();
  for (const f of files) langMap.set(f.language, (langMap.get(f.language) ?? 0) + f.lines);

  return {
    files,
    districts,
    links,
    stats: {
      files: files.length,
      lines: files.reduce((n, f) => n + f.lines, 0),
      districts: districts.length,
      links: links.length,
      medianLines,
    },
    languages: [...langMap.entries()].map(([language, lines]) => ({ language, lines })).sort((a, b) => b.lines - a.lines),
    landmarks: {
      entry: entry ? [entry.path] : [],
      core: core.map((f) => f.path),
      hotspot: hotspot.map((f) => f.path),
    },
    estimated,
  };
}

/** Building height in scene units: lines of code on a log scale. */
export function buildingHeight(lines: number) {
  return 1.2 + 5.2 * Math.log10(lines + 1);
}

export const CELL = 3.2;
export const FOOTPRINT = 2;
const PLATE_PAD = 1.6;
const DISTRICT_GAP = 5;

export interface PlacedDistrict {
  dir: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface CityLayout {
  districts: PlacedDistrict[];
  positions: Map<string, { x: number; z: number; h: number }>;
  size: { w: number; d: number };
}

/** Packs district plates in rows, and files in a grid on each plate. */
export function layoutCity(data: CityData): CityLayout {
  const plates = data.districts.map((d) => {
    const cols = Math.ceil(Math.sqrt(d.files.length));
    const rows = Math.ceil(d.files.length / cols);
    return { d, cols, w: cols * CELL + PLATE_PAD * 2, depth: rows * CELL + PLATE_PAD * 2 };
  });
  const totalArea = plates.reduce((n, p) => n + (p.w + DISTRICT_GAP) * (p.depth + DISTRICT_GAP), 0);
  const maxRow = Math.max(Math.sqrt(totalArea) * 1.25, ...plates.map((p) => p.w));

  const districts: PlacedDistrict[] = [];
  const positions = new Map<string, { x: number; z: number; h: number }>();
  let x = 0;
  let z = 0;
  let rowDepth = 0;
  let width = 0;
  for (const p of plates) {
    if (x > 0 && x + p.w > maxRow) {
      x = 0;
      z += rowDepth + DISTRICT_GAP;
      rowDepth = 0;
    }
    districts.push({ dir: p.d.dir, x, z, w: p.w, d: p.depth });
    p.d.files.forEach((f, i) => {
      const cx = x + PLATE_PAD + (i % p.cols) * CELL + CELL / 2;
      const cz = z + PLATE_PAD + Math.floor(i / p.cols) * CELL + CELL / 2;
      positions.set(f.path, { x: cx, z: cz, h: buildingHeight(f.lines) });
    });
    x += p.w + DISTRICT_GAP;
    width = Math.max(width, x - DISTRICT_GAP);
    rowDepth = Math.max(rowDepth, p.depth);
  }
  const depth = z + rowDepth;

  // Centre the city on the origin.
  const ox = width / 2;
  const oz = depth / 2;
  for (const d of districts) {
    d.x -= ox;
    d.z -= oz;
  }
  for (const pos of positions.values()) {
    pos.x -= ox;
    pos.z -= oz;
  }
  return { districts, positions, size: { w: width, d: depth } };
}
