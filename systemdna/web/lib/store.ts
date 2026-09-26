"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DATA_MODE, DEMO_REPOS, fetchGraph, listConnectedRepos } from "@/lib/api";
import type { Change, ConnectedRepo, Graph, PullRequestRef, RunEvent } from "@/lib/types";

interface AppState {
  graph: Graph | null;
  graphError: string | null;
  changes: Change[];
  hydrated: boolean;
  /** The repo on screen: a sample id or a connected repo id. */
  repoId: string;
  setRepo: (id: string) => Promise<void>;
  /** Repositories the user connected. */
  repos: ConnectedRepo[];
  loadRepos: () => Promise<void>;
  loadGraph: () => Promise<void>;
  addChange: (change: Change) => void;
  appendEvent: (ev: RunEvent) => void;
  resetEvents: (changeId: string) => void;
  setPullRequest: (changeId: string, pr: PullRequestRef) => void;
  resetDemo: () => void;
  nextChangeId: () => string;
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      graph: null,
      graphError: null,
      changes: [],
      hydrated: false,
      repoId: DEMO_REPOS[0].id,
      setRepo: async (id) => {
        set({ repoId: id, graph: null });
        await get().loadGraph();
      },
      repos: [],
      loadRepos: async () => {
        try {
          set({ repos: await listConnectedRepos() });
        } catch {
          set({ repos: [] });
        }
      },
      loadGraph: async () => {
        if (get().graph) return;
        try {
          set({ graph: await fetchGraph(get().repoId), graphError: null });
        } catch (err) {
          set({ graphError: err instanceof Error ? err.message : "Could not load the graph" });
        }
      },
      addChange: (change) => set((s) => ({ changes: [change, ...s.changes] })),
      appendEvent: (ev) =>
        set((s) => ({
          changes: s.changes.map((c) =>
            c.id === ev.change_id ? { ...c, events: [...c.events, ev] } : c,
          ),
        })),
      resetEvents: (changeId) =>
        set((s) => ({
          changes: s.changes.map((c) => (c.id === changeId ? { ...c, events: [] } : c)),
        })),
      setPullRequest: (changeId, pr) =>
        set((s) => ({ changes: s.changes.map((c) => (c.id === changeId ? { ...c, pullRequest: pr } : c)) })),
      resetDemo: () => set({ changes: [] }),
      nextChangeId: () => {
        const max = get().changes.reduce((m, c) => {
          const n = Number(c.id.replace(/\D/g, ""));
          return Number.isFinite(n) ? Math.max(m, n) : m;
        }, 0);
        return `chg-${String(max + 1).padStart(3, "0")}`;
      },
    }),
    {
      name: `systemdna-${DATA_MODE}`,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ changes: s.changes, repoId: s.repoId }),
      skipHydration: true,
      onRehydrateStorage: () => () => useApp.setState({ hydrated: true }),
    },
  ),
);

/** Changes that belong to the repo on screen. Older saved changes had no repo: they are ShopFlow's. */
export function useRepoChanges(): Change[] {
  const changes = useApp((s) => s.changes);
  const repo = useApp((s) => s.graph?.repo);
  return useMemo(
    () => (repo ? changes.filter((c) => (c.repo ?? "samples/shopflow") === repo) : []),
    [changes, repo],
  );
}

export function useChange(id: string | undefined) {
  return useApp((s) => s.changes.find((c) => c.id === id));
}
