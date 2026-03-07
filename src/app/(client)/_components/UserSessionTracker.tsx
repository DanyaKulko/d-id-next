"use client";

import { useEffect, useRef } from "react";

const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

const getNextUrl = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

export default function UserSessionTracker() {
  const endedRef = useRef(false);
  const heartbeatInFlightRef = useRef(false);
  const idleTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);

  const sendHeartbeat = async () => {
    if (heartbeatInFlightRef.current) return;
    heartbeatInFlightRef.current = true;

    try {
      const response = await fetch("/api/user-session/heartbeat", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
      });

      if (response.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(getNextUrl())}`);
        return;
      }

      if (!response.ok) {
        return;
      }

      endedRef.current = false;
    } finally {
      heartbeatInFlightRef.current = false;
    }
  };

  const sendEnd = async (reason: string) => {
    if (heartbeatInFlightRef.current) return;
    heartbeatInFlightRef.current = true;

    try {
      await fetch("/api/user-session/end", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason }),
        cache: "no-store",
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => undefined);

      endedRef.current = true;
    } finally {
      heartbeatInFlightRef.current = false;
    }
  };

  const resetIdleTimer = () => {
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current);
    }

    idleTimerRef.current = window.setTimeout(() => {
      void sendEnd("IDLE_TIMEOUT");
    }, IDLE_TIMEOUT_MS);
  };

  useEffect(() => {
    const handleActivity = () => {
      resetIdleTimer();
      if (endedRef.current) {
        void sendHeartbeat();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        resetIdleTimer();
        void sendHeartbeat();
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "pointerdown",
      "pointermove",
      "keydown",
      "scroll",
      "touchstart",
      "focus",
    ];

    void sendHeartbeat();
    resetIdleTimer();

    heartbeatTimerRef.current = window.setInterval(() => {
      if (!endedRef.current) {
        void sendHeartbeat();
      }
    }, HEARTBEAT_INTERVAL_MS);

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, handleActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
      if (heartbeatTimerRef.current) {
        window.clearInterval(heartbeatTimerRef.current);
      }
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, handleActivity);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
