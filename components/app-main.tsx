"use client";

import type { ReactNode } from "react";
import { useFullscreen } from "@/lib/fullscreen";

/**
 * Mobile reserves pb-28 (112px) at the bottom of every page to clear the
 * fixed bottom nav. When the grocery page is in fullscreen mode that nav is
 * unmounted, so the reserved space collapses to match what desktop already
 * uses (pb-12) — otherwise there'd be a large empty gap under the last item.
 *
 * `fullscreen` only ever turns on from the grocery page's toggle, and Nav
 * resets it on any navigation away, so no pathname check is needed here.
 */
export function AppMain({ children }: { children: ReactNode }) {
  const fullscreen = useFullscreen();

  return (
    <main
      className={
        fullscreen
          ? "w-full max-w-7xl mx-auto px-4 pb-12 pt-5 md:px-6"
          : "w-full max-w-7xl mx-auto px-4 pb-28 pt-5 md:px-6 md:pb-12"
      }
    >
      {children}
    </main>
  );
}
