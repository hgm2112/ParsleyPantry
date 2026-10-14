"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

/**
 * Keeps <meta name="theme-color"> in step with the app's theme (the .dark
 * class), not just the OS scheme. Android paints the installed PWA's system
 * navigation bar with this meta — with the static media-query tags alone, a
 * dark app on a light OS (or vice versa) shows a mismatched strip at the
 * bottom. Values mirror the --background tokens in globals.css.
 */
const COLORS = { light: "#009444", dark: "#009444" } as const;

export function ThemeColorSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const color = COLORS[resolvedTheme === "dark" ? "dark" : "light"];
    for (const meta of document.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]',
    )) {
      meta.setAttribute("content", color);
    }
  }, [resolvedTheme]);

  return null;
}
