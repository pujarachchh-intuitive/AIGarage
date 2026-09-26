import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type KpiTone = "neutral" | "success" | "warning" | "inactive" | "error";

// Tone is carried by a single small status dot, never by a filled icon well.
const TONE_DOT: Record<KpiTone, string | null> = {
  neutral: null,
  inactive: null,
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
};

interface KpiTileProps {
  label: string;
  value: ReactNode;
  icon: ComponentType<{ className?: string }>;
  tone?: KpiTone;
  delta?: { text: string; tone: "success" | "warning" | "error" | "neutral" };
  /** Marks the one key metric on a screen with the brand accent. */
  accent?: boolean;
  className?: string;
}

export function KpiTile({ label, value, icon: Icon, tone = "neutral", delta, accent, className }: KpiTileProps) {
  const dot = TONE_DOT[tone];
  return (
    <div
      className={cn(
        "relative overflow-hidden border border-border rounded-xl p-4 bg-surface min-h-[128px] flex flex-col justify-between transition-colors duration-150 hover:border-border-strong",
        className,
      )}
    >
      {accent ? <span aria-hidden className="absolute left-0 top-0 h-[2px] w-12 bg-brand" /> : null}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] leading-4 font-medium uppercase tracking-[0.08em] text-text-tertiary truncate">
          {label}
        </span>
        <span
          className={cn(
            "size-7 shrink-0 rounded-md border flex items-center justify-center select-none",
            accent ? "border-brand/60 bg-brand-soft text-brand-text" : "border-border text-icon-secondary",
          )}
        >
          <Icon className="size-3.5" />
        </span>
      </div>
      <div className="flex items-end justify-between gap-2 mt-6">
        <span className="text-[32px] leading-9 font-semibold tracking-[-0.03em] tabular-nums text-text-primary">
          {value}
        </span>
        {delta ? (
          <span
            className={cn(
              "font-mono text-[11px] leading-4 font-medium tabular-nums mb-1.5",
              delta.tone === "success" && "text-success",
              delta.tone === "warning" && "text-warning",
              delta.tone === "error" && "text-error",
              delta.tone === "neutral" && "text-text-tertiary",
            )}
          >
            {delta.text}
          </span>
        ) : dot ? (
          <span className={cn("size-1.5 rounded-full mb-3", dot)} />
        ) : null}
      </div>
    </div>
  );
}
