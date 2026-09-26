"use client";

// Reads HRMS design tokens as opaque hex colours for canvas renderers
// (Cytoscape and three.js cannot read CSS variables).

export type Tokens = Record<
  | "background"
  | "surface"
  | "surfaceSecondary"
  | "border"
  | "borderStrong"
  | "textPrimary"
  | "textSecondary"
  | "textTertiary"
  | "textInverse"
  | "success"
  | "successSoft"
  | "warning"
  | "warningSoft"
  | "error"
  | "errorSoft"
  | "info"
  | "infoSoft",
  string
> & { font: string };

/** Reads design tokens as opaque hex colours. Cytoscape cannot read CSS variables. */
export function readTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const sample = (value: string): [number, number, number, number] => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = value.trim() || "#000";
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const hex = (r: number, g: number, b: number) =>
    "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const v = (name: string) => cs.getPropertyValue(name);
  const [sr, sg, sb] = sample(v("--surface"));
  // Soft colours can be translucent in dark mode: blend them over the surface.
  const color = (name: string) => {
    const [r, g, b, a] = sample(v(name));
    return hex(r * a + sr * (1 - a), g * a + sg * (1 - a), b * a + sb * (1 - a));
  };
  return {
    background: color("--background"),
    surface: color("--surface"),
    surfaceSecondary: color("--surface-secondary"),
    border: color("--border"),
    borderStrong: color("--border-strong"),
    textPrimary: color("--text-primary"),
    textSecondary: color("--text-secondary"),
    textTertiary: color("--text-tertiary"),
    textInverse: color("--text-inverse"),
    success: color("--success"),
    successSoft: color("--success-soft"),
    warning: color("--warning"),
    warningSoft: color("--warning-soft"),
    error: color("--error"),
    errorSoft: color("--error-soft"),
    info: color("--info"),
    infoSoft: color("--info-soft"),
    font: getComputedStyle(document.body).fontFamily,
  };
}
