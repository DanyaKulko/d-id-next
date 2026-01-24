"use client";

import { useEffect, useRef } from "react";
import lottie, { type AnimationItem } from "lottie-web";

type LottieLogoProps = {
  className?: string;
  path?: string;
  loop?: boolean;
  autoplay?: boolean;
  playOnView?: boolean;
};

const DEFAULT_PATH = "/lottie/neil-logo.json";

export default function LottieLogo({
  className,
  path = DEFAULT_PATH,
  loop = false,
  autoplay = true,
  playOnView = false,
}: LottieLogoProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animationRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const animation: AnimationItem = lottie.loadAnimation({
      container: containerRef.current,
      renderer: "svg",
      loop,
      autoplay: playOnView ? false : autoplay,
      path,
      rendererSettings: {
        progressiveLoad: true,
        preserveAspectRatio: "xMidYMid meet",
      },
    });

    animationRef.current = animation;

    return () => {
      animation.destroy();
      animationRef.current = null;
    };
  }, [path, loop, autoplay, playOnView]);

  useEffect(() => {
    if (!playOnView) return;
    const node = containerRef.current;
    const animation = animationRef.current;
    if (!node || !animation) return;
    if (typeof IntersectionObserver === "undefined") {
      animation.play();
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!animation) return;
        if (entry?.isIntersecting) {
          animation.play();
        } else {
          animation.pause();
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [playOnView]);

  return <div className={className} ref={containerRef} />;
}
