"use client";

import { useEffect, useState } from "react";
import BrandLockup from "@/components/BrandLockup/BrandLockup";

type ClientPreloaderProps = {
  minDurationMs?: number;
};

export default function ClientPreloader({
  // Long enough for the ~3.3s lamp-drawing video to play through once.
  minDurationMs = 3400,
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
        <BrandLockup size="lg" lampPath="/lottie/lamp-draw.json" lampLoop={false} />
      </div>
    </div>
  );
}
