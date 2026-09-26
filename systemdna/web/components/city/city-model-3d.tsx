"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Canvas } from "@react-three/fiber";
import { registerSnapshot } from "@/lib/city-export";
import { LocateFixed, Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CityData } from "@/lib/city";
import { useIsDark } from "@/lib/theme";
import { CityModel, type ArcsMode, type ColorMode, type HeightMode, type LabelsMode, type ModelApi } from "@/components/city/model/city-model";
import "@/components/city/model/model.css";
import { BRASS, COPPER, SLATE } from "@/components/city/model/kit";

export type CityColorMode = ColorMode;

interface City3DProps {
  data: CityData;
  selected?: string | null;
  onSelect?: (path: string | null) => void;
  /** Dim every folder except this one. */
  focusDir?: string | null;
  colorMode?: CityColorMode;
  /** Height: lines of code, or how many files import the file. */
  heightMode?: HeightMode;
  /** Which dependency traces to draw. */
  arcs?: ArcsMode;
  /** Which file names to show. */
  labels?: LabelsMode;
  /** Slow turntable. */
  autoRotate?: boolean;
  /** Landing-page story chapter (0–4): no controls, camera and state follow the story. */
  story?: number;
  /** Show the Bob crew deck (landing page). */
  crew?: boolean;
  /** Force the dark studio, whatever the app theme. */
  night?: boolean;
  /** Engraved on the plinth. */
  title?: string;
  className?: string;
}

const FOLDER = ["#8b9e8e", "#c99676", "#c9b48a", "#8fa0c2", "#b3a488", "#9fb0b8", "#cf9677", "#7f9870"];
const NATURAL_LIGHT = ["#d9d6cf", "#cfccc4", "#e2dfd8", "#c7c3bb", "#d4d0c8", "#bfbbb3", "#dcd8d0"];
const NATURAL_DARK = ["#3a3e44", "#34383e", "#41454b", "#2f3338", "#3d4147", "#2b2e33", "#44484e"];

export function districtColor(index: number, mode: CityColorMode, dark: boolean) {
  const list = mode === "folder" ? FOLDER : dark ? NATURAL_DARK : NATURAL_LIGHT;
  return list[index % list.length];
}

/** Landmark roof plates: slate, brass and copper. Shared with the legend. */
export const LANDMARK_COLOR = { entry: SLATE, core: BRASS, hotspot: COPPER } as const;

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export function CityModel3D({
  data,
  selected,
  onSelect,
  focusDir,
  colorMode = "zinc",
  heightMode,
  arcs,
  labels,
  autoRotate,
  story,
  crew,
  night,
  title,
  className,
}: City3DProps) {
  const themeDark = useIsDark();
  const dark = night ?? themeDark;
  const reduceMotion = useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false);
  const api = useRef<ModelApi | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const storyMode = story !== undefined;
  const unregisterSnapshot = useRef<(() => void) | null>(null);
  useEffect(() => () => unregisterSnapshot.current?.(), []);

  // Stop rendering when the model is off screen.
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (storyMode) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "[") api.current?.rotate(-45);
      if (e.key === "]") api.current?.rotate(45);
      if (e.key === "0") api.current?.fit();
      if (e.key === "Escape") onSelect?.(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [storyMode, onSelect]);

  const canvas = (
    <Canvas
      shadows="soft"
      dpr={[1, 1.5]}
      frameloop={visible ? "always" : "never"}
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false, preserveDrawingBuffer: !storyMode }}
      onCreated={({ gl }) => {
        if (storyMode) return;
        // "Download image" in the Agent City toolbar reads the last frame.
        unregisterSnapshot.current?.();
        unregisterSnapshot.current = registerSnapshot(() => gl.domElement.toDataURL("image/png"));
      }}
      camera={{ fov: 20, near: 1, far: 6000, position: [300, 300, 300] }}
      onPointerMissed={storyMode ? undefined : () => onSelect?.(null)}
      style={storyMode ? { pointerEvents: "none" } : undefined}
    >
      <CityModel
        data={data}
        dark={dark}
        selected={selected ?? null}
        focusDir={focusDir ?? null}
        colorMode={colorMode}
        heightMode={heightMode}
        arcs={arcs}
        labels={labels}
        autoRotate={autoRotate}
        onSelect={onSelect}
        story={story}
        crew={crew}
        reduceMotion={reduceMotion}
        title={title}
        apiRef={api}
      />
    </Canvas>
  );

  if (storyMode) {
    return (
      <div ref={host} className={cn("relative", className)} aria-hidden="true">
        {canvas}
      </div>
    );
  }

  const iconBtn =
    "cursor-pointer flex items-center justify-center size-9 rounded-lg border border-border bg-surface/80 backdrop-blur-md text-icon-secondary hover:text-text-primary hover:bg-surface hover:border-border-strong shadow-2xs active:scale-95 transition-all duration-150";

  return (
    <div ref={host} className={cn("relative overflow-hidden", className)}>
      <div className="absolute inset-0">{canvas}</div>
      <div className="absolute top-3 right-3 flex flex-col gap-2 select-none">
        <button className={iconBtn} onClick={() => api.current?.zoom(1.25)} aria-label="Zoom in" title="Zoom in">
          <Plus className="size-4" />
        </button>
        <button className={iconBtn} onClick={() => api.current?.zoom(0.8)} aria-label="Zoom out" title="Zoom out">
          <Minus className="size-4" />
        </button>
        <button className={iconBtn} onClick={() => api.current?.fit()} aria-label="Fit to screen" title="Fit (0)">
          <LocateFixed className="size-4" />
        </button>
        <button className={iconBtn} onClick={() => api.current?.rotate(-45)} aria-label="Rotate left" title="Rotate left ([)">
          <RotateCcw className="size-4" />
        </button>
        <button className={iconBtn} onClick={() => api.current?.rotate(45)} aria-label="Rotate right" title="Rotate right (])">
          <RotateCw className="size-4" />
        </button>
      </div>
      <div className="absolute bottom-3 left-3 flex items-center gap-3 select-none rounded-lg border border-border bg-surface/80 backdrop-blur-md px-2.5 py-1.5">
        {[
          ["drag", "pan"],
          ["scroll", "zoom"],
          ["right-drag", "orbit"],
          ["[ ]", "rotate"],
          ["0", "fit"],
        ].map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5 type-caption">
            <kbd className="px-1.5 h-5 inline-flex items-center rounded-md border border-border bg-surface text-caption font-semibold text-text-secondary">
              {k}
            </kbd>
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}
