import Image from "next/image";
import Link from "next/link";
import localFont from "next/font/local";
import { cn } from "@/lib/utils";

export const TAGLINE = "Shop once. Cook easy. Eat well.";

/** Wordmark-only display face (AndBasR "Andy" handwriting, public domain). */
const andy = localFont({
  src: "../fonts/andbasr.ttf",
  weight: "400",
  display: "swap",
  variable: "--font-andy",
});

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
      src="/parsleypantrylogo.svg"
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
      className={cn("flex items-center gap-2 font-extrabold", className)}
    >
      <ParsleyMark className={cn("h-8.75 w-10", markClassName)} />
      <span className={cn(andy.className, "text-[1.4em] font-normal leading-none -translate-y-[0.08em] whitespace-nowrap")}>
        ParsleyPantry
      </span>
    </Link>
  );
}
