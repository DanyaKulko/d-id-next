"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "adminDevModeUntil";
const DEV_MODE_EVENT = "admin-dev-mode-change";
const DEFAULT_TTL_DAYS = 30;

const getExpiry = () => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return null;
  return parsed;
};

export const isDevModeEnabled = () => {
  const expiry = getExpiry();
  if (!expiry) return false;
  return Date.now() < expiry;
};

export const setDevModeEnabled = (enabled: boolean, ttlDays = DEFAULT_TTL_DAYS) => {
  if (typeof window === "undefined") return;
  if (enabled) {
    const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(STORAGE_KEY, String(Date.now() + ttlMs));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  window.dispatchEvent(new Event(DEV_MODE_EVENT));
};

export const useDevMode = () => {
  const [enabled, setEnabled] = useState(false);

  const refresh = useCallback(() => {
    setEnabled(isDevModeEnabled());
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener(DEV_MODE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(DEV_MODE_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, [refresh]);

  const expiresAt = useMemo(() => {
    const expiry = getExpiry();
    return expiry ? new Date(expiry) : null;
  }, [enabled]);

  return {
    enabled,
    expiresAt,
    setEnabled: (value: boolean, ttlDays?: number) =>
      setDevModeEnabled(value, ttlDays),
  };
};
