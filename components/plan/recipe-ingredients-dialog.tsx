"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RecipeCoverage } from "@/lib/meal-summary";

export const STATUS_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  onList: {
    label: "On list",
    className: "bg-primary/10 text-primary",
  },
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
  recipeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipeName: string;
  coverage: RecipeCoverage;
  /** If provided, renders a "Take me to recipe" footer link that returns to the current plan view. */
  recipeId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{recipeName}</DialogTitle>
          <DialogDescription>
            Have {coverage.inPantry}/{coverage.total} in pantry
            {coverage.onList > 0 ? ` · ${coverage.onList} on list` : ""}
          </DialogDescription>
        </DialogHeader>

        {coverage.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No shopping-list ingredients for this recipe.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-background">
            {coverage.lines.map((line, index) => {
              // "On list" takes precedence in the badge for items that are
              // shoppable but already have an unchecked grocery line.
              const badgeKey = line.onList
                ? "onList"
                : line.status;
              const badge = STATUS_BADGE[badgeKey] ?? STATUS_BADGE.missing;
              const haveNote =
                line.status === "partial" &&
                line.haveQuantity > 0 &&
                line.haveUnit
                  ? `Have ${line.haveQuantity} ${line.haveUnit}`
                  : null;
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
                        haveNote,
                        line.onList ? "On list" : null,
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
        {recipeId ? (
          <DialogFooter className="pt-2">
            <RecipeLinkButton recipeId={recipeId} />
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RecipeLinkButton({ recipeId }: { recipeId: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const returnTo = `${pathname}${search?.toString() ? `?${search.toString()}` : ""}`;
  const href = `/recipes/${recipeId}?returnTo=${encodeURIComponent(returnTo)}`;
  return (
    <Button variant="outline" size="sm" render={<Link href={href} />}>
      Take me to recipe
    </Button>
  );
}
