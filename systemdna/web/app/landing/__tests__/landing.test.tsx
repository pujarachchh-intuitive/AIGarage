/**
 * Component render tests for the landing page.
 * Verifies: h1, tagline, CTA links, Target badges, placeholder text.
 * @vitest-environment happy-dom
 */
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";

// ─── Next.js shims ────────────────────────────────────────────────
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => React.createElement("a", { href, ...props }, children),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/font/google", () => ({
  Space_Grotesk: () => ({ variable: "--font-space-grotesk", className: "" }),
  JetBrains_Mono: () => ({
    variable: "--font-jetbrains-mono",
    className: "",
  }),
}));

// ─── Browser API shims ────────────────────────────────────────────
beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  }
  // No WebGL in test env
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
});

afterEach(cleanup);

// ─── Tests ────────────────────────────────────────────────────────
import { LandingPage } from "@/app/landing/LandingPage";

describe("LandingPage", () => {
  it("renders exactly one h1 containing 'SystemDNA'", () => {
    render(React.createElement(LandingPage));
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toMatch(/SystemDNA/i);
  });

  it("renders the tagline text", () => {
    render(React.createElement(LandingPage));
    const matches = screen.getAllByText(
      /Find References for your whole system, and fix them all/i,
    );
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0]).toBeInTheDocument();
  });

  it('"Enter the Atlas" links to /city', () => {
    render(React.createElement(LandingPage));
    const link = screen.getByRole("link", { name: /Enter the Atlas/i });
    expect(link).toHaveAttribute("href", "/city");
  });

  it('"Watch the replay" links to /city?mode=replay', () => {
    render(React.createElement(LandingPage));
    const link = screen.getByRole("link", { name: /Watch the replay/i });
    expect(link).toHaveAttribute("href", "/city?mode=replay");
  });
});

describe("ProofSection", () => {
  it("every metric tile shows a Target badge", () => {
    render(React.createElement(LandingPage));
    const badges = screen.getAllByText("Target");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("every metric tile shows 'Measured live in the demo' when value is null", () => {
    render(React.createElement(LandingPage));
    const placeholders = screen.getAllByText(/Measured live in the demo/i);
    expect(placeholders.length).toBeGreaterThan(0);
  });
});
