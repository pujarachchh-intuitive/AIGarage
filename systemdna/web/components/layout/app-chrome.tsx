"use client";

import { useEffect, type ReactNode } from "react";
import Navbar from "@/components/layout/navbar";
import Sidebar from "@/components/layout/sidebar";
import { useApp } from "@/lib/store";

export function AppChrome({ children }: { children: ReactNode }) {
  const loadGraph = useApp((s) => s.loadGraph);

  useEffect(() => {
    void Promise.resolve(useApp.persist.rehydrate()).then(() => loadGraph());
  }, [loadGraph]);

  return (
    <div className="flex h-screen w-screen bg-background text-text-primary overflow-hidden font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
        <Navbar />
        <main className="flex-1 overflow-y-auto px-6 pt-[72px] pb-4">{children}</main>
      </div>
    </div>
  );
}
