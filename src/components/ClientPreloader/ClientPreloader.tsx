"use client";

import { useEffect, useState } from "react";
import LottieLogo from "@/components/LottieLogo/LottieLogo";

type ClientPreloaderProps = {
  minDurationMs?: number;
};

export default function ClientPreloader({
  minDurationMs = 600,
}: ClientPreloaderProps) {
  const [phase, setPhase] = useState<"visible" | "hiding" | "hidden">(
    "visible",
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setPhase("hiding");
    }, minDurationMs);

    return () => clearTimeout(timer);
  }, [minDurationMs]);

  if (phase === "hidden") return null;

  return (
    <div
      className={`na-preloader ${phase === "hiding" ? "na-preloader--hide" : ""}`}
      onTransitionEnd={() => {
        if (phase === "hiding") setPhase("hidden");
      }}
    >
      <div className="na-preloader__content">
        <LottieLogo
          className="na-preloader__anim"
          path="/lottie/preload.json"
          // loop
          autoplay
        />
        <div className="na-preloader__label">Loading</div>
      </div>
    </div>
  );
}
