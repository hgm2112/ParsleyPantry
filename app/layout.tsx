import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Manrope, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { ThemeColorSync } from "@/components/theme-color-sync";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

/**
 * UI face: ElValle (Jorge Algarin, 2019).
 * Cuts: Light (300), Regular/Normal (500), Bold (700) + real italics.
 *
 * - Regular weight in the font is 500, so body sits at 500.
 * - `adjustFontFallback: false` keeps Manrope as the first fallback for the
 *   glyphs ElValle lacks (mainly en/em dashes and ✓).
 * - `preload: false` to avoid pulling ~700 KB of TTFs on every page.
 */
const elvalleSans = localFont({
  src: [
    { path: "../fonts/elvalle-light.ttf", weight: "300", style: "normal" },
    { path: "../fonts/elvalle-light-italic.ttf", weight: "300", style: "italic" },
    { path: "../fonts/elvalle-regular.ttf", weight: "500", style: "normal" },
    { path: "../fonts/elvalle-italic.ttf", weight: "500", style: "italic" },
    { path: "../fonts/elvalle-bold.ttf", weight: "700", style: "normal" },
    { path: "../fonts/elvalle-bold-italic.ttf", weight: "700", style: "italic" },
  ],
  variable: "--font-elvalle",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

/** Glyph fallback only (ElValle lacks en/em dashes and check marks). */
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
      className={`${elvalleSans.variable} ${manropeFallback.variable} ${geistMono.variable} h-full antialiased`}
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
