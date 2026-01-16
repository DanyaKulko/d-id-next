"use client";

import { useEffect, useRef } from "react";
import lottie, { type AnimationItem } from "lottie-web";

type LottieLogoProps = {
  className?: string;
  path?: string;
  loop?: boolean;
  autoplay?: boolean;
};

const DEFAULT_PATH = "/lottie/neil-logo.json";

export default function LottieLogo({
  className,
  path = DEFAULT_PATH,
  loop = false,
  autoplay = true,
}: LottieLogoProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const animation: AnimationItem = lottie.loadAnimation({
      container: containerRef.current,
      renderer: "svg",
      loop,
      autoplay,
      path,
      rendererSettings: {
        progressiveLoad: true,
        preserveAspectRatio: "xMidYMid meet",
      },
    });

    return () => animation.destroy();
  }, [path, loop, autoplay]);

  return <div className={className} ref={containerRef} />;
}
