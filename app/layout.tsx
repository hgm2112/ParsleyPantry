import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Manrope, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { ThemeColorSync } from "@/components/theme-color-sync";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

/**
 * UI face: user-provided Advent, seven static cuts (100–900).
 *
 * - `adjustFontFallback: false` keeps Manrope as the first fallback in
 *   `--font-sans`, so the punctuation Advent lacks (em/en dash, middot,
 *   arrows, check marks) renders in a consistent webfont instead of Arial.
 * - `preload: false` because one localFont call shares its preload setting
 *   across every file it loads — preloading would pull all ~430 KB of OTF.
 */
const adventSans = localFont({
  src: [
    { path: "../fonts/advent-Lt3.otf", weight: "100", style: "normal" },
    { path: "../fonts/advent-Lt2.otf", weight: "200", style: "normal" },
    { path: "../fonts/advent-Lt1.otf", weight: "300", style: "normal" },
    { path: "../fonts/advent-Re.otf", weight: "400", style: "normal" },
    { path: "../fonts/advent-Bd1.otf", weight: "700", style: "normal" },
    { path: "../fonts/advent-Bd2.otf", weight: "800", style: "normal" },
    { path: "../fonts/advent-Bd3.otf", weight: "900", style: "normal" },
  ],
  variable: "--font-advent",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

/** Glyph fallback only (Advent has no em dash / middot / arrow). */
const manropeFallback = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Parsley Pantry",
    template: "%s · Parsley Pantry",
  },
  description:
    "Barcode-first pantry inventory, grocery lists, recipes and meal planning for your household.",
  icons: {
    icon: "/parsley2.svg",
  },
  appleWebApp: {
    capable: true,
    title: "Parsley Pantry",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "auto",
  colorScheme: "light dark",
  themeColor: [
    // Parsley green for both schemes; this drives the Android installed-app
    // browser/system UI, including the bottom navigation bar.
    { media: "(prefers-color-scheme: light)", color: "#009444" },
    { media: "(prefers-color-scheme: dark)", color: "#009444" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${adventSans.variable} ${manropeFallback.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-dvh flex flex-col bg-background text-foreground">
        <ThemeProvider>
          <ThemeColorSync />
          {children}
          <Toaster position="top-center" richColors closeButton />
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
