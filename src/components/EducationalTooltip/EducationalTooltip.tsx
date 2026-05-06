"use client";

import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import "./EducationalTooltip.css";

type Position = "top" | "bottom";

type EducationalTooltipProps = {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  position?: Position;
  autoDismissMs?: number;
  children: React.ReactNode;
};

const TOOLTIP_GAP_PX = 10;
const VIEWPORT_MARGIN_PX = 12;
const DEFAULT_AUTO_DISMISS_MS = 10000;

export default function EducationalTooltip({
  anchorRef,
  open,
  onClose,
  position = "bottom",
  autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
  children,
}: EducationalTooltipProps) {
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    actualPosition: Position;
  } | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const recompute = useCallback(() => {
    const anchor = anchorRef.current;
    const tip = tooltipRef.current;
    if (!anchor || !tip) return;
    const a = anchor.getBoundingClientRect();
    const tipH = tip.offsetHeight;
    const tipW = tip.offsetWidth;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceBelow = vh - a.bottom;
    const spaceAbove = a.top;
    const requiredSpace = tipH + TOOLTIP_GAP_PX + VIEWPORT_MARGIN_PX;
    const wantBottom = position === "bottom";

    let actualPosition: Position;
    if (wantBottom) {
      actualPosition =
        spaceBelow >= requiredSpace
          ? "bottom"
          : spaceAbove > spaceBelow
            ? "top"
            : "bottom";
    } else {
      actualPosition =
        spaceAbove >= requiredSpace
          ? "top"
          : spaceBelow > spaceAbove
            ? "bottom"
            : "top";
    }

    const top =
      actualPosition === "bottom"
        ? a.bottom + TOOLTIP_GAP_PX
        : a.top - tipH - TOOLTIP_GAP_PX;

    let left = a.left + a.width / 2 - tipW / 2;
    left = Math.max(VIEWPORT_MARGIN_PX, left);
    left = Math.min(vw - tipW - VIEWPORT_MARGIN_PX, left);

    setCoords({ top, left, actualPosition });
  }, [anchorRef, position]);

  useLayoutEffect(() => {
    if (!open) return;
    recompute();
    const handler = () => recompute();
    window.addEventListener("scroll", handler, { passive: true, capture: true });
    window.addEventListener("resize", handler, { passive: true });
    return () => {
      window.removeEventListener("scroll", handler, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", handler);
    };
  }, [open, recompute]);

  useEffect(() => {
    if (!open) return;
    if (!autoDismissMs || autoDismissMs <= 0) return;
    const id = window.setTimeout(onClose, autoDismissMs);
    return () => window.clearTimeout(id);
  }, [open, autoDismissMs, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const style: React.CSSProperties = coords
    ? { top: coords.top, left: coords.left, visibility: "visible" }
    : { top: -9999, left: -9999, visibility: "hidden" };

  const dataPosition = coords?.actualPosition ?? position;

  return createPortal(
    <div
      ref={tooltipRef}
      className="na-edu-tooltip"
      data-position={dataPosition}
      style={style}
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        className="na-edu-tooltip__close"
        onClick={onClose}
        aria-label="Close tooltip"
      >
        ×
      </button>
      <div className="na-edu-tooltip__body">{children}</div>
      <span className="na-edu-tooltip__arrow" aria-hidden="true" />
    </div>,
    document.body,
  );
}
