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
