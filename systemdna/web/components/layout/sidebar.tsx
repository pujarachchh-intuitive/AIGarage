"use client";

import { useEffect, useState, useSyncExternalStore, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderGit2,
  GitBranch,
  LayoutDashboard,
  Map as MapIcon,
  Moon,
  PanelLeftClose,
  Settings,
  ShieldCheck,
  Sun,
} from "lucide-react";
import Logo from "@/components/icons/logo";
import { fetchBobStatus, fetchGithubStatus } from "@/lib/api";
import { cn } from "@/lib/cn";
import { setDarkMode, useIsDark } from "@/lib/theme";
import type { BobStatus, GithubStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Connection state (GitHub + IBM Bob), shared by the chrome and the pages.
// At most one check per 30 s; re-checked when the window regains focus.
// ---------------------------------------------------------------------------

export interface Connections {
  github: GithubStatus | null;
  bob: BobStatus | null;
}

const EMPTY: Connections = { github: null, bob: null };
let snapshot: Connections = EMPTY;
let lastAt = 0;
let inflight: Promise<void> | null = null;
const connListeners = new Set<() => void>();

export function refreshConnections(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && Date.now() - lastAt < 30_000) return Promise.resolve();
  lastAt = Date.now();
  inflight = Promise.all([
    fetchGithubStatus().catch((): GithubStatus => ({ configured: false, mode: "none", error: "Status check failed" })),
    fetchBobStatus(),
  ])
    .then(([github, bob]) => {
      snapshot = { github, bob };
      connListeners.forEach((l) => l());
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function subscribeConnections(onChange: () => void) {
  connListeners.add(onChange);
  return () => {
    connListeners.delete(onChange);
  };
}

/** GitHub and IBM Bob status from the server. Each is null while the first check runs. */
export function useConnections(): Connections {
  const value = useSyncExternalStore(subscribeConnections, () => snapshot, () => EMPTY);
  useEffect(() => {
    void refreshConnections();
    const onFocus = () => void refreshConnections();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  return value;
}

export type ConnTone = "ok" | "warn" | "error" | "off" | "pending";

export interface ConnState {
  tone: ConnTone;
  /** Short mono label, e.g. "App", "Token", "Ready", "Off". */
  short: string;
  /** One-line description. */
  label: string;
}

export function githubState(s: GithubStatus | null): ConnState {
  if (!s) return { tone: "pending", short: "…", label: "Checking GitHub" };
  if (s.error) return { tone: "error", short: "Error", label: s.error };
  if (s.mode === "app") return { tone: "ok", short: "App", label: `GitHub App${s.app ? ` · ${s.app.name}` : ""}` };
  if (s.mode === "token") return { tone: "ok", short: "Token", label: `Personal token${s.login ? ` · @${s.login}` : ""}` };
  return { tone: "off", short: "Off", label: "Not connected" };
}

export function bobState(s: BobStatus | null): ConnState {
  if (!s) return { tone: "pending", short: "…", label: "Checking IBM Bob" };
  if (s.ready) return { tone: "ok", short: "Ready", label: `Ready${s.version ? ` · v${s.version.replace(/^v/, "")}` : ""}` };
  if (s.cli) return { tone: "warn", short: "No key", label: "Bob Shell installed, API key not set" };
  return { tone: "off", short: "Off", label: s.configured ? "API key set, Bob Shell not installed" : "Not set up" };
}

const DOT_TONE: Record<ConnTone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  error: "bg-error",
  off: "bg-text-disabled",
  pending: "bg-border-strong animate-pulse",
};

export function StatusDot({ tone, className }: { tone: ConnTone; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-1.5 rounded-full shrink-0", DOT_TONE[tone], className)} />;
}

// Branch connector copied from the HRMS sidebar.
function BranchConnector({ count, activeChildIndex }: { count: number; activeChildIndex: number }) {
  if (count <= 0) return null;
  const height = 32 * count - 8;
  const path =
    `M0.5 0V12 M24.5 24H8.5C4.08172 24 0.5 20.4183 0.5 16V12` +
    Array.from({ length: count - 1 }, (_, i) => {
      const y = 56 + i * 32;
      return ` M0.5 12V${y - 8}C0.5 ${y - 8 + 4.08172} 4.08172 ${y} 8.5 ${y}H24.5`;
    }).join("");
  const activePath =
    activeChildIndex >= 0
      ? `M0.5 0 V${24 + activeChildIndex * 32 - 8} C0.5 ${24 + activeChildIndex * 32 - 8 + 4.08172} 4.08172 ${24 + activeChildIndex * 32} 8.5 ${24 + activeChildIndex * 32} H24.5`
      : null;
  return (
    <svg
      width="25"
      height={height + 20}
      viewBox={`0 -20 25 ${height + 20}`}
      fill="none"
      className="absolute left-[-1px] top-[-20px] select-none pointer-events-none"
    >
      <path d={path} stroke="currentColor" className="text-border-strong" strokeWidth="1.5" />
      {activePath ? <path d={activePath} stroke="currentColor" strokeWidth="1.5" className="text-brand-text" /> : null}
    </svg>
  );
}

interface NavItem {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  href?: string;
  children?: { label: string; href: string }[];
  divider?: boolean;
}

const NAV: NavItem[] = [
  { label: "Overview", icon: LayoutDashboard, href: "/overview" },
  { label: "Repositories", icon: FolderGit2, href: "/repos" },
  { label: "Agent City", icon: MapIcon, href: "/city" },
  {
    label: "Changes",
    icon: GitBranch,
    children: [
      { label: "All changes", href: "/changes" },
      { label: "New change", href: "/changes/new" },
    ],
  },
  { label: "Governance", icon: ShieldCheck, href: "/governance" },
  { label: "divider", divider: true },
  { label: "Settings", icon: Settings, href: "/settings" },
];

function isActivePath(pathname: string, href: string) {
  if (pathname === href || pathname === `${href}/`) return true;
  return pathname.startsWith(`${href}/`);
}

export default function Sidebar() {
  const pathname = usePathname();
  const isDark = useIsDark();
  const { github, bob } = useConnections();
  const conns = [
    { name: "GitHub", state: githubState(github) },
    { name: "IBM Bob", state: bobState(bob) },
  ];
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ Changes: true });

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-sidebar border-r border-border transition-all duration-300 ease-in-out select-none shrink-0",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      <div className={cn("flex items-center p-4 h-[60px]", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed ? (
          <Link href="/overview" className="flex items-center gap-3 overflow-hidden">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-surface shrink-0">
              <Logo className="w-4 h-4 dark:invert" />
              <span aria-hidden className="absolute -top-[3px] -right-[3px] size-2 rounded-[2px] bg-brand ring-2 ring-sidebar" />
            </div>
            <span className="text-[15px] font-semibold text-text-primary tracking-[-0.02em] truncate">
              System<span className="text-text-tertiary font-medium">DNA</span>
            </span>
          </Link>
        ) : null}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="cursor-pointer p-1.5 rounded-lg text-icon-secondary hover:text-text-primary hover:bg-surface-hover transition-colors focus:outline-none"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <PanelLeftClose className={cn("w-5 h-5 transition-transform duration-200", collapsed && "rotate-180")} />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {NAV.map((item, idx) => {
          if (item.divider) return <hr key={`d-${idx}`} className="border-divider my-4 mx-1" />;
          const Icon = item.icon!;
          const children = item.children ?? [];
          const activeChildIndex = children.reduce((best, child, i) => {
            if (!isActivePath(pathname, child.href)) return best;
            if (best < 0) return i;
            return child.href.length > children[best].href.length ? i : best;
          }, -1);
          const active = Boolean(item.href && isActivePath(pathname, item.href)) || activeChildIndex >= 0;
          const base = cn(
            "relative flex items-center w-full h-9 rounded-md text-body font-medium transition-colors duration-150 group",
            collapsed ? "justify-center px-2.5" : "px-3 gap-3",
          );
          const tone = active
            ? "bg-surface-hover text-text-primary before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[2px] before:rounded-full before:bg-brand"
            : "text-text-secondary hover:text-text-primary hover:bg-surface-hover/70";
          const iconClass = cn(
            "size-[18px] shrink-0 transition-colors",
            active ? "text-brand-text" : "text-icon-secondary group-hover:text-icon-primary",
          );

          if (item.children) {
            const open = expanded[item.label] && !collapsed;
            return (
              <div key={item.label}>
                <button
                  onClick={() => !collapsed && setExpanded((s) => ({ ...s, [item.label]: !s[item.label] }))}
                  className={cn(base, tone, "cursor-pointer")}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className={iconClass} />
                  {!collapsed ? <span className="truncate flex-1 text-left">{item.label}</span> : null}
                </button>
                {open ? (
                  <div className="relative ml-[22px] flex flex-col pt-2">
                    <BranchConnector count={children.length} activeChildIndex={activeChildIndex} />
                    {children.map((child, i) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "h-8 flex items-center pl-[32px] text-body rounded-md transition-colors duration-150",
                          i === activeChildIndex
                            ? "text-text-primary font-medium"
                            : "text-text-secondary hover:text-text-primary hover:bg-surface-hover/50",
                        )}
                      >
                        <span className="truncate">{child.label}</span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          }

          return (
            <Link key={item.href} href={item.href!} className={cn(base, tone)} title={collapsed ? item.label : undefined}>
              <Icon className={iconClass} />
              {!collapsed ? <span className="truncate">{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 space-y-2">
        <Link
          href="/settings"
          className={cn(
            "flex flex-col rounded-md hover:bg-surface-hover/70 transition-colors",
            collapsed ? "items-center gap-2 py-2" : "gap-1 px-3 py-2",
          )}
          title={conns.map((c) => `${c.name}: ${c.state.label}`).join("\n")}
          aria-label={`Connections. ${conns.map((c) => `${c.name}: ${c.state.label}`).join(". ")}`}
        >
          {!collapsed ? (
            <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-tertiary pb-0.5">Connections</span>
          ) : null}
          {conns.map((c) =>
            collapsed ? (
              <StatusDot key={c.name} tone={c.state.tone} className="size-2" />
            ) : (
              <span key={c.name} className="flex items-center gap-2 h-5">
                <StatusDot tone={c.state.tone} />
                <span className="type-caption text-text-secondary flex-1 truncate">{c.name}</span>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-tertiary">{c.state.short}</span>
              </span>
            ),
          )}
        </Link>
        <div
          className={cn(
            "flex items-center justify-between text-body font-medium text-text-primary",
            collapsed ? "justify-center" : "px-3 py-1.5",
          )}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            {isDark ? (
              <Moon className="w-5 h-5 shrink-0 text-icon-secondary" />
            ) : (
              <Sun className="w-5 h-5 shrink-0 text-icon-secondary" />
            )}
            {!collapsed ? <span className="truncate">{isDark ? "Dark mode" : "Light mode"}</span> : null}
          </div>
          {!collapsed ? (
            <button
              onClick={() => setDarkMode(!isDark)}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1",
                isDark ? "bg-brand" : "bg-border-strong",
              )}
              aria-label="Toggle dark mode"
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-4 w-4 transform rounded-full shadow-xs transition duration-200 ease-in-out",
                  isDark ? "translate-x-4 bg-brand-ink" : "translate-x-0 bg-surface",
                )}
              />
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
