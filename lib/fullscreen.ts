"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * In-memory (not persisted) fullscreen flag shared between the grocery page's
 * toggle button and the app-shell Nav, which hides the mobile header/bottom
 * bar while it's on. Resets on reload/navigation away — a transient toggle,
 * not a saved preference.
 */

let fullscreen = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((callback) => callback());
}

export function setFullscreen(value: boolean) {
  if (fullscreen === value) return;
  fullscreen = value;
  emit();
}

export function toggleFullscreen() {
  setFullscreen(!fullscreen);
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function useFullscreen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => fullscreen,
    () => false,
  );
}

/** Convenience for handlers that just want to flip the flag. */
export function useToggleFullscreen(): () => void {
  return useCallback(() => toggleFullscreen(), []);
}
