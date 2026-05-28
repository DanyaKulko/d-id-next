"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import LottieLogo from "@/components/LottieLogo/LottieLogo";
import "./BrandLockup.css";

type BrandLockupProps = {
  /** Extra class on the outer container (e.g. for spacing/alignment). */
  className?: string;
  /** Render the wordmark as a link to the home page (used in the header). */
  asLink?: boolean;
  /** Size variant: "lg" enlarges the whole lockup (preloader, footers, login). */
  size?: "default" | "lg";
  /** Override the lamp Lottie animation path (default: the looping lamp). */
  lampPath?: string;
  /** Whether the lamp animation loops (default: true). */
  lampLoop?: boolean;
};

/**
 * Brand lockup: lamp animation on the left, stacked "Neil Avatar" wordmark +
 * tagline on the right. Shared across the header, login, page footers and
 * preloader. The wordmark anchors the lockup width and the tagline's
 * letter-spacing is computed in JS so the tagline matches the wordmark width
 * exactly — reliable across browsers (mobile in particular doesn't honour
 * `text-justify: inter-character`).
 */
export default function BrandLockup({
  className,
  asLink = false,
  size = "default",
  lampPath = "/lottie/lamp.json",
  lampLoop = true,
}: BrandLockupProps) {
  const titleRef = useRef<HTMLElement | null>(null);
  const tagRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const title = titleRef.current;
    const tag = tagRef.current;
    if (!title || !tag) return;
    const text = tag.textContent ?? "";
    if (!text) return;
    const gaps = Math.max(text.length - 1, 1);

    const fit = () => {
      // Measure tagline at zero tracking, then add exactly the amount needed.
      tag.style.letterSpacing = "0px";
      const titleW = title.getBoundingClientRect().width;
      const tagW = tag.getBoundingClientRect().width;
      if (titleW <= 0 || tagW <= 0) return;
      const extra = (titleW - tagW) / gaps;
      // Negative letter-spacing would crunch glyphs; clamp at 0.
      tag.style.letterSpacing = `${Math.max(0, extra)}px`;
    };

    fit();

    const ro = new ResizeObserver(fit);
    ro.observe(title);

    let cancelled = false;
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready
        .then(() => {
          if (!cancelled) fit();
        })
        .catch(() => {});
    }

    window.addEventListener("resize", fit);

    return () => {
      cancelled = true;
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  const classes = [
    "na-brand-lockup",
    size === "lg" ? "na-brand-lockup--lg" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <span className="na-brand-lockup-lamp" aria-hidden="true">
        <LottieLogo
          className="na-brand-lockup-lamp-anim"
          path={lampPath}
          loop={lampLoop}
        />
      </span>
      <div className="na-brand-lockup-text">
        {asLink ? (
          <Link
            ref={titleRef as React.RefObject<HTMLAnchorElement>}
            href="/"
            className="na-brand-lockup-title"
            aria-label="Neil Avatar"
          >
            Neil Avatar
          </Link>
        ) : (
          <span
            ref={titleRef as React.RefObject<HTMLSpanElement>}
            className="na-brand-lockup-title"
          >
            Neil Avatar
          </span>
        )}
        <span ref={tagRef} className="na-brand-lockup-tagline">
          Space. Travel. Sports. Politics.
        </span>
      </div>
    </div>
  );
}
