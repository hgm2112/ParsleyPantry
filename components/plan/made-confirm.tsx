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

type PreviewItem = { name: string; quantity: number; unit: string | null };

type Props = {
  weekStart: string;
  dayIndex: number;
  recipeName?: string | null;
  onCancel: () => void;
  onConfirmed?: () => void;
};

/**
 * Confirmation step before marking a meal made: shows the day's reserved
 * stock holds (exactly what markMealMade will take from the pantry).
 */
export function MadeConfirmContent({
  weekStart,
  dayIndex,
  recipeName,
  onCancel,
  onConfirmed,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<PreviewItem[] | null>(null);
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
    });
    return () => {
      alive = false;
    };
  }, [weekStart, dayIndex, attempt]);

  function retry() {
    setLoadError(false);
    setItems(null);
    setAttempt((value) => value + 1);
  }

  async function confirm() {
    setBusy(true);
    const result = await markMealMade({ weekStart, dayIndex });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Marked as made — pantry updated");
    router.refresh();
    onConfirmed?.();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Mark dinner as made?</DialogTitle>
        <DialogDescription>
          {recipeName
            ? `“${recipeName}” will use these pantry items:`
            : "These pantry items will be used up:"}
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
              Nothing is reserved from your pantry for this day.
            </p>
            <p className="mt-1">
              Marking as made won&apos;t change your stock. Run “Shop this
              week” on the Plan page to reserve ingredients first — anything
              the pantry can&apos;t cover goes to the grocery list.
            </p>
          </div>
        ) : (
          <>
            <ul className="space-y-1.5">
              {items.map((item, index) => {
                const { qtyText, unitText } = displayQtyUnit(
                  item.quantity,
                  item.unit,
                );
                return (
                  <li
                    key={`${item.name}-${index}`}
                    className="flex items-baseline justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-sm"
                  >
                    <span className="truncate font-medium">{item.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {qtyText}
                      {unitText ? ` ${unitText}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Anything your pantry didn&apos;t have was already sent to the
              grocery list by “Shop this week”.
            </p>
          </>
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
  recipeName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: string;
  dayIndex: number;
  recipeName?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <MadeConfirmContent
          weekStart={weekStart}
          dayIndex={dayIndex}
          recipeName={recipeName}
          onCancel={() => onOpenChange(false)}
          onConfirmed={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
