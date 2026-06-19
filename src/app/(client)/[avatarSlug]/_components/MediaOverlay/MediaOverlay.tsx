"use client";

import { useEffect, useState } from "react";
import type { MediaItem } from "@/lib/media/types";
import "./MediaOverlay.css";

interface MediaOverlayProps {
  items: MediaItem[];
  visible: boolean;
  onItemClick: (index: number) => void;
  onClose: () => void;
}

export const MediaOverlay = ({
  items,
  visible,
  onItemClick,
  onClose,
}: MediaOverlayProps) => {
  const [mountedKey, setMountedKey] = useState(0);

  useEffect(() => {
    if (visible) {
      setMountedKey((k) => k + 1);
    }
  }, [visible]);

  if (!visible || items.length === 0) return null;

  return (
    <section
      className="na-media-overlay"
      aria-live="polite"
      aria-label="Media results"
    >
      <div className="na-media-overlay__grid">
        {items.slice(0, 4).map((item, index) => (
          <div
            key={`${mountedKey}-${item.id}`}
            className="na-media-overlay__slot na-media-overlay__slot--visible"
            style={{ transitionDelay: `${index * 80}ms` }}
          >
            <button
              type="button"
              className="na-media-card"
              onClick={() => onItemClick(index)}
              title={item.title}
              aria-label={`Open ${item.kind === "video" ? "video" : "photo"}: ${item.title}`}
            >
              <img
                src={item.thumbnailUrl}
                alt={item.title}
                className="na-media-card__image"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(event) => {
                  const target = event.currentTarget as HTMLImageElement;
                  if (
                    target.dataset.fallback !== "true" &&
                    item.url !== item.thumbnailUrl
                  ) {
                    target.dataset.fallback = "true";
                    target.src = item.url;
                  }
                }}
              />
              {item.kind === "video" && (
                <span className="na-media-card__play" aria-hidden="true">
                  {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
                  <svg viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              )}
            </button>

            {/* Round close button on the top photo's corner — closes all media. */}
            {index === 0 && (
              <button
                type="button"
                className="na-media-overlay__close"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose();
                }}
                aria-label="Close media"
                title="Close"
              >
                {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="currentColor"
                >
                  <path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.88a1 1 0 0 0 0-1.41z" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};
