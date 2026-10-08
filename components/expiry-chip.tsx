"use client";

import { use } from "react";
import { io } from "next/cache";
import { cn } from "@/lib/utils";
import { expiryBucket, formatExpiry } from "@/lib/expiry";

export function ExpiryChip({
  date,
  className,
}: {
  date: string | null;
  className?: string;
}) {
  use(io());
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
      {formatExpiry(date)}
    </span>
  );
}
