import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const TAGLINE = "Shop once. Cook easy. Eat well.";

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
      className={cn("flex items-center gap-2 font-semibold", className)}
    >
      <ParsleyMark className={cn("h-7 w-8", markClassName)} />
      <span>Parsley Pantry</span>
    </Link>
  );
}
