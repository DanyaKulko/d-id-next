"use client";

import { useState } from "react";
import type { MediaItem, MediaResolveResult } from "@/lib/media/types";
import "./DebugMediaPanel.css";

const DEMO_PHOTOS: MediaItem[] = [
  {
    id: "demo-photo-1",
    kind: "photo",
    url: "https://picsum.photos/seed/eiffel/1200/900",
    thumbnailUrl: "https://picsum.photos/seed/eiffel/400/300",
    title: "Eiffel Tower sunset",
    source: "picsum.photos",
    link: "https://picsum.photos/seed/eiffel/1200/900",
  },
  {
    id: "demo-photo-2",
    kind: "photo",
    url: "https://picsum.photos/seed/bali/1200/900",
    thumbnailUrl: "https://picsum.photos/seed/bali/400/300",
    title: "Bali rice terraces",
    source: "picsum.photos",
    link: "https://picsum.photos/seed/bali/1200/900",
  },
  {
    id: "demo-photo-3",
    kind: "photo",
    url: "https://picsum.photos/seed/kyoto/1200/900",
    thumbnailUrl: "https://picsum.photos/seed/kyoto/400/300",
    title: "Kyoto temple garden",
    source: "picsum.photos",
    link: "https://picsum.photos/seed/kyoto/1200/900",
  },
  {
    id: "demo-photo-4",
    kind: "photo",
    url: "https://picsum.photos/seed/iceland/1200/900",
    thumbnailUrl: "https://picsum.photos/seed/iceland/400/300",
    title: "Iceland aurora",
    source: "picsum.photos",
    link: "https://picsum.photos/seed/iceland/1200/900",
  },
];

const DEMO_VIDEOS: MediaItem[] = [
  {
    id: "demo-video-1",
    kind: "video",
    url: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
    thumbnailUrl: "https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg",
    title: "lofi hip hop radio — beats to relax/study to",
    source: "Lofi Girl",
    link: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
    embedUrl: "https://www.youtube.com/embed/jfKfPfyJRdk",
  },
  {
    id: "demo-video-2",
    kind: "video",
    url: "https://www.youtube.com/watch?v=hFZFjoX2cGg",
    thumbnailUrl: "https://i.ytimg.com/vi/hFZFjoX2cGg/hqdefault.jpg",
    title: "Iceland 4K Cinematic Travel Film",
    source: "Travel Channel",
    link: "https://www.youtube.com/watch?v=hFZFjoX2cGg",
    embedUrl: "https://www.youtube.com/embed/hFZFjoX2cGg",
  },
  {
    id: "demo-video-3",
    kind: "video",
    url: "https://www.youtube.com/watch?v=5qap5aO4i9A",
    thumbnailUrl: "https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg",
    title: "Chillhop Essentials Spring",
    source: "Chillhop Music",
    link: "https://www.youtube.com/watch?v=5qap5aO4i9A",
    embedUrl: "https://www.youtube.com/embed/5qap5aO4i9A",
  },
  {
    id: "demo-video-4",
    kind: "video",
    url: "https://www.youtube.com/watch?v=21X5lGlDOfg",
    thumbnailUrl: "https://i.ytimg.com/vi/21X5lGlDOfg/hqdefault.jpg",
    title: "NASA Live: Earth from Space",
    source: "NASA",
    link: "https://www.youtube.com/watch?v=21X5lGlDOfg",
    embedUrl: "https://www.youtube.com/embed/21X5lGlDOfg",
  },
];

interface DebugMediaPanelProps {
  onLoad: (result: MediaResolveResult) => void;
  onClear: () => void;
}

export const DebugMediaPanel = ({ onLoad, onClear }: DebugMediaPanelProps) => {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className="na-debug-panel__toggle"
        onClick={() => setOpen(true)}
        aria-label="Open media debug panel"
        title="Media debug (dev only)"
      >
        🐞
      </button>
    );
  }

  return (
    <div className="na-debug-panel" role="region" aria-label="Media debug">
      <p className="na-debug-panel__title">Media debug (dev)</p>
      <div className="na-debug-panel__row">
        <button
          type="button"
          className="na-debug-panel__btn"
          onClick={() =>
            onLoad({
              intent: "photo_from_external",
              items: DEMO_PHOTOS,
              spokenText: "[debug] photos",
            })
          }
        >
          4 photos
        </button>
        <button
          type="button"
          className="na-debug-panel__btn"
          onClick={() =>
            onLoad({
              intent: "photo_from_external",
              items: DEMO_PHOTOS.slice(0, 1),
              spokenText: "[debug] single photo",
            })
          }
        >
          1 photo
        </button>
      </div>
      <div className="na-debug-panel__row">
        <button
          type="button"
          className="na-debug-panel__btn"
          onClick={() =>
            onLoad({
              intent: "video_from_external",
              items: DEMO_VIDEOS,
              spokenText: "[debug] videos",
            })
          }
        >
          4 videos
        </button>
        <button
          type="button"
          className="na-debug-panel__btn"
          onClick={() =>
            onLoad({
              intent: "video_from_external",
              items: DEMO_VIDEOS.slice(0, 1),
              spokenText: "[debug] single video",
            })
          }
        >
          1 video
        </button>
      </div>
      <div className="na-debug-panel__row">
        <button
          type="button"
          className="na-debug-panel__btn"
          onClick={() =>
            onLoad({
              intent: "photo_from_blog",
              items: [
                DEMO_PHOTOS[0],
                DEMO_VIDEOS[0],
                DEMO_PHOTOS[1],
                DEMO_VIDEOS[1],
              ],
              spokenText: "[debug] mixed",
            })
          }
        >
          Mixed
        </button>
        <button
          type="button"
          className="na-debug-panel__btn na-debug-panel__btn--clear"
          onClick={() => {
            onClear();
            setOpen(false);
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
};
