import Image from "next/image";
import Link from "next/link";
import localFont from "next/font/local";
import { cn } from "@/lib/utils";

export const TAGLINE = "Shop once. Cook easy. Eat well.";

/** Wordmark/slogan display face (user-provided FONTE). */
const brand = localFont({
  src: "../fonts/FONTE___.ttf",
  weight: "400",
  display: "swap",
  variable: "--font-brand",
  adjustFontFallback: false,
});

/** Brand display-font class for the wordmark and slogan. */
export const brandClassName = brand.className;

/**
 * Parsley illustration (user-provided artwork). Rendered unoptimized so the
 * static SVG from /public is served as-is.
 */
export function ParsleyMark({
  className,
  alt = "",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <Image
      src="/parsley.svg"
      alt={alt}
      width={1800}
      height={1584}
      unoptimized
      className={cn("select-none", className)}
      aria-hidden={alt === "" ? true : undefined}
    />
  );
}

/** Full Parsley Pantry logo (user-provided artwork), portrait 936×1008. */
export function LogoMark({
  className,
  alt = "",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <Image
      src="/parsleypantrylogov2.svg"
      alt={alt}
      width={936}
      height={1008}
      unoptimized
      className={cn("select-none", className)}
      aria-hidden={alt === "" ? true : undefined}
    />
  );
}

export function Wordmark({
  className,
  markClassName,
  href = "/home",
}: {
  className?: string;
  markClassName?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("flex min-w-0 items-center gap-2 font-extrabold", className)}
    >
      <ParsleyMark className={cn("h-8.75 w-10 shrink-0", markClassName)} />
      {/* min-w-0 + truncate: on a 360px screen the mobile header only has a few
          px to spare, and any text-scaling/screen-zoom setting is enough to
          overflow it. The mark stays fixed; the wordmark ellipsizes instead. */}
      <span
        className={cn(
          brand.className,
          "min-w-0 truncate text-[1.4em] font-normal leading-none -translate-y-[0.08em] whitespace-nowrap pb-[0.2em] -mb-[0.2em]",
        )}
      >
        ParsleyPantry
      </span>
    </Link>
  );
}
