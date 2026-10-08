"use client";

import { use, useSyncExternalStore } from "react";
import { io } from "next/cache";

/**
 * Wall-clock reads for client components. `use(io())` keeps the read out of
 * the prerendered shell; on real requests and in the browser `io()` resolves
 * immediately, so the snapshot is computed at request time and hydration
 * always matches the server HTML.
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
  use(io());
  return useSyncExternalStore(subscribe, getDateKey, getDateKey);
}

/** Local hour of day (0–23), stable through hydration. */
export function useHour(): number {
  use(io());
  return useSyncExternalStore(subscribe, getHour, getHour);
}
