"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { WeekSummary } from "@/lib/meal-summary";

export function WeekIngredientsDialog({
  open,
  onOpenChange,
  rangeLabel,
  summary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Week 1 · Oct 13 – Oct 19" */
  rangeLabel: string;
  summary: WeekSummary;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ingredients</DialogTitle>
          <DialogDescription>
            {rangeLabel}
            {summary.total > 0
              ? ` · Have ${summary.inPantry}/${summary.total} in pantry`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {summary.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing to shop for yet — plan a recipe day.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-background">
            {summary.lines.map((line, index) => (
              <li
                key={`${line.name}-${index}`}
                className="flex items-center justify-between gap-2 px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {line.name}
                  </span>
                  {line.quantityText ? (
                    <span className="block text-xs text-muted-foreground">
                      {line.quantityText}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                    line.covered
                      ? "bg-primary/10 text-primary"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                  )}
                >
                  {line.covered ? "✓ pantry" : "needed"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
