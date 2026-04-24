"use client";

import { useEffect, useState } from "react";
import type { MediaItem } from "@/lib/media/types";
import "./MediaOverlay.css";

const SLOT_CLASSES = [
  "na-media-overlay__slot--tl",
  "na-media-overlay__slot--tr",
  "na-media-overlay__slot--bl",
  "na-media-overlay__slot--br",
] as const;

interface MediaOverlayProps {
  items: MediaItem[];
  visible: boolean;
  onItemClick: (index: number) => void;
}

export const MediaOverlay = ({
  items,
  visible,
  onItemClick,
}: MediaOverlayProps) => {
  const [mountedKey, setMountedKey] = useState(0);

  useEffect(() => {
    if (visible) {
      setMountedKey((k) => k + 1);
    }
  }, [visible, items]);

  if (!visible || items.length === 0) return null;

  return (
    <div
      className="na-media-overlay"
      aria-live="polite"
      aria-label="Media results"
    >
      {items.slice(0, 4).map((item, index) => (
        <div
          key={`${mountedKey}-${item.id}`}
          className={`na-media-overlay__slot ${SLOT_CLASSES[index]} na-media-overlay__slot--visible`}
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
            {item.title && (
              <span className="na-media-card__title">{item.title}</span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
};
