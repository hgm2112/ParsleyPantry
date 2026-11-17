"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChefHat, Loader2, Minus, Plus, RefreshCw } from "lucide-react";
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
  poolBasis: "oz" | "count";
};

function qtyText(quantity: number, unit: string | null): string {
  const { qtyText: q, unitText } = displayQtyUnit(quantity, unit);
  return `${q}${unitText ? ` ${unitText}` : ""}`;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isUsable(item: PreviewItem): boolean {
  return item.matched && item.available > 0;
}

type Props = {
  weekStart: string;
  dayIndex: number;
  mealName?: string | null;
  onCancel: () => void;
  onConfirmed?: () => void;
};

/**
 * Confirmation step before marking a meal made: shows EVERY ingredient of the
 * day's planned recipe grouped by pantry availability and lets you tweak how
 * much to use (in the recipe's unit, capped at what's available).
 * `markMealMade` deducts the chosen amounts (0 = nothing).
 */
export function MadeConfirmContent({
  weekStart,
  dayIndex,
  mealName,
  onCancel,
  onConfirmed,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<PreviewItem[] | null>(null);
  const [amounts, setAmounts] = useState<number[]>([]);
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
      const previewItems = result.data.items as PreviewItem[];
      setItems(previewItems);
      // Default: use up to the recipe amount (capped by what's available).
      setAmounts(previewItems.map((item) => item.take));
    });
    return () => {
      alive = false;
    };
  }, [weekStart, dayIndex, attempt]);

  function retry() {
    setLoadError(false);
    setItems(null);
    setAmounts([]);
    setAttempt((value) => value + 1);
  }

  function clampAmount(item: PreviewItem, value: number): number {
    if (!item.matched || item.available <= 0) return 0;
    if (!Number.isFinite(value) || value <= 0) return 0;
    return round3(Math.min(value, item.available));
  }

  function setAmount(index: number, value: number) {
    if (busy || !items) return;
    const item = items[index];
    if (!item) return;
    setAmounts((prev) => {
      const next = [...prev];
      next[index] = clampAmount(item, value);
      return next;
    });
  }

  function adjustAmount(index: number, delta: number) {
    if (!items) return;
    const item = items[index];
    if (!item) return;
    const current = amounts[index] ?? 0;
    setAmount(index, round3(current + delta));
  }

  async function confirm() {
    if (!items) return;
    setBusy(true);
    const result = await markMealMade({
      weekStart,
      dayIndex,
      amounts: items.map((_, index) => ({
        index,
        amount: Number.isFinite(amounts[index] ?? 0) ? Math.max(0, amounts[index] ?? 0) : 0,
      })),
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

  const indexedItems = (items ?? []).map((item, index) => ({ item, index, amount: amounts[index] ?? 0 }));
  const usable = indexedItems.filter(({ item }) => isUsable(item));
  const missing = indexedItems.filter(({ item }) => !isUsable(item));

  function renderSection(
    title: string,
    rows: { item: PreviewItem; index: number; amount: number }[],
    variant: "usable" | "missing",
  ) {
    if (rows.length === 0) return null;
    return (
      <section className="space-y-1">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">
            {title}
          </h3>
          <div className="flex w-[11.5rem] shrink-0 items-center gap-2 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:w-[12.75rem] sm:text-[11px]">
            <span className="w-[2.75rem] shrink-0 text-right sm:w-[3rem]">Needs</span>
            <span className="flex-1">Using</span>
          </div>
        </div>
        <ul className="divide-y divide-border/60 rounded-lg border border-border/60 bg-muted/20">
          {rows.map(({ item, index, amount }) => {
            const needsText = item.quantityText || qtyText(item.needed, item.unit) || "—";
            const step = item.poolBasis === "oz" ? 0.25 : 1;
            const atMax = amount >= item.available;
            const atMin = amount <= 0;
            const stepperDisabled = busy || !isUsable(item);

            return (
              <li
                key={`${item.name}-${index}`}
                className="flex items-center gap-1.5 px-2 py-1.5 text-[13px] sm:gap-2 sm:px-3 sm:py-2 sm:text-sm"
              >
                <div className="min-w-0 flex-1">
                  <span className="block font-medium leading-tight text-foreground">
                    {item.name}
                    {item.optional ? (
                      <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                        optional
                      </span>
                    ) : null}
                  </span>
                </div>

                <div className="flex w-[11.5rem] shrink-0 items-center gap-2 sm:w-[12.75rem]">
                  <span
                    className="w-[2.75rem] shrink-0 truncate text-right text-[10px] tabular-nums text-muted-foreground sm:w-[3rem] sm:text-sm"
                    title={needsText}
                  >
                    {needsText}
                  </span>

                  <div className="flex flex-1 items-center justify-end">
                    {variant === "missing" ? (
                      <span className="inline-flex items-center rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 sm:px-2 sm:py-1 sm:text-[11px]">
                        Need {qtyText(item.needed, item.unit)}
                      </span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 shrink-0 sm:h-11 sm:w-11"
                          onClick={() => adjustAmount(index, -step)}
                          disabled={stepperDisabled || atMin}
                          aria-label={`Use less ${item.name}`}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-11 shrink-0 text-center text-[11px] font-medium tabular-nums text-foreground sm:w-12 sm:text-xs">
                          {qtyText(amount, item.unit)}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className={cn("h-10 w-10 shrink-0 sm:h-11 sm:w-11", atMax && "opacity-40")}
                          onClick={() => adjustAmount(index, step)}
                          disabled={stepperDisabled || atMax}
                          aria-label={`Use more ${item.name}`}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Mark dinner as made?</DialogTitle>
        <DialogDescription>
          {mealName ? `“${mealName}”` : "Review what to use from your pantry."}
        </DialogDescription>
        {items && items.length > 0 ? (
          <p className="text-xs text-muted-foreground sm:text-sm">
            {usable.length} from your pantry · {missing.length} missing
          </p>
        ) : null}
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
                className="h-14 animate-pulse rounded-lg bg-muted"
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
          <div className="space-y-4">
            {renderSection("From your pantry", usable, "usable")}
            {renderSection("Not in pantry", missing, "missing")}
          </div>
        )}
      </div>

      <DialogFooter className="-mx-3 -mb-3 gap-2 p-3 sm:-mx-4 sm:-mb-4 sm:gap-0 sm:p-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => void confirm()}
          disabled={busy || items === null || loadError}
        >
          {busy ? <Loader2 className="animate-spin" /> : <ChefHat />}
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: string;
  dayIndex: number;
  mealName?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-[calc(100%-1rem)] overflow-y-auto p-3 sm:max-w-lg sm:p-4">
        <MadeConfirmContent
          weekStart={weekStart}
          dayIndex={dayIndex}
          mealName={mealName}
          onCancel={() => onOpenChange(false)}
          onConfirmed={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
