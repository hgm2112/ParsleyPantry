"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Class-strategy theme provider (matches `@custom-variant dark` in
 * globals.css). Persists Light/Dark/System per device in localStorage.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
