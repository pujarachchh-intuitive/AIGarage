"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * A date in the viewer's own locale and time zone. The server does not know
 * those, so it renders a neutral placeholder and the browser fills it in.
 * This avoids hydration mismatches.
 */
export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return <span className={className}>{mounted ? new Date(iso).toLocaleString() : "…"}</span>;
}
