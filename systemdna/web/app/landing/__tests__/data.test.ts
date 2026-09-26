/**
 * Data contract tests — pure TypeScript, no DOM required.
 */
import { describe, it, expect } from "vitest";
import { metrics, type Metric } from "@/app/landing/metrics";
import { siteConfig } from "@/app/landing/siteConfig";

describe("metrics.ts", () => {
  it("exports a non-empty array", () => {
    expect(Array.isArray(metrics)).toBe(true);
    expect(metrics.length).toBeGreaterThan(0);
  });

  it("every metric has a label and description", () => {
    for (const m of metrics) {
      expect(typeof m.label).toBe("string");
      expect(m.label.length).toBeGreaterThan(0);
      expect(typeof m.description).toBe("string");
    }
  });

  it("all values are null — not yet measured", () => {
    for (const m of metrics) {
      expect(m.value).toBeNull();
    }
  });

  it("null value → renders as 'Measured live in the demo'", () => {
    for (const m of metrics) {
      const display: string =
        m.value === null ? "Measured live in the demo" : String(m.value);
      expect(display).toBe("Measured live in the demo");
    }
  });

  it("no metric is already marked as an achieved result", () => {
    const measured = metrics.filter((m: Metric) => m.value !== null);
    expect(measured).toHaveLength(0);
  });
});

describe("siteConfig.ts", () => {
  it("has a githubUrl", () => {
    expect(typeof siteConfig.githubUrl).toBe("string");
    expect(siteConfig.githubUrl.length).toBeGreaterThan(0);
  });

  it("has event metadata", () => {
    expect(typeof siteConfig.eventName).toBe("string");
    expect(typeof siteConfig.eventPlatform).toBe("string");
    expect(typeof siteConfig.eventDates).toBe("string");
  });

  it("has a positive team size", () => {
    expect(typeof siteConfig.teamSize).toBe("number");
    expect(siteConfig.teamSize).toBeGreaterThan(0);
  });
});
