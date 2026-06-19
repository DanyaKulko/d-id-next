"use client";

import { useEffect } from "react";

/**
 * Blocks pinch-zoom on touch devices.
 *
 * The viewport meta (`maximumScale: 1`, `userScalable: false`) already blocks
 * zoom on Android, but iOS Safari has intentionally ignored those flags since
 * iOS 10 — the only way to stop pinch-zoom there is to preventDefault the
 * gesture/multi-touch events imperatively. Double-tap zoom is handled
 * separately by `touch-action: manipulation` in globals.css.
 *
 * Mobile only: guarded by `(pointer: coarse)` so desktop trackpad pinch and
 * normal interactions are never touched. Renders nothing.
 */
export default function ZoomLock() {
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    const prevent = (e: Event) => e.preventDefault();

    // iOS Safari pinch — non-standard gesture events (the only signal iOS gives).
    document.addEventListener("gesturestart", prevent, { passive: false });
    document.addEventListener("gesturechange", prevent, { passive: false });
    document.addEventListener("gestureend", prevent, { passive: false });

    // Multi-touch pinch via touchmove — covers iOS and any engine that still
    // allows scaling despite the viewport flags. One-finger scroll is untouched.
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      document.removeEventListener("gesturestart", prevent);
      document.removeEventListener("gesturechange", prevent);
      document.removeEventListener("gestureend", prevent);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  return null;
}
