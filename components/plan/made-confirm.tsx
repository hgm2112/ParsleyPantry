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
  poolBasis: "oz" | "count";
};

function qtyText(quantity: number, unit: string | null): string {
  const { qtyText, unitText } = displayQtyUnit(quantity, unit);
  return `${qtyText}${unitText ? ` ${unitText}` : ""}`;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function unitLabel(unit: string | null): string | null {
  if (!unit) return null;
  const { unitText } = displayQtyUnit(1, unit);
  return unitText;
}

/** One-line pantry status for an ingredient given the chosen amount to use. */
function statusLine(item: PreviewItem, useAmount: number): string {
  if (!item.matched) {
    return "Not matched to pantry — nothing will be deducted";
  }
  if (item.available <= 0) {
    return `Not in pantry — need ${qtyText(item.needed, item.unit)}`;
  }
  if (useAmount <= 0) {
    return `Have ${qtyText(item.available, item.unit)} — using none`;
  }
  const pantry = item.pantryName ? ` from ${item.pantryName}` : " from your pantry";
  const stillShort = Math.max(0, item.needed - useAmount);
  if (stillShort > 0) {
    return `Using ${qtyText(useAmount, item.unit)}${pantry} — short ${qtyText(stillShort, item.unit)} for the recipe`;
  }
  if (useAmount > item.needed) {
    return `Using ${qtyText(useAmount, item.unit)}${pantry} (more than the recipe calls for)`;
  }
  return `Using ${qtyText(useAmount, item.unit)}${pantry}`;
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
 * day's planned recipe with its pantry match and lets you tweak how much to
 * use (in the recipe's unit, capped at what's available). `markMealMade`
 * deducts the chosen amounts (0 = nothing).
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

  return (
    <>
      <DialogHeader>
        <DialogTitle>Mark dinner as made?</DialogTitle>
        <DialogDescription>
          {mealName
            ? `“${mealName}” — tweak how much of each ingredient to take from your pantry:`
            : "Tweak how much of each ingredient to take from your pantry:"}
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
                className="h-16 animate-pulse rounded-lg bg-muted"
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
              const amount = amounts[index] ?? 0;
              const editable = item.matched && item.available > 0 && !busy;
              const isUsing = amount > 0;
              const step = item.poolBasis === "oz" ? 0.25 : 1;
              const uLabel = unitLabel(item.unit);
              return (
                <li
                  key={`${item.name}-${index}`}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm transition-colors",
                    isUsing
                      ? "border-primary/40 bg-primary/5"
                      : "border bg-background",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate font-semibold">
                          {item.name}
                          {item.optional ? (
                            <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                              optional
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {item.quantityText || "—"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {statusLine(item, amount)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        className="h-7 w-7"
                        onClick={() => adjustAmount(index, -step)}
                        disabled={!editable || amount <= 0}
                        aria-label={`Use less ${item.name}`}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={item.available}
                          step={step}
                          value={amount}
                          disabled={!editable}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") {
                              setAmount(index, 0);
                              return;
                            }
                            setAmount(index, Number(raw));
                          }}
                          aria-label={`Amount of ${item.name} to use`}
                          className="h-7 w-16 rounded-md border bg-background px-1.5 text-center text-sm tabular-nums disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        {uLabel ? (
                          <span className="w-8 text-xs text-muted-foreground">
                            {uLabel}
                          </span>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        className="h-7 w-7"
                        onClick={() => adjustAmount(index, step)}
                        disabled={!editable || amount >= item.available}
                        aria-label={`Use more ${item.name}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
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
