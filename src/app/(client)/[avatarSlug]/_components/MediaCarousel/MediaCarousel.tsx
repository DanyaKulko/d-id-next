"use client";

import { useCallback, useEffect, useState } from "react";
import type { MediaItem } from "@/lib/media/types";
import "./MediaCarousel.css";

interface MediaCarouselProps {
  items: MediaItem[];
  startIndex: number;
  onClose: () => void;
}

const safeHostname = (url?: string): string | null => {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

export const MediaCarousel = ({
  items,
  startIndex,
  onClose,
}: MediaCarouselProps) => {
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(startIndex, 0), Math.max(items.length - 1, 0)),
  );

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => (i < items.length - 1 ? i + 1 : i));
  }, [items.length]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      } else if (event.key === "ArrowLeft") {
        event.stopPropagation();
        goPrev();
      } else if (event.key === "ArrowRight") {
        event.stopPropagation();
        goNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, onClose]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (items.length === 0) return null;
  const safeIndex = Math.min(index, items.length - 1);
  const item = items[safeIndex];
  const sourceHost = safeHostname(item.link ?? item.url);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click handled, keyboard via global listener
    <div
      className="na-media-carousel"
      role="dialog"
      aria-modal="true"
      aria-label="Media viewer"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="na-media-carousel__stage">
        <button
          type="button"
          className="na-media-carousel__close"
          onClick={onClose}
          aria-label="Close"
        >
          {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.88a1 1 0 0 0 0-1.41z" />
          </svg>
        </button>

        <div className="na-media-carousel__frame">
          {item.kind === "video" && item.embedUrl ? (
            <iframe
              key={item.id}
              src={`${item.embedUrl}?autoplay=1&rel=0`}
              className="na-media-carousel__iframe"
              title={item.title}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <img
              key={item.id}
              src={item.url}
              alt={item.title}
              className="na-media-carousel__image"
              referrerPolicy="no-referrer"
              onError={(event) => {
                const target = event.currentTarget as HTMLImageElement;
                if (
                  target.dataset.fallback !== "true" &&
                  item.thumbnailUrl &&
                  item.thumbnailUrl !== item.url
                ) {
                  target.dataset.fallback = "true";
                  target.src = item.thumbnailUrl;
                }
              }}
            />
          )}

          <button
            type="button"
            className="na-media-carousel__nav na-media-carousel__nav--prev"
            onClick={goPrev}
            disabled={safeIndex === 0}
            aria-label="Previous"
          >
            {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
            <svg viewBox="0 0 24 24">
              <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
          </button>

          <button
            type="button"
            className="na-media-carousel__nav na-media-carousel__nav--next"
            onClick={goNext}
            disabled={safeIndex === items.length - 1}
            aria-label="Next"
          >
            {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
            <svg viewBox="0 0 24 24">
              <path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
            </svg>
          </button>
        </div>

        <div className="na-media-carousel__meta">
          <p className="na-media-carousel__title">{item.title}</p>
          <span className="na-media-carousel__counter">
            {safeIndex + 1} / {items.length}
          </span>
          {sourceHost && (
            <a
              href={item.link ?? item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="na-media-carousel__source"
            >
              Open on {sourceHost}
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
