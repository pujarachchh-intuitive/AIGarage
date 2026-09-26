import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type KpiTone = "neutral" | "success" | "warning" | "inactive" | "error";

// Icon well gradients from DESIGN.md section 8.
const TONE_GRADIENT: Record<KpiTone, string> = {
  neutral: "linear-gradient(to top, #18181B, #71717A)",
  success: "linear-gradient(to top, #059669, #34D399)",
  warning: "linear-gradient(to top, #D97706, #FBBF24)",
  inactive: "linear-gradient(to top, #71717A, #A1A1AA)",
  error: "linear-gradient(to top, #B91C1C, #F87171)",
};

interface KpiTileProps {
  label: string;
  value: ReactNode;
  icon: ComponentType<{ className?: string }>;
  tone?: KpiTone;
  delta?: { text: string; tone: "success" | "warning" | "error" | "neutral" };
  className?: string;
}

export function KpiTile({ label, value, icon: Icon, tone = "neutral", delta, className }: KpiTileProps) {
  return (
    <div
      className={cn(
        "border border-border rounded-xl p-5 bg-surface min-h-[140px] flex flex-col justify-between hover:shadow-sm transition-shadow duration-150",
        className,
      )}
    >
      <div
        className="size-12 rounded-lg flex items-center justify-center text-white select-none"
        style={{
          background: TONE_GRADIENT[tone],
          outline: "1px solid rgba(39,39,42,0.5)",
          boxShadow: "0 1px 2px rgba(24,24,27,0.15)",
        }}
      >
        <Icon className="size-6" />
      </div>
      <div className="flex flex-col gap-1 mt-4">
        <span className="type-metric">{value}</span>
        <div className="flex items-center justify-between gap-2">
          <span className="type-caption">{label}</span>
          {delta ? (
            <span
              className={cn(
                "text-body font-semibold",
                delta.tone === "success" && "text-success",
                delta.tone === "warning" && "text-warning",
                delta.tone === "error" && "text-error",
                delta.tone === "neutral" && "text-text-tertiary",
              )}
            >
              {delta.text}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
