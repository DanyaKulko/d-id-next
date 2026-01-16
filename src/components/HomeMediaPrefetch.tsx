"use client";

import { useEffect, useMemo } from "react";

type HomeMediaPrefetchProps = {
  urls: string[];
};

const isSameOrigin = (url: string) => {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
};

export default function HomeMediaPrefetch({ urls }: HomeMediaPrefetchProps) {
  const uniqueUrls = useMemo(() => {
    return Array.from(new Set(urls.filter(Boolean)));
  }, [urls]);

  useEffect(() => {
    if (!uniqueUrls.length) return;
    let cancelled = false;

    const prefetch = async () => {
      for (const url of uniqueUrls) {
        if (cancelled) return;
        const sameOrigin = isSameOrigin(url);
        try {
          await fetch(url, {
            method: "GET",
            mode: sameOrigin ? "cors" : "no-cors",
            cache: "force-cache",
            credentials: "omit",
          });
        } catch {
          // Ignore prefetch failures; cache depends on CDN headers/CORS.
        }
      }
    };

    const timer = window.setTimeout(prefetch, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [uniqueUrls]);

  return null;
}
