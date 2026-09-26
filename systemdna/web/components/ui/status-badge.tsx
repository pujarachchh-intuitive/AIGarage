import type { ComponentProps } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";

// Status tone map, following the HRMS rule: status colour lives in badges only.
const STATUS_MAP: Record<string, BadgeTone> = {
  Completed: "success",
  Done: "success",
  Fixed: "success",
  Approved: "success",
  Passed: "success",
  High: "success",
  Allowed: "success",
  Enforced: "success",

  Running: "warning",
  Editing: "warning",
  "Awaiting approval": "warning",
  "Needs update": "warning",
  Retrying: "warning",
  Medium: "warning",
  "Under construction": "warning",

  Breaking: "destructive",
  Blocked: "destructive",
  Failed: "destructive",
  Quarantined: "destructive",
  Affected: "destructive",
  Low: "destructive",

  Reading: "info",
  Verifying: "info",
  Inspecting: "info",
  Update: "info",
  "Found by Bob": "info",

  Planned: "neutral",
  Queued: "neutral",
  Safe: "neutral",
  Parser: "neutral",
  Planned_: "neutral",
};

export function statusToVariant(status: string): BadgeTone {
  return STATUS_MAP[status] ?? "neutral";
}

interface StatusBadgeProps extends ComponentProps<"span"> {
  status: string;
}

export function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  return (
    <Badge variant={statusToVariant(status)} className={className} {...props}>
      {status}
    </Badge>
  );
}
