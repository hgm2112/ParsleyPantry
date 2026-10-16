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
import { STATUS_BADGE } from "@/components/plan/recipe-ingredients-dialog";

export type WeekIngredientGroup = {
  recipeId: string;
  recipeName: string;
  coverage: RecipeCoverage;
};

export function WeekIngredientsDialog({
  open,
  onOpenChange,
  rangeLabel,
  groups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Oct 19 – Oct 25" */
  rangeLabel: string;
  groups: WeekIngredientGroup[];
}) {
  const totals = groups.reduce(
    (acc, group) => ({
      total: acc.total + group.coverage.total,
      inPantry: acc.inPantry + group.coverage.inPantry,
    }),
    { total: 0, inPantry: 0 },
  );
  const hasIngredients = totals.total > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ingredients</DialogTitle>
          <DialogDescription>
            {rangeLabel}
            {hasIngredients
              ? ` · Have ${totals.inPantry}/${totals.total} in pantry`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {!hasIngredients ? (
          <p className="text-sm text-muted-foreground">
            Nothing to shop for yet — plan a recipe day.
          </p>
        ) : (
          <div className="space-y-3">
            {groups.map((group, groupIndex) => (
              <section
                key={`${group.recipeId}-${groupIndex}`}
                className="space-y-1"
              >
                <h3 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
                  {group.recipeName} · {group.coverage.inPantry}/
                  {group.coverage.total}
                </h3>
                <ul className="divide-y rounded-lg border bg-background">
                  {group.coverage.lines.map((line, index) => {
                    const badge =
                      STATUS_BADGE[line.status] ?? STATUS_BADGE.missing;
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
              </section>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
