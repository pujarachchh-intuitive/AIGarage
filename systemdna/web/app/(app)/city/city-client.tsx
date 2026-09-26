"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Box, ChevronDown, GitBranch, Network } from "lucide-react";
import { CityLegend } from "@/components/city/city-legend";
import { City3DView } from "@/components/city/city-3d-view";
import { CityMap } from "@/components/city/city-map";
import { NodePanel } from "@/components/city/node-panel";
import { PageHeader, PageShell, PrimaryLink } from "@/components/ui/page";
import { cn } from "@/lib/cn";
import { useApp } from "@/lib/store";
import type { LayerId } from "@/lib/types";

export function CityClient() {
  const graph = useApp((s) => s.graph);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = params.get("node");
  const layer = (params.get("layer") as LayerId | null) ?? "all";
  const view = params.get("view") === "3d" ? "3d" : "map";
  const isReplay = params.get("mode") === "replay";

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const counts = useMemo(() => {
    if (!graph) return null;
    return {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      bob: graph.edges.filter((e) => e.source === "bob").length,
    };
  }, [graph]);

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
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-surface-secondary border border-border" role="tablist" aria-label="City view">
              {(
                [
                  ["map", "Dependency map", Network],
                  ["3d", "3D city", Box],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setParam("view", id === "map" ? null : id)}
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
            <div className={cn("relative", view === "3d" && "hidden")}>
              <select
                value={layer}
                onChange={(e) => setParam("layer", e.target.value === "all" ? null : e.target.value)}
                className="cursor-pointer appearance-none h-10 pl-3 pr-9 border border-border rounded-lg bg-surface text-body font-semibold text-text-primary shadow-2xs focus:outline-none focus:border-border-strong"
                aria-label="Filter by district"
              >
                <option value="all">All districts</option>
                {(graph?.layers ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="size-4 text-zinc-400 absolute right-3 top-3 pointer-events-none" />
            </div>
            <PrimaryLink href={selected ? `/changes/new?node=${encodeURIComponent(selected)}` : "/changes/new"}>
              <GitBranch />
              New change
            </PrimaryLink>
          </>
        }
      />

      {view === "3d" ? (
        graph ? (
          <City3DView
            graph={graph}
            onOpenNode={(id) => {
              const next = new URLSearchParams(params.toString());
              next.delete("view");
              next.set("node", id);
              router.replace(`${pathname}?${next.toString()}`, { scroll: false });
            }}
            className="flex-1 min-h-[600px]"
          />
        ) : (
          <div className="flex-1 min-h-[600px] rounded-xl bg-zinc-50 animate-pulse" />
        )
      ) : (
      <div className="flex gap-4 flex-1 min-h-[560px]">
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {graph ? (
            <CityMap
              graph={graph}
              selectedId={selected}
              onSelect={(id) => setParam("node", id)}
              layerFilter={layer}
              className="flex-1 min-h-[520px]"
            />
          ) : (
            <div className="flex-1 min-h-[520px] rounded-xl bg-zinc-50 animate-pulse" />
          )}
          <CityLegend />
        </div>
        {graph && selected ? (
          <NodePanel
            graph={graph}
            nodeId={selected}
            onSelect={(id) => setParam("node", id)}
            onClose={() => setParam("node", null)}
          />
        ) : null}
      </div>
      )}
    </PageShell>
  );
}
