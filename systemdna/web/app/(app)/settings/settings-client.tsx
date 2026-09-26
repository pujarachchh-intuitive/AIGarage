"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, PageHeader, PageShell, secondaryButton } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status-badge";
import { API_URL, DATA_MODE, fetchBobStatus } from "@/lib/api";
import { useApp } from "@/lib/store";
import type { BobStatus } from "@/lib/types";

export function SettingsClient() {
  const graph = useApp((s) => s.graph);
  const changes = useApp((s) => s.changes);
  const resetDemo = useApp((s) => s.resetDemo);
  const [bob, setBob] = useState<BobStatus | null>(null);

  useEffect(() => {
    void fetchBobStatus().then(setBob);
  }, []);

  const bobRows: [string, string][] = bob
    ? [
        ["API key", bob.configured ? "Set on the server (BOB_API_KEY)" : "Not set (BOB_API_KEY)"],
        ["Bob Shell", bob.cli ? bob.version ?? "Installed" : "Not installed"],
        ["Used by", "Inspector (reviews GitHub agent diffs), Cartographer (enriches connected repos)"],
      ]
    : [];

  const rows: [string, string][] = [
    ["Data mode", DATA_MODE === "live" ? "Live backend" : "Demo data"],
    ["API URL", API_URL || "Not set (NEXT_PUBLIC_API_URL)"],
    ["Event feed", API_URL ? `${API_URL.replace(/^http/, "ws")}/ws` : "Simulated in the browser"],
    ["Repository", graph?.repo ?? "…"],
    ["Graph scanned", graph ? new Date(graph.scannedAt).toLocaleString() : "…"],
  ];

  return (
    <PageShell>
      <PageHeader title="Settings" subtitle="Where this dashboard gets its data." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Connection" actions={<StatusBadge status={DATA_MODE === "live" ? "Live" : "Demo"} />}>
          <dl className="grid grid-cols-[140px_1fr] gap-y-3">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="type-caption">{k}</dt>
                <dd className="text-body text-text-primary break-all">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="type-caption mt-4">
            To connect the FastAPI server, set NEXT_PUBLIC_API_URL in web/.env.local and restart the dev server.
          </p>
        </Card>
        <Card
          title="IBM Bob"
          subtitle="Bob Shell runs headless on the server. The key never reaches the browser."
          actions={bob ? <Badge variant={bob.ready ? "success" : "neutral"}>{bob.ready ? "Ready" : "Off"}</Badge> : null}
        >
          <dl className="grid grid-cols-[140px_1fr] gap-y-3">
            {bobRows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="type-caption">{k}</dt>
                <dd className="text-body text-text-primary break-all">{v}</dd>
              </div>
            ))}
          </dl>
          {bob && !bob.ready ? <p className="type-caption mt-4">{bob.reason}</p> : null}
        </Card>
        <Card title="Local data" subtitle="Changes are saved in this browser.">
          <div className="flex items-center justify-between gap-4">
            <span className="text-body text-text-secondary">{changes.length} saved changes</span>
            <button
              className={secondaryButton}
              disabled={changes.length === 0}
              onClick={() => {
                resetDemo();
                toast.success("Saved changes cleared");
              }}
            >
              <Trash2 />
              Clear saved changes
            </button>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
