import { cn } from "@/lib/cn";

// SystemDNA mark: two offset strands joined by rungs, drawn in the same
// muted stone (#737373) and charcoal (#404040) as the HRMS logo mark.
export default function Logo({ className }: { className?: string }) {
  return (
    <svg className={cn(className)} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 1c0 3.2 8 4.6 8 7s-8 3.8-8 7" stroke="#737373" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 1c0 3.2-8 4.6-8 7s8 3.8 8 7" stroke="#404040" strokeWidth="2" strokeLinecap="round" />
      <path d="M5.5 4h5M5.5 12h5" stroke="#404040" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
