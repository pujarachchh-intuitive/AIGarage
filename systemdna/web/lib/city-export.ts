"use client";

// The view on screen registers a function that returns a PNG of itself.
// The Agent City toolbar calls it for "Download image".

type Snapshot = () => string | null;

let current: Snapshot | null = null;

export function registerSnapshot(fn: Snapshot) {
  current = fn;
  return () => {
    if (current === fn) current = null;
  };
}

/** Draws a canvas onto a solid background (canvases are often transparent). */
export function canvasToPng(canvas: HTMLCanvasElement, background: string): string {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  return out.toDataURL("image/png");
}

export function downloadSnapshot(filename: string): boolean {
  const url = current?.();
  if (!url) return false;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  return true;
}
