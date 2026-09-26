"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { primaryButton } from "@/components/ui/page";
import { cn } from "@/lib/cn";
import { indexGraph } from "@/lib/impact";
import { layerLabel } from "@/lib/layers";
import type { Graph, GraphEdge } from "@/lib/types";

const RENAMEABLE = new Set(["Column", "Field", "TSField"]);

function EdgeRow({ edge, otherId, graph, onSelect }: { edge: GraphEdge; otherId: string; graph: Graph; onSelect: (id: string) => void }) {
  const other = graph.nodes.find((n) => n.id === otherId);
  return (
    <button
      onClick={() => onSelect(otherId)}
      className="cursor-pointer w-full flex items-start justify-between gap-3 px-3 py-2 rounded-lg hover:bg-surface-hover text-left transition-colors"
    >
      <div className="flex flex-col min-w-0">
        <span className="text-body font-semibold text-text-primary truncate">{other?.name ?? otherId}</span>
        <span className="type-caption truncate">
          {edge.type.replace("_", " ").toLowerCase()} · {edge.evidence}
        </span>
      </div>
      {edge.source === "bob" ? (
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider px-1.5 py-px rounded-sm bg-brand-soft text-brand-text">Found by Bob</span>
      ) : null}
    </button>
  );
}

export function NodePanel({
  graph,
  nodeId,
  onSelect,
  onClose,
}: {
  graph: Graph;
  nodeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const { byId, out, incoming } = indexGraph(graph);
  const node = byId.get(nodeId);
  if (!node) return null;
  const asset = node.parent ? byId.get(node.parent) : undefined;
  const fields = graph.nodes.filter((n) => n.parent === node.id);
  const ups = incoming.get(node.id) ?? [];
  const downs = out.get(node.id) ?? [];
  const facts: [string, string][] = [
    ["Type", node.type],
    ["Layer", layerLabel(graph, node.layer)],
    ["File", node.line ? `${node.file}:${node.line}` : node.file],
    ["Owner", node.owner ?? "Unknown"],
    ["Criticality", node.criticality[0].toUpperCase() + node.criticality.slice(1)],
  ];

  return (
    <aside className="w-[340px] shrink-0 border border-border rounded-2xl bg-surface flex flex-col min-h-0 animate-in fade-in slide-in-from-right-2 duration-150">
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-border">
        <div className="flex flex-col min-w-0">
          <span className="type-caption">{asset ? asset.name : layerLabel(graph, node.layer)}</span>
          <h2 className="type-heading truncate">{node.name}</h2>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {node.pii || asset?.pii ? <Badge variant="warning">Personal data</Badge> : null}
            {(asset ?? node).tested ? <Badge variant="success">Tested</Badge> : <Badge variant="neutral">No tests</Badge>}
          </div>
        </div>
        <button
          onClick={onClose}
          className="cursor-pointer p-1.5 rounded-lg text-icon-secondary hover:text-text-primary hover:bg-surface-hover"
          aria-label="Close panel"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto scroll-thin px-2 py-3 flex flex-col gap-4">
        <dl className="px-3 grid grid-cols-[96px_1fr] gap-y-2">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="type-caption">{k}</dt>
              <dd className="text-body text-text-primary truncate">{v}</dd>
            </div>
          ))}
        </dl>

        {fields.length > 0 ? (
          <div className="flex flex-col gap-1">
            <p className="type-label px-3">Fields ({fields.length})</p>
            {fields.map((f) => (
              <button
                key={f.id}
                onClick={() => onSelect(f.id)}
                className="cursor-pointer px-3 py-1.5 rounded-lg hover:bg-surface-hover text-left text-body text-text-primary transition-colors"
              >
                {f.name}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <p className="type-label px-3 flex items-center gap-1.5">
            <ArrowDownLeft className="size-3.5" /> Depends on ({ups.length})
          </p>
          {ups.length === 0 ? <p className="px-3 type-caption">Nothing upstream</p> : null}
          {ups.map((e) => (
            <EdgeRow key={e.id} edge={e} otherId={e.from} graph={graph} onSelect={onSelect} />
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <p className="type-label px-3 flex items-center gap-1.5">
            <ArrowUpRight className="size-3.5" /> Used by ({downs.length})
          </p>
          {downs.length === 0 ? <p className="px-3 type-caption">Nothing downstream</p> : null}
          {downs.map((e) => (
            <EdgeRow key={e.id} edge={e} otherId={e.to} graph={graph} onSelect={onSelect} />
          ))}
        </div>
      </div>

      {RENAMEABLE.has(node.type) ? (
        <footer className="p-4 border-t border-border">
          <Link href={`/changes/new?node=${encodeURIComponent(node.id)}`} className={cn(primaryButton, "w-full justify-center")}>
            Plan a change to {node.name.split(".").pop()}
          </Link>
        </footer>
      ) : null}
    </aside>
  );
}
