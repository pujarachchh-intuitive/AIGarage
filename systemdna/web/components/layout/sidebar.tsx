"use client";

import { useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
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
import { cn } from "@/lib/cn";
import { setDarkMode, useIsDark } from "@/lib/theme";

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
      <path d={path} stroke="currentColor" className="text-zinc-200 dark:text-zinc-700" strokeWidth="1.5" />
      {activePath ? <path d={activePath} stroke="currentColor" strokeWidth="1.5" className="text-text-primary" /> : null}
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
            <div className="flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-surface shadow-xs shrink-0">
              <Logo className="w-4 h-4" />
            </div>
            <span className="text-heading font-bold text-text-primary tracking-tight truncate">SystemDNA</span>
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

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
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
            "flex items-center w-full rounded-lg text-body font-medium transition-all duration-150 group",
            collapsed ? "justify-center p-2.5" : "px-3 py-2 gap-3",
          );
          const tone = active
            ? "bg-text-primary text-text-inverse hover:bg-text-primary"
            : "text-text-primary hover:bg-surface-hover";
          const iconClass = cn(
            "w-5 h-5 shrink-0 transition-colors",
            active ? "text-text-inverse" : "text-icon-secondary group-hover:text-icon-primary",
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
                            ? "text-text-primary font-semibold"
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
                isDark ? "bg-primary" : "bg-border-strong",
              )}
              aria-label="Toggle dark mode"
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-4 w-4 transform rounded-full shadow-xs transition duration-200 ease-in-out",
                  isDark ? "translate-x-4 bg-surface" : "translate-x-0 bg-icon-primary",
                )}
              />
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
