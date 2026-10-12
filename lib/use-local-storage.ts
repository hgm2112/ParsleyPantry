"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * localStorage-backed state that is safe to read during hydration:
 * the server snapshot is always null, so the client re-renders with the
 * stored value after mount without a hydration mismatch.
 */

const caches = new Map<string, string | null>();
const listeners = new Map<string, Set<() => void>>();

function read(key: string): string | null {
  if (!caches.has(key)) {
    caches.set(key, window.localStorage.getItem(key));
  }
  return caches.get(key) ?? null;
}

function subscribe(key: string, callback: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(callback);
  return () => {
    set?.delete(callback);
  };
}

function notify(key: string) {
  caches.delete(key);
  listeners.get(key)?.forEach((callback) => callback());
}

export function useLocalStorage(
  key: string,
): [string | null, (value: string | null) => void] {
  const value = useSyncExternalStore(
    useCallback((callback: () => void) => subscribe(key, callback), [key]),
    useCallback(() => read(key), [key]),
    () => null,
  );

  const setValue = useCallback(
    (next: string | null) => {
      if (next === null) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, next);
      }
      notify(key);
    },
    [key],
  );

  return [value, setValue];
}

export function useStoredEnum<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, (value: T) => void] {
  const [raw, setRaw] = useLocalStorage(key);
  const value: T =
    raw !== null && (allowed as readonly string[]).includes(raw)
      ? (raw as T)
      : fallback;
  return [value, (next: T) => setRaw(next)];
}

/**
 * JSON-backed state for structured values that must survive navigation (e.g.
 * the Just Bought trip list). Same hydration contract as useLocalStorage: the
 * server snapshot is null, so the first client render matches the server and
 * the stored value appears right after mount.
 *
 * `isValid` is a guard for stale/corrupt stored data — anything that fails
 * falls back. The setter accepts a value or an updater and reads the CURRENT
 * stored value (not the render-time one) before writing, so updates made
 * across awaits stay consistent.
 *
 * Note: like React's own useState, the updater form assumes T is not itself
 * a function type.
 */
export function useStoredJson<T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): [T, (next: T | ((current: T) => T)) => void] {
  const [raw, setRaw] = useLocalStorage(key);

  let value: T = fallback;
  if (raw !== null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isValid(parsed)) value = parsed;
    } catch {
      // Corrupt entry — keep the fallback.
    }
  }

  const setValue = useCallback(
    (next: T | ((current: T) => T)) => {
      let current: T = fallback;
      // Read through localStorage directly: another update may have landed
      // since this closure's render.
      const currentRaw = window.localStorage.getItem(key);
      if (currentRaw !== null) {
        try {
          const parsed: unknown = JSON.parse(currentRaw);
          if (isValid(parsed)) current = parsed;
        } catch {
          // fall through to fallback
        }
      }
      const resolved =
        typeof next === "function" ? (next as (value: T) => T)(current) : next;
      setRaw(JSON.stringify(resolved));
    },
    [key, fallback, isValid],
  );

  return [value, setValue];
}
