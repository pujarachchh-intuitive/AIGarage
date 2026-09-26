import { cn } from "@/lib/cn";

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block w-4 h-3 rounded-[3px]", className)} />
      <span className="type-caption">{label}</span>
    </span>
  );
}

function Dot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block size-2.5 rounded-full", className)} />
      <span className="type-caption">{label}</span>
    </span>
  );
}

export function CityLegend({ showAgents = false, className }: { showAgents?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 select-none", className)}>
      <Swatch className="border-2 border-error bg-error-soft" label="Breaking" />
      <Swatch className="border-2 border-warning bg-warning-soft" label="Needs update" />
      <Swatch className="border-2 border-info bg-info-soft" label="Update (tests, docs)" />
      <Swatch className="border border-border-strong bg-surface opacity-45" label="Safe" />
      <Swatch className="border-2 border-success bg-success-soft" label="Fixed" />
      <Swatch className="border-[3px] border-double border-border-strong bg-surface" label="Personal data" />
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-5 border-t-2 border-dotted border-border-strong" />
        <span className="type-caption">Found by Bob</span>
      </span>
      {showAgents ? (
        <>
          <span className="w-px h-4 bg-border" />
          <Dot className="bg-info" label="Reading or checking" />
          <Dot className="bg-warning" label="Editing" />
          <Dot className="bg-error" label="Blocked" />
          <Dot className="bg-success" label="Done" />
        </>
      ) : null}
    </div>
  );
}
