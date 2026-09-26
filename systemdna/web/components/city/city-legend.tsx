"use client";

import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { BRAND, STATE } from "@/lib/palette";
import { useIsDark } from "@/lib/theme";

function Item({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      <span className="type-caption">{label}</span>
    </span>
  );
}

function Swatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <span
      className={cn("inline-block w-4 h-3 rounded-[3px] border-[1.5px]", dashed && "border-dashed")}
      style={{ borderColor: color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
    />
  );
}

function Dot({ color }: { color: string }) {
  return <span className="inline-block size-2 rounded-full" style={{ background: color }} />;
}

const Divider = () => <span className="w-px h-3.5 bg-border" />;

export function CityLegend({ showAgents = false, className }: { showAgents?: boolean; className?: string }) {
  const dark = useIsDark();
  const acid = dark ? BRAND.acid : BRAND.acidInk;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 select-none", className)}>
      <Item label="Depends on">
        <svg width="22" height="8" aria-hidden className="text-text-tertiary">
          <path d="M1 4h16" stroke="currentColor" strokeWidth="1.25" />
          <path d="M16 1l4 3-4 3z" fill="currentColor" />
        </svg>
      </Item>
      <Item label="Found by Bob">
        <svg width="22" height="8" aria-hidden>
          <path d="M1 4h16" stroke={acid} strokeWidth="1.5" strokeDasharray="4 3" />
          <path d="M16 1l4 3-4 3z" fill={acid} />
        </svg>
      </Item>
      <Item label="Personal data">
        <ShieldAlert className="size-3" style={{ color: STATE.pii }} />
      </Item>
      <Item label="High criticality">
        <span className="size-[7px] rounded-full" style={{ background: BRAND.acid, boxShadow: dark ? undefined : "0 0 0 1px rgba(14,15,12,0.35)" }} />
      </Item>
      <Item label="No tests">
        <span
          className="size-3 text-text-tertiary rounded-[2px] border border-border"
          style={{ backgroundImage: "repeating-linear-gradient(135deg, currentColor 0 1px, transparent 1px 4px)" }}
        />
      </Item>
      <Divider />
      <Item label="Breaking">
        <Swatch color={STATE.impact} />
      </Item>
      <Item label="Needs update">
        <Swatch color="var(--warning)" />
      </Item>
      <Item label="Update (tests, docs)">
        <Swatch color="var(--info)" />
      </Item>
      <Item label="Fixed">
        <Swatch color={STATE.fixed} />
      </Item>
      {showAgents ? (
        <>
          <Divider />
          <Item label="Reading or checking">
            <Dot color="var(--info)" />
          </Item>
          <Item label="Editing">
            <Dot color="var(--warning)" />
          </Item>
          <Item label="Blocked">
            <Dot color={STATE.blocked} />
          </Item>
          <Item label="Done">
            <Dot color={STATE.fixed} />
          </Item>
        </>
      ) : null}
    </div>
  );
}
