"use client";

// Agent City preferences, saved in this browser (localStorage).
// Each view reads its own slice. Reset puts everything back to the defaults.

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type CityView = "map" | "3d" | "graph";

export interface GraphPrefs {
  showFields: boolean;
  showContains: boolean;
  showOrphans: boolean;
  arrows: boolean;
  colorByLayer: boolean;
  nodeSize: number;
  linkWidth: number;
  labelZoom: number;
  center: number;
  repel: number;
  linkStrength: number;
  linkDistance: number;
  /** Obsidian-style local graph: only nodes within N hops of the selected node. 0 = off. */
  localDepth: 0 | 1 | 2 | 3;
  /** Draw the graph as a galaxy: stars, planets, nebulae and comets. */
  space: boolean;
  /** Space theme: the galaxy turns slowly on its own. */
  autoRotate: boolean;
}

export interface CityPrefs {
  /** Which view opens when you visit Agent City without choosing one. */
  startView: CityView | "last";
  lastView: CityView;
  map: { showLegend: boolean };
  city3d: {
    /** Realistic (textures, roads, trees, cars, shadows) or the clean schematic look. */
    style: "realistic" | "schematic";
    /** Light for the realistic look. "auto" follows the app's light or dark theme. */
    time: "auto" | "day" | "dusk" | "night";
    /** Weather for the realistic look. */
    weather: "clear" | "rain";
    colorMode: "zinc" | "folder";
    /** What building height shows. */
    height: "lines" | "imports";
    arcs: "all" | "selected" | "none";
    labels: "landmarks" | "all" | "none";
    autoRotate: boolean;
  };
  graph: GraphPrefs;
}

export const GRAPH_DEFAULTS: GraphPrefs = {
  showFields: true,
  showContains: true,
  showOrphans: true,
  arrows: false,
  colorByLayer: false,
  nodeSize: 1,
  linkWidth: 1,
  labelZoom: 2.2,
  center: 0.05,
  repel: 90,
  linkStrength: 0.7,
  linkDistance: 36,
  localDepth: 0,
  space: true,
  autoRotate: true,
};

export const PREF_DEFAULTS: CityPrefs = {
  startView: "last",
  lastView: "map",
  map: { showLegend: true },
  city3d: { style: "realistic", time: "auto", weather: "clear", colorMode: "zinc", height: "lines", arcs: "all", labels: "landmarks", autoRotate: false },
  graph: GRAPH_DEFAULTS,
};

interface PrefsState extends CityPrefs {
  setMap: (p: Partial<CityPrefs["map"]>) => void;
  set3d: (p: Partial<CityPrefs["city3d"]>) => void;
  setGraph: (p: Partial<GraphPrefs>) => void;
  setStartView: (v: CityPrefs["startView"]) => void;
  setLastView: (v: CityView) => void;
  reset: () => void;
}

export const useCityPrefs = create<PrefsState>()(
  persist(
    (set) => ({
      ...PREF_DEFAULTS,
      setMap: (p) => set((s) => ({ map: { ...s.map, ...p } })),
      set3d: (p) => set((s) => ({ city3d: { ...s.city3d, ...p } })),
      setGraph: (p) => set((s) => ({ graph: { ...s.graph, ...p } })),
      setStartView: (startView) => set({ startView }),
      setLastView: (lastView) => set({ lastView }),
      reset: () => set({ ...PREF_DEFAULTS }),
    }),
    {
      name: "systemdna-city-prefs",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      // Older saved prefs may miss new keys: fill them from the defaults.
      merge: (saved, current) => {
        const s = (saved ?? {}) as Partial<CityPrefs>;
        return {
          ...current,
          ...s,
          map: { ...current.map, ...s.map },
          city3d: { ...current.city3d, ...s.city3d },
          graph: { ...current.graph, ...s.graph },
        };
      },
    },
  ),
);
