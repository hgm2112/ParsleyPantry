"use client";

import { use } from "react";
import { io } from "next/cache";
import { cn } from "@/lib/utils";
import { daysUntil, expiryBucket, formatExpiry } from "@/lib/expiry";
import { formatFreezerQuality, type ExpiryChipMode } from "@/lib/freezer";

export function ExpiryChip({
  date,
  mode = "refrigerated",
  className,
  short,
}: {
  date: string | null;
  mode?: ExpiryChipMode;
  className?: string;
  short?: boolean;
}) {
  use(io());

  // Frozen without a quality date (purchased frozen / not tracked yet).
  if (mode === "freezer-untracked") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-200",
          className,
        )}
      >
        Frozen (no date)
      </span>
    );
  }

  // Frozen with a computed best-quality-by date — quality reminders, never
  // "expired"/"unsafe" red.
  if (mode === "freezer") {
    if (!date) {
      return <span className="text-xs text-muted-foreground">Frozen</span>;
    }
    const days = daysUntil(date);
    const passed = days !== null && days < 0;
    const nearQuality = days !== null && days >= 0 && days <= 7;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
          passed
            ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
            : nearQuality
              ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200"
              : "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
          className,
        )}
      >
        {formatFreezerQuality(date)}
      </span>
    );
  }

  const bucket = expiryBucket(date);
  if (!bucket && !date) {
    return (
      <span className="text-xs text-muted-foreground">No expiry</span>
    );
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
      {formatExpiry(date, { short })}
    </span>
  );
}
