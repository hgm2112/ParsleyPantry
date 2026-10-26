"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChefHat, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  cookRecipe,
  previewRecipeCook,
  type RecipeCookItem,
} from "@/app/(app)/recipes/actions";
import { restoreBatches } from "@/app/(app)/inventory/actions";
import { displayQtyUnit } from "@/lib/stock";

function qtyText(quantity: number, unit: string | null): string {
  const { qtyText, unitText } = displayQtyUnit(quantity, unit);
  return `${qtyText}${unitText ? ` ${unitText}` : ""}`;
}

/** One-line pantry status for an ingredient. Never hides reserved stock. */
function statusLine(item: RecipeCookItem): string {
  if (!item.rootId) {
    return "Not matched to pantry — nothing will be deducted";
  }
  if (item.take <= 0) {
    return "Nothing available — reserved or out of stock";
  }
  if (item.shortfall <= 0) {
    return item.pantryName
      ? `Using ${qtyText(item.take, item.unit)} from ${item.pantryName}`
      : `Using ${qtyText(item.take, item.unit)} from your pantry`;
  }
  return `Have ${qtyText(item.available, item.unit)} — short ${qtyText(item.shortfall, item.unit)}`;
}

/**
 * Quick Bites "cook this" flow: shows every ingredient with its pantry
 * coverage, lets the user choose what leaves the pantry (required ones start
 * checked, optional ones don't), and deducts on confirm with an Undo toast.
 * Mount this only while open so its state re-initializes each time.
 */
export function CookRecipeDialog({
  recipeId,
  recipeName,
  onOpenChange,
}: {
  recipeId: string;
  recipeName: string;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<RecipeCookItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void previewRecipeCook(recipeId).then((result) => {
      if (!alive) return;
      if (!result.ok) {
        setLoadError(true);
        return;
      }
      setItems(result.data.items);
      setSelected(
        new Set(
          result.data.items
            .filter((item) => !item.optional && item.take > 0)
            .map((item) => item.id),
        ),
      );
    });
    return () => {
      alive = false;
    };
  }, [recipeId, attempt]);

  function retry() {
    setItems(null);
    setSelected(new Set());
    setLoadError(false);
    setAttempt((value) => value + 1);
  }

  function toggle(item: RecipeCookItem) {
    if (busy || !item.rootId || item.take <= 0) return;
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }

  async function confirm() {
    if (selected.size === 0) return;
    setBusy(true);
    const result = await cookRecipe({
      recipeId,
      ingredientIds: [...selected],
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const count = result.data.deducted.length;
    const skipped = result.data.skipped.length;
    toast.success(
      `${count} ingredient${count === 1 ? "" : "s"} used from your pantry${
        skipped ? ` · ${skipped} skipped` : ""
      }`,
      {
        duration: 8000,
        action: {
          label: "Undo",
          onClick: () =>
            void restoreBatches({ snapshots: result.data.snapshots }),
        },
      },
    );
    router.refresh();
    onOpenChange(false);
  }

  const eligible = items?.filter((item) => item.rootId && item.take > 0) ?? [];

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cook {recipeName}</DialogTitle>
          <DialogDescription>
            What left the pantry? Reserved meal-plan stock is left alone.{" "}
            <Link
              href={`/recipes/${recipeId}`}
              className="font-semibold text-primary hover:underline"
            >
              Open recipe →
            </Link>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-24 py-1">
          {loadError ? (
            <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              Couldn&apos;t load the pantry impact.
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={retry}
              >
                <RefreshCw /> Retry
              </Button>
            </div>
          ) : items === null ? (
            <ul className="space-y-2" aria-hidden>
              {[0, 1, 2].map((index) => (
                <li
                  key={index}
                  className="h-9 animate-pulse rounded-lg bg-muted"
                />
              ))}
            </ul>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">
                This recipe has no ingredients yet.
              </p>
              <p className="mt-1">
                Add ingredients to the recipe to deduct them here.
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {items.map((item) => {
                const isSelected = selected.has(item.id);
                const disabled = !item.rootId || item.take <= 0;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      disabled={busy || disabled}
                      onClick={() => toggle(item)}
                      className={[
                        "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        "disabled:cursor-default",
                        isSelected
                          ? "border-primary/40 bg-primary text-primary-foreground"
                          : disabled
                            ? "border bg-muted/40 text-muted-foreground"
                            : "border bg-background hover:border-primary/30 hover:bg-primary/10 active:bg-primary/15",
                      ].join(" ")}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate font-semibold">
                          {item.name}
                          {item.optional ? (
                            <span
                              className={
                                isSelected
                                  ? "ml-1 text-[11px] font-normal text-primary-foreground/70"
                                  : "ml-1 text-[11px] font-normal text-muted-foreground"
                              }
                            >
                              optional
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={
                            isSelected
                              ? "shrink-0 tabular-nums text-primary-foreground/80"
                              : "shrink-0 tabular-nums text-muted-foreground"
                          }
                        >
                          {item.quantityText}
                        </span>
                      </div>
                      <p
                        className={
                          isSelected
                            ? "mt-0.5 text-xs text-primary-foreground/80"
                            : "mt-0.5 text-xs text-muted-foreground"
                        }
                      >
                        {statusLine(item)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void confirm()}
            disabled={
              busy ||
              items === null ||
              loadError ||
              selected.size === 0 ||
              eligible.length === 0
            }
          >
            {busy ? <Loader2 className="animate-spin" /> : <ChefHat />}
            {busy
              ? "Working…"
              : selected.size > 0
                ? `Use ${selected.size} ingredient${selected.size === 1 ? "" : "s"}`
                : "Use ingredients"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
