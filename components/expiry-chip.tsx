"use client";

import { use } from "react";
import { io } from "next/cache";
import { Calendar, Snowflake } from "lucide-react";
import { cn } from "@/lib/utils";
import { daysUntil, expiryBucket, formatExpiry, parseDate } from "@/lib/expiry";
import { formatFreezerQuality, type ExpiryChipMode } from "@/lib/freezer";

function formatBestBy(dateStr: string): string {
  return `Best by ${parseDate(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

export function ExpiryChip({
  date,
  mode = "refrigerated",
  className,
  short,
  showIcon = false,
  bestBy = false,
}: {
  date: string | null;
  mode?: ExpiryChipMode;
  className?: string;
  short?: boolean;
  /** Show a small leading icon (calendar/snowflake as appropriate). */
  showIcon?: boolean;
  /** Prefer "Best by ..." label for dated chips when applicable. */
  bestBy?: boolean;
}) {
  use(io());

  // Frozen without a quality date (not tracked yet).
  if (mode === "freezer-untracked") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-200",
          className,
        )}
      >
        {showIcon ? <Snowflake className="h-3 w-3" /> : null}
        Frozen (no date)
      </span>
    );
  }

  // Bought already frozen: original freezing date unknown.
  if (mode === "freezer-purchased") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-200",
          className,
        )}
      >
        {showIcon ? <Snowflake className="h-3 w-3" /> : null}
        Purchased frozen
      </span>
    );
  }

  // Frozen with a computed best-quality-by date.
  if (mode === "freezer") {
    if (!date) {
      return (
        <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
          {showIcon ? <Snowflake className="h-3 w-3" /> : null}
          Frozen
        </span>
      );
    }
    const days = daysUntil(date);
    const passed = days !== null && days < 0;
    const nearQuality = days !== null && days >= 0 && days <= 7;
    const label = bestBy && !passed ? formatBestBy(date) : formatFreezerQuality(date);
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
          passed
            ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
            : nearQuality
              ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
              : "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
          className,
        )}
      >
        {showIcon ? <Calendar className="h-3 w-3" /> : null}
        {label}
      </span>
    );
  }

  const bucket = expiryBucket(date);
  if (!bucket && !date) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
        {showIcon ? <Calendar className="h-3 w-3" /> : null}
        No expiry
      </span>
    );
  }

  let label = formatExpiry(date, { short });
  if (bestBy && date && bucket && bucket !== "expired") {
    // Prefer "Best by <date>" for calm/readable batch chips when not expired.
    label = formatBestBy(date);
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        bucket === "expired" && "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
        bucket === "urgent" &&
          "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
        bucket === "soon" &&
          "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
        bucket === "ok" &&
          "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
        !bucket && "bg-muted text-muted-foreground",
        className,
      )}
    >
      {showIcon ? <Calendar className="h-3 w-3" /> : null}
      {label}
    </span>
  );
}
