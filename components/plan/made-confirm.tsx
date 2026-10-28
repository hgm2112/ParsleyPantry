"use client";

import { useEffect, useState } from "react";
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
import { markMealMade, previewMealMade } from "@/app/(app)/plan/actions";
import { displayQtyUnit } from "@/lib/stock";
import { cn } from "@/lib/utils";
import type { Tint } from "@/lib/tints";
import { tintFor } from "@/lib/tints";

type PreviewItem = {
  name: string;
  quantityText: string;
  optional: boolean;
  /** Differently named pantry item the recipe name resolved to, when any. */
  pantryName: string | null;
  matched: boolean;
  /** Numbers are in the recipe's own unit. */
  unit: string | null;
  needed: number;
  available: number;
  take: number;
  shortfall: number;
};

function qtyText(quantity: number, unit: string | null): string {
  const { qtyText, unitText } = displayQtyUnit(quantity, unit);
  return `${qtyText}${unitText ? ` ${unitText}` : ""}`;
}

/** One-line pantry status for an ingredient. Never hides shortfalls. */
function statusLine(item: PreviewItem): string {
  if (!item.matched) {
    return "Not matched to pantry — nothing will be deducted";
  }
  if (item.shortfall <= 0) {
    return item.pantryName
      ? `Using ${qtyText(item.take, item.unit)} from ${item.pantryName}`
      : `Using ${qtyText(item.take, item.unit)} from your pantry`;
  }
  if (item.take > 0) {
    return `Have ${qtyText(item.available, item.unit)} — short ${qtyText(item.shortfall, item.unit)}`;
  }
  return `Not in pantry — need ${qtyText(item.needed, item.unit)}`;
}

type Props = {
  weekStart: string;
  dayIndex: number;
  mealName?: string | null;
  /** Optional tint for the recipe/meal. Falls back to computing from mealName. */
  tint?: Tint;
  onCancel: () => void;
  onConfirmed?: () => void;
};

/**
 * Confirmation step before marking a meal made: shows EVERY ingredient of the
 * day's planned recipe with its pantry match and coverage. Each row toggles
 * whether that ingredient is deducted from inventory on confirm (selected =
 * ingredients with available stock, by default). Read-only preview;
 * markMealMade deducts only the selected ingredients' eligible stock.
 */
export function MadeConfirmContent({
  weekStart,
  dayIndex,
  mealName,
  tint,
  onCancel,
  onConfirmed,
}: Props) {
  const router = useRouter();
  const effectiveTint = tint ?? (mealName ? tintFor(mealName.split("·")[0].trim()) : null);
  const [items, setItems] = useState<PreviewItem[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void previewMealMade({ weekStart, dayIndex }).then((result) => {
      if (!alive) return;
      if (!result.ok) {
        setLoadError(true);
        return;
      }
      setItems(result.data.items);
      // Default: select ingredients the pantry can actually contribute to.
      setSelected(
        new Set(
          result.data.items
            .map((item, index) => (item.take > 0 ? index : -1))
            .filter((index) => index >= 0),
        ),
      );
    });
    return () => {
      alive = false;
    };
  }, [weekStart, dayIndex, attempt]);

  function retry() {
    setLoadError(false);
    setItems(null);
    setSelected(new Set());
    setAttempt((value) => value + 1);
  }

  function toggle(index: number) {
    if (busy) return;
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function confirm() {
    setBusy(true);
    const result = await markMealMade({
      weekStart,
      dayIndex,
      selected: [...selected],
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Marked as made");
    router.refresh();
    onConfirmed?.();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Mark dinner as made?</DialogTitle>
        <DialogDescription>
          {mealName
            ? `“${mealName}” — tap an ingredient to choose what leaves your pantry:`
            : "These are the recipe's ingredients:"}
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
              Marking as made just records the meal — your pantry won&apos;t
              change.
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {items.map((item, index) => {
              const isSelected = selected.has(index);
              return (
                <li key={`${item.name}-${index}`}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    disabled={busy}
                    onClick={() => toggle(index)}
                    className={[
                      "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      "disabled:cursor-default",
                      isSelected
                        ? "border-primary/40 bg-primary text-primary-foreground"
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
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => void confirm()}
          disabled={busy || items === null || loadError}
          className={effectiveTint ? cn(effectiveTint.header, "hover:opacity-90") : undefined}
        >
          {busy ? (
            <Loader2 className="animate-spin" />
          ) : (
            <ChefHat />
          )}
          {busy ? "Working…" : "Mark as made"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Standalone dialog wrapper (used by the week's dinners ChefHat button). */
export function MadeConfirmDialog({
  open,
  onOpenChange,
  weekStart,
  dayIndex,
  mealName,
  tint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: string;
  dayIndex: number;
  mealName?: string | null;
  tint?: Tint;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <MadeConfirmContent
          weekStart={weekStart}
          dayIndex={dayIndex}
          mealName={mealName}
          tint={tint}
          onCancel={() => onOpenChange(false)}
          onConfirmed={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
