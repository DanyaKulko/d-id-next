"use client";

/**
 * Animated starfield — port of the 3.0 prototype `starfield.js`.
 * Pure canvas, no deps. Twinkle + subtle parallax drift.
 * Honors prefers-reduced-motion (single static paint, no RAF loop).
 * DPR-capped at 2 for mobile/Retina. Safari-safe (2D canvas only).
 *
 * Mounted once behind the page content via SpaceBackground.
 */

import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  r: number;
  a: number;
  tw: number;
  ph: number;
  vx: number;
  vy: number;
  c: string;
};

type StarfieldProps = {
  /** Comma-separated star colors. Defaults lean cool blue + warm amber (brand). */
  colors?: string;
  className?: string;
};

export default function Starfield({
  colors = "#ffffff,#9fd8ff,#ffd9a8",
  className,
}: StarfieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const palette = colors.split(",").map((c) => c.trim());
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let stars: Star[] = [];
    let w = 0;
    let h = 0;
    let raf = 0;
    let lastW = -1;
    let lastH = -1;
    let resizeTimer = 0;

    type Shoot = { x: number; y: number; vx: number; vy: number; life: number };
    let shoots: Shoot[] = [];
    let nextShootIn = 40;

    const buildStars = () => {
      const count = Math.round((w * h) / 4200); // denser field
      stars = [];
      for (let i = 0; i < count; i++) {
        const r = Math.random() * 1.7 + 0.4;
        // bigger stars drift a touch faster → subtle parallax
        const speed = (Math.random() - 0.5) * 0.12 * (0.6 + r / 2);
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r,
          a: Math.random() * 0.45 + 0.5, // brighter base (0.5–0.95)
          tw: Math.random() * 0.03 + 0.008,
          ph: Math.random() * Math.PI * 2,
          vx: speed,
          vy: (Math.random() - 0.5) * 0.06,
          c: palette[(Math.random() * palette.length) | 0],
        });
      }
    };

    const resize = () => {
      const nw = canvas.clientWidth;
      const nh = canvas.clientHeight;
      w = nw;
      h = nh;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Only rebuild the field on a real width change or a large height change
      // (orientation). Mobile address-bar show/hide changes height by ~60-100px
      // while scrolling — rebuilding there makes the stars jump, which reads as
      // a janky "scroll animation". Keep the field stable in that case.
      if (nw !== lastW || Math.abs(nh - lastH) > 160 || stars.length === 0) {
        buildStars();
      }
      lastW = nw;
      lastH = nh;
    };

    // Debounce: ignore the rapid-fire resize events fired during a mobile scroll.
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 160);
    };

    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        s.ph += s.tw;
        const alpha = Math.max(0, Math.min(1, s.a + Math.sin(s.ph) * 0.45));
        if (!reduce) {
          s.x += s.vx;
          s.y += s.vy;
          if (s.x < 0) s.x = w;
          if (s.x > w) s.x = 0;
          if (s.y < 0) s.y = h;
          if (s.y > h) s.y = 0;
        }
        ctx.fillStyle = s.c;
        // soft glow halo for the larger stars
        if (s.r > 1.5) {
          ctx.globalAlpha = alpha * 0.22;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // shooting stars — several, falling often
      if (!reduce) {
        for (let k = shoots.length - 1; k >= 0; k--) {
          const sh = shoots[k];
          sh.x += sh.vx;
          sh.y += sh.vy;
          sh.life -= 1;
          const tx = sh.x - sh.vx * 9;
          const ty = sh.y - sh.vy * 9;
          const grad = ctx.createLinearGradient(sh.x, sh.y, tx, ty);
          grad.addColorStop(0, "rgba(255,255,255,0.9)");
          grad.addColorStop(1, "rgba(255,255,255,0)");
          ctx.globalAlpha = 1;
          ctx.strokeStyle = grad;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(sh.x, sh.y);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          if (sh.life <= 0 || sh.x > w + 60 || sh.y > h + 60) {
            shoots.splice(k, 1);
          }
        }
        if (--nextShootIn <= 0 && shoots.length < 5) {
          shoots.push({
            x: Math.random() * w * 0.7,
            y: Math.random() * h * 0.35,
            vx: 4 + Math.random() * 3.5,
            vy: 1.5 + Math.random() * 2.2,
            life: 130,
          });
          nextShootIn = 70 + Math.random() * 120; // ~1.2–3.2s @60fps
        }
      }

      ctx.globalAlpha = 1;
      if (!reduce) raf = requestAnimationFrame(frame);
    };

    resize();
    window.addEventListener("resize", onResize);
    frame();

    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(resizeTimer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [colors]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
}
