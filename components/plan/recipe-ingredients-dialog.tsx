"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { RecipeCoverage } from "@/lib/meal-summary";

export const STATUS_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  available: {
    label: "In pantry",
    className: "bg-primary/10 text-primary",
  },
  partial: {
    label: "Partial",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  missing: {
    label: "Needed",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
};

export function RecipeIngredientsDialog({
  open,
  onOpenChange,
  recipeName,
  coverage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipeName: string;
  coverage: RecipeCoverage;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{recipeName}</DialogTitle>
          <DialogDescription>
            Have {coverage.inPantry}/{coverage.total} in pantry
          </DialogDescription>
        </DialogHeader>

        {coverage.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No shopping-list ingredients for this recipe.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-background">
            {coverage.lines.map((line, index) => {
              const badge = STATUS_BADGE[line.status] ?? STATUS_BADGE.missing;
              return (
                <li
                  key={`${line.name}-${index}`}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {line.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {[
                        line.quantityText,
                        line.status === "partial" &&
                          line.haveQuantity > 0 &&
                          line.haveUnit
                          ? `Have ${line.haveQuantity} ${line.haveUnit}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                      badge.className,
                    )}
                  >
                    {badge.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
