"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Loader2, Play, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { CityLegend } from "@/components/city/city-legend";
import { CityMap } from "@/components/city/city-map";
import {
  AffectedTable,
  BusinessCard,
  GrepCard,
  ImpactKpis,
  WavesCard,
} from "@/components/changes/impact-report";
import { Card, PageHeader, PageShell, inputClass, primaryButton, secondaryButton } from "@/components/ui/page";
import { analyseChange, DATA_MODE, demoRepo, runChange } from "@/lib/api";
import { CHANGEABLE, changeTitle, KINDS, kindsFor, symbolName, validateChange } from "@/lib/changes";
import { cn } from "@/lib/cn";
import { useApp } from "@/lib/store";
import type { ChangeKind, Graph, ImpactReport, NodeType, Severity } from "@/lib/types";

const CHANGEABLE_SET = new Set<NodeType>(CHANGEABLE);
const TYPE_LABEL: Partial<Record<NodeType, string>> = {
  TSField: "field",
  Column: "column",
  Field: "field",
  Table: "table",
  TSType: "type",
  Function: "function",
  Constant: "constant",
  Dataset: "dataset",
  Component: "component",
};

/** How long the "AI is working" scan plays at least. The real analysis takes a few ms. */
const SCAN_MS = 2600;

/** The analysis, told as steps that tick off while the map scan plays. */
function AnalysisSteps({ graph, field }: { graph: Graph; field: string }) {
  const steps = [
    `Load the knowledge graph (${graph.nodes.length} components, ${graph.edges.length} links)`,
    `Find every reference to ${field}`,
    "Follow imports, types, string keys and docs",
    "Score the risk and plan fix waves",
  ];
  const [done, setDone] = useState(0);
  useEffect(() => {
    const step = SCAN_MS / steps.length;
    const timers = steps.map((_, i) => setTimeout(() => setDone(i + 1), step * (i + 1) - 120));
    return () => timers.forEach(clearTimeout);
    // The steps only depend on how many there are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <ol className="flex flex-col gap-2 px-3.5 py-3 rounded-xl border border-border bg-surface-secondary animate-in fade-in slide-in-from-top-1 duration-300">
      {steps.map((text, i) => {
        const state = i < done ? "done" : i === done ? "active" : "waiting";
        return (
          <li key={i} className={cn("flex items-start gap-2 text-body transition-colors duration-300", state === "waiting" ? "text-text-tertiary" : "text-text-primary")}>
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
              {state === "done" ? (
                <Check className="size-4 text-success animate-in zoom-in duration-200" />
              ) : state === "active" ? (
                <Loader2 className="size-4 text-brand-text animate-spin" />
              ) : (
                <span className="size-1.5 rounded-full bg-border-strong" />
              )}
            </span>
            <span className={cn(state === "active" && "font-semibold")}>{text}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function NewChangeClient() {
  const router = useRouter();
  const params = useSearchParams();
  const graph = useApp((s) => s.graph);
  const addChange = useApp((s) => s.addChange);
  const nextChangeId = useApp((s) => s.nextChangeId);
  const repoId = useApp((s) => s.repoId);
  // Samples have a preset demo change; connected repos start on their first field or column.
  const firstField = (graph?.nodes.find((n) => n.type === "Column" || n.type === "TSField") ?? graph?.nodes.find((n) => CHANGEABLE_SET.has(n.type)))?.id ?? "";
  const defaults = demoRepo(repoId)?.defaultChange ?? { node: firstField, to: "" };

  const [picked, setNodeId] = useState<string | null>(params.get("node"));
  const [pickedKind, setKind] = useState<ChangeKind>("rename");
  const [typed, setTo] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  // Fall back to the repo's demo change until the user picks something.
  const nodeId = picked && graph?.nodes.some((n) => n.id === picked) ? picked : defaults.node;
  const [busy, setBusy] = useState(false);
  // The node the AI scan starts from while the analysis runs.
  const [scanning, setScanning] = useState<string | null>(null);
  const [result, setResult] = useState<{ report: ImpactReport; changeId?: string } | null>(null);
  const [rippleKey, setRippleKey] = useState(0);

  const options = useMemo(
    () =>
      (graph?.layers ?? []).map((l) => ({
        layer: l,
        nodes: (graph?.nodes ?? []).filter((n) => n.layer === l.id && CHANGEABLE_SET.has(n.type)),
      })).filter((g) => g.nodes.length > 0),
    [graph],
  );

  const node = graph?.nodes.find((n) => n.id === nodeId);
  const kinds = kindsFor(node?.type);
  // A kind that does not apply to the picked component falls back to Rename.
  const kind: ChangeKind = kinds.some((k) => k.id === pickedKind) ? pickedKind : "rename";
  const kindDef = KINDS.find((k) => k.id === kind)!;
  const to = typed ?? (nodeId === defaults.node && kind === "rename" ? defaults.to : "");
  const oldName = node ? symbolName(node) : "";
  const nameError = validateChange(node, kind, kindDef.input ? to : "", description);
  const reset = () => setResult(null);

  const severity = useMemo(() => {
    if (!result) return undefined;
    return Object.fromEntries(result.report.items.map((i) => [i.nodeId, i.severity])) as Record<string, Severity>;
  }, [result]);

  const analyse = async () => {
    if (!graph || !node || nameError) return;
    setBusy(true);
    setResult(null);
    setScanning(node.id);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      // Let the scan play out, so the user sees the AI walk the graph.
      const [res] = await Promise.all([
        analyseChange(graph, {
          node: node.id,
          change: kind,
          to: kindDef.input ? to.trim() : "",
          ...(description.trim() ? { description: description.trim() } : {}),
        }),
        new Promise((r) => setTimeout(r, reduced ? 0 : SCAN_MS)),
      ]);
      setResult(res);
      setRippleKey((k) => k + 1);
    } catch (err) {
      toast.error("Impact analysis failed", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setScanning(null);
      setBusy(false);
    }
  };

  const approveAndRun = async () => {
    if (!result || !node) return;
    const id = result.changeId ?? nextChangeId();
    try {
      if (DATA_MODE === "live") await runChange(id);
      addChange({
        id,
        repo: graph?.repo,
        title: changeTitle(node, result.report.request),
        request: result.report.request,
        report: result.report,
        createdAt: new Date().toISOString(),
        mode: DATA_MODE,
        events: [],
      });
      router.push(`/changes/${id}`);
    } catch (err) {
      toast.error("Could not start the change", { description: err instanceof Error ? err.message : undefined });
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="New change"
        subtitle="Pick a component and describe the change. SystemDNA shows the full ripple before anything is edited."
        actions={
          result ? (
            <>
              <button className={secondaryButton} onClick={() => setResult(null)}>
                <RotateCcw />
                Start over
              </button>
              <button className={primaryButton} onClick={approveAndRun}>
                <Play />
                Approve plan and run
              </button>
            </>
          ) : null
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card title="Change request" subtitle="Rename, change a type or signature, delete, or describe any change." className="lg:col-span-4 h-fit">
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="type-label">Component</span>
              <div className="relative">
                <select
                  value={nodeId}
                  onChange={(e) => {
                    setNodeId(e.target.value);
                    setTo(null);
                    reset();
                  }}
                  className={cn(inputClass, "appearance-none pr-9 cursor-pointer")}
                >
                  {options.map((g) => (
                    <optgroup key={g.layer.id} label={g.layer.label}>
                      {g.nodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name} · {TYPE_LABEL[n.type] ?? n.type}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="size-4 text-icon-secondary absolute right-3 top-3 pointer-events-none" />
              </div>
              {node ? <span className="type-caption">{node.line ? `${node.file}:${node.line}` : node.file}</span> : null}
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="type-label">Change</span>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-surface-secondary border border-border">
                {KINDS.map((k) => {
                  const enabled = kinds.some((x) => x.id === k.id);
                  return (
                    <button
                      key={k.id}
                      disabled={!enabled}
                      onClick={() => {
                        setKind(k.id);
                        setTo(null);
                        reset();
                      }}
                      title={enabled ? undefined : `Not available for a ${TYPE_LABEL[node?.type ?? "Field"] ?? "component"}`}
                      className={cn(
                        "h-8 rounded-md text-body font-semibold transition-colors",
                        kind === k.id ? "bg-surface text-text-primary shadow-2xs border border-border" : "text-text-tertiary",
                        enabled ? "cursor-pointer hover:text-text-primary" : "opacity-50 cursor-not-allowed",
                      )}
                    >
                      {k.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {kindDef.input ? (
              <label className="flex flex-col gap-1.5">
                <span className="type-label">{kindDef.input.label}</span>
                <input
                  value={to}
                  onChange={(e) => {
                    setTo(kind === "rename" ? e.target.value.trim() : e.target.value);
                    reset();
                  }}
                  onKeyDown={(e) => e.key === "Enter" && void analyse()}
                  className={cn(inputClass, kind === "signature" && "font-mono text-caption")}
                  placeholder={kind === "signature" && node ? `${oldName}(…): …` : kindDef.input.placeholder}
                />
                <span className={cn("type-caption", nameError && to.length > 0 && "text-error")}>
                  {nameError && to.length > 0
                    ? nameError
                    : kind === "rename"
                      ? `${oldName || "…"} → ${to || "…"}`
                      : kind === "type_change"
                        ? `${node?.name ?? "…"} becomes ${to || "…"}`
                        : `Callers of ${oldName || "…"} will be updated to the new signature.`}
                </span>
              </label>
            ) : kind === "delete" ? (
              <p className="type-caption">
                Removes <span className="font-semibold text-text-primary">{node?.name}</span>. Every direct user must stop using it; the agents decide how, following your notes below.
              </p>
            ) : null}

            <label className="flex flex-col gap-1.5">
              <span className="type-label">{kind === "custom" ? "Describe the change" : "Notes for the agents (optional)"}</span>
              <textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  reset();
                }}
                rows={kind === "custom" ? 4 : 2}
                className={cn(inputClass, "h-auto py-2 resize-y")}
                placeholder={
                  kind === "custom"
                    ? `For example: split ${oldName || "fullName"} into firstName and lastName, keeping existing data.`
                    : kind === "delete"
                      ? "For example: use displayName instead."
                      : "Anything the agents should know."
                }
              />
              {kind === "custom" && nameError && description.length > 0 ? <span className="type-caption text-error">{nameError}</span> : null}
            </label>

            <button className={cn(primaryButton, "justify-center", busy && "ai-working disabled:opacity-100")} disabled={!graph || !!nameError || busy} onClick={analyse}>
              <Sparkles className={cn(busy && "animate-pulse")} />
              {busy ? "AI is analysing the impact…" : "Analyse impact"}
            </button>
            {busy && graph ? <AnalysisSteps graph={graph} field={oldName} /> : null}
            {result ? (
              <p className="type-caption">
                Analysed in {result.report.computedMs} ms across {graph?.nodes.length} components.
              </p>
            ) : null}
          </div>
        </Card>

        <div className="lg:col-span-8 flex flex-col gap-3">
          {graph ? (
            <CityMap
              graph={graph}
              severity={severity}
              revealLevels={result?.report.levels}
              rippleKey={rippleKey}
              selectedId={null}
              scanning={scanning}
              className={cn("h-[460px] transition-shadow duration-500", scanning && "ai-glow")}
            />
          ) : (
            <div className="h-[460px] rounded-xl bg-surface-secondary animate-pulse" />
          )}
          <CityLegend />
        </div>
      </div>

      {result && graph ? (
        <div key={rippleKey} className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-3 duration-500">
          <ImpactKpis report={result.report} />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 flex flex-col gap-3">
              <h2 className="type-heading">Affected components</h2>
              <AffectedTable report={result.report} graph={graph} />
            </div>
            <div className="lg:col-span-4 flex flex-col gap-6">
              <WavesCard report={result.report} />
              <BusinessCard report={result.report} />
              <GrepCard report={result.report} />
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
