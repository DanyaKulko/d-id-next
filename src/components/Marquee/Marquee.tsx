"use client";

import { useEffect, useRef, useState } from "react";

type MarqueeProps = {
  text: string;
  className?: string;
  /** constant scroll speed in px per second (same for every instance). */
  speed?: number;
  /** gap between the end of the text and the repeated start, in px. */
  gap?: number;
};

/**
 * Single-row running line (sci-fi ticker). The text starts at the LEFT edge
 * and scrolls left; a second copy follows after `gap` so the beginning runs
 * back in from the right just as the end leaves (seamless overlap).
 *
 * Speed is constant px/second across all instances: the animation duration is
 * computed from the measured text width, so long and short captions move at the
 * same pace. Respects prefers-reduced-motion (static, wrapped, fully readable).
 */
export default function Marquee({
  text,
  className,
  speed = 56,
  gap = 56,
}: MarqueeProps) {
  const measureRef = useRef<HTMLSpanElement>(null);
  const [reduced, setReduced] = useState(false);
  const [trackStyle, setTrackStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      return;
    }
    // wait a frame so the custom font has applied before measuring width
    const id = window.requestAnimationFrame(() => {
      const w = measureRef.current?.offsetWidth ?? 0;
      if (!w) return;
      const shift = w + gap;
      setTrackStyle({
        ["--marq-shift" as string]: `${shift}px`,
        animation: `na-marq ${shift / speed}s linear infinite`,
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [text, speed, gap]);

  if (reduced) {
    // static, wrapped, fully visible
    return <p className={className}>{text}</p>;
  }

  return (
    <p
      className={className}
      aria-label={text}
      style={{ overflow: "hidden", whiteSpace: "nowrap" }}
    >
      <span style={{ display: "inline-flex", ...trackStyle }} aria-hidden="true">
        <span ref={measureRef}>{text}</span>
        <span style={{ paddingLeft: `${gap}px` }}>{text}</span>
      </span>
    </p>
  );
}
