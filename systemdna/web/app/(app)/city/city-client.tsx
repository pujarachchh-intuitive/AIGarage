"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, GitBranch } from "lucide-react";
import { CityLegend } from "@/components/city/city-legend";
import { CityMap } from "@/components/city/city-map";
import { NodePanel } from "@/components/city/node-panel";
import { PageHeader, PageShell, PrimaryLink } from "@/components/ui/page";
import { useApp } from "@/lib/store";
import type { LayerId } from "@/lib/types";

export function CityClient() {
  const graph = useApp((s) => s.graph);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = params.get("node");
  const layer = (params.get("layer") as LayerId | null) ?? "all";

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
        title="Agent City"
        subtitle={
          counts
            ? `Every component and dependency in ${graph?.repo}: ${counts.nodes} components, ${counts.edges} dependencies, ${counts.bob} found by Bob.`
            : "Loading the knowledge graph…"
        }
        actions={
          <>
            <div className="relative">
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
    </PageShell>
  );
}
