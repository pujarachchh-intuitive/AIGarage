"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Command, Search } from "lucide-react";
import { DATA_MODE, DEMO_REPOS } from "@/lib/api";
import { cn } from "@/lib/cn";
import { layerLabel } from "@/lib/layers";
import { useApp } from "@/lib/store";

export default function Navbar() {
  const router = useRouter();
  const graph = useApp((s) => s.graph);
  const repoId = useApp((s) => s.repoId);
  const setRepo = useApp((s) => s.setRepo);
  const repos = useApp((s) => s.repos);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    if (!graph) return [];
    const q = query.trim().toLowerCase();
    return graph.nodes
      .filter((n) => !q || n.name.toLowerCase().includes(q) || n.file.toLowerCase().includes(q))
      .slice(0, 8);
  }, [graph, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    setQuery("");
    router.push(`/city?node=${encodeURIComponent(id)}`);
  };

  return (
    <header className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-6 h-[60px] bg-background/80 backdrop-blur-md border-b border-border shrink-0 select-none">
      <div className="relative" ref={boxRef}>
        <button
          onClick={() => setOpen(true)}
          className="cursor-pointer flex items-center gap-2 w-[280px] h-10 px-3 border border-border rounded-lg bg-surface text-body text-text-tertiary shadow-2xs hover:border-border-strong transition-colors duration-150"
        >
          <Search className="size-4 text-icon-secondary" />
          <span className="flex-1 text-left">Find a component</span>
          <span className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded-md bg-surface-secondary border border-border text-[10px] font-semibold text-text-tertiary">
            <Command className="size-3" />K
          </span>
        </button>

        {open ? (
          <div className="absolute left-0 top-12 w-[420px] bg-surface border border-border rounded-2xl shadow-lg p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="relative">
              <Search className="size-4 text-icon-secondary absolute left-3 top-3" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") setCursor((c) => Math.min(c + 1, results.length - 1));
                  if (e.key === "ArrowUp") setCursor((c) => Math.max(c - 1, 0));
                  if (e.key === "Enter" && results[cursor]) go(results[cursor].id);
                }}
                placeholder="Table, column, job, endpoint, file…"
                className="h-10 w-full pl-9 pr-3 rounded-lg bg-surface-secondary text-body text-text-primary placeholder:text-text-tertiary focus:outline-none"
              />
            </div>
            <div className="flex flex-col mt-2 max-h-[320px] overflow-y-auto scroll-thin">
              {results.length === 0 ? (
                <p className="px-3 py-8 text-center type-caption">No components found</p>
              ) : (
                results.map((n, i) => (
                  <button
                    key={n.id}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(n.id)}
                    className={cn(
                      "cursor-pointer flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                      i === cursor ? "bg-surface-hover" : "hover:bg-surface-hover",
                    )}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-body font-semibold text-text-primary truncate">{n.name}</span>
                      <span className="type-caption truncate">{n.file}</span>
                    </div>
                    <span className="type-caption shrink-0">{layerLabel(graph, n.layer)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <div className="h-10 px-3 flex items-center gap-2 border border-border rounded-lg bg-surface shadow-2xs">
          <span
            className={cn(
              "size-1.5 rounded-full",
              DATA_MODE === "live" ? "bg-success" : "bg-warning",
            )}
          />
          <span className="text-body font-semibold text-text-primary">
            {DATA_MODE === "live" ? "Live backend" : "Demo data"}
          </span>
        </div>
        {DATA_MODE === "demo" || repos.length > 0 ? (
          <label className="relative h-10 pl-3 pr-8 flex flex-col justify-center border border-border rounded-lg bg-surface shadow-2xs leading-tight hover:border-border-strong transition-colors cursor-pointer">
            <span className="text-caption text-text-tertiary">Repository</span>
            <select
              value={repoId}
              onChange={(e) => {
                if (e.target.value === "__connect") {
                  router.push("/repos/new");
                  return;
                }
                void setRepo(e.target.value);
                router.push("/overview");
              }}
              className="appearance-none bg-transparent text-body font-semibold text-text-primary focus:outline-none cursor-pointer"
              aria-label="Choose repository"
            >
              {repos.length > 0 ? (
                <optgroup label="Your repositories">
                  {repos.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <optgroup label="Samples">
                {DEMO_REPOS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </optgroup>
              <option value="__connect">+ Connect a repository…</option>
            </select>
            <ChevronDown className="size-4 text-zinc-400 absolute right-2.5 top-3 pointer-events-none" />
          </label>
        ) : (
          <div className="h-10 px-3 flex flex-col justify-center border border-border rounded-lg bg-surface shadow-2xs leading-tight">
            <span className="text-caption text-text-tertiary">Repository</span>
            <span className="text-body font-semibold text-text-primary">{graph?.repo ?? "…"}</span>
          </div>
        )}
      </div>
    </header>
  );
}
