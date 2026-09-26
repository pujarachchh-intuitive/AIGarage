"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Attach `ref` to any element and call `toggle()` to enter or leave full screen.
 *
 * It uses the browser's Fullscreen API when it is allowed. Some browsers refuse it
 * (embedded views, iframes without allow="fullscreen", strict policies). Then it
 * falls back to "expanded": the element covers the whole window. Esc leaves both.
 * `isFullscreen` is true in either mode; `mode` says which one is on.
 */
export function useFullscreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [native, setNative] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onChange = () => {
      const on = document.fullscreenElement != null && document.fullscreenElement === ref.current;
      setNative(on);
      // A late "yes" from the browser replaces the expanded fallback.
      if (on) setExpanded(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // The expanded fallback: pin the element over the window while it is on.
  useEffect(() => {
    const el = ref.current;
    if (!el || !expanded) return;
    const prev = el.getAttribute("style") ?? "";
    el.setAttribute("style", `${prev};position:fixed;inset:0;z-index:100;`);
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      el.setAttribute("style", prev);
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  const toggle = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    const el = ref.current;
    if (!el) return;
    try {
      if (!document.fullscreenEnabled || !el.requestFullscreen) throw new Error("not allowed");
      // Some embedded browsers never answer the request. Give it a moment, then fall back.
      await Promise.race([
        el.requestFullscreen(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("no answer")), 800)),
      ]);
      if (!document.fullscreenElement) throw new Error("not entered");
    } catch {
      if (!document.fullscreenElement) setExpanded(true);
    }
  }, [expanded]);

  return { ref, isFullscreen: native || expanded, mode: native ? ("native" as const) : expanded ? ("expanded" as const) : null, toggle };
}
