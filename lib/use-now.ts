"use client";

import { useSyncExternalStore } from "react";

/**
 * Wall-clock reads for client components. The server snapshot is computed at
 * request time (these routes are dynamic), so hydration always matches the
 * server HTML and the client value wins right after.
 */
const subscribe = () => () => {};

const getDateKey = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const getHour = () => new Date().getHours();

/** Local date (YYYY-MM-DD) of "today", stable through hydration. */
export function useToday(): string {
  return useSyncExternalStore(subscribe, getDateKey, getDateKey);
}

/** Local hour of day (0–23), stable through hydration. */
export function useHour(): number {
  return useSyncExternalStore(subscribe, getHour, getHour);
}
