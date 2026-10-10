"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { locationLabel } from "@/components/location-badge";
import {
  consumeFromItem,
  restoreBatches,
  type ConsumeItemData,
} from "@/app/(app)/inventory/actions";
import type { ItemRow, Location } from "@/lib/types";

type ConsumeDialogProps = {
  item: ItemRow;
  /** Quantity shown: grand total, or the location subtotal on a location tab. */
  totalQuantity: number;
  /** Where batches are consumed from: "all" or the active location tab. */
  scope: Location | "all";
  mode: "partial" | "last";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful consume with totals + affected batches. */
  onConsumed?: (remaining: number, data: ConsumeItemData) => void;
};

export function ConsumeDialog({
  item,
  totalQuantity,
  scope,
  mode,
  open,
  onOpenChange,
  onConsumed,
}: ConsumeDialogProps) {
  const name = item.name;
  const [amount, setAmount] = useState(1);
  const [addToGrocery, setAddToGrocery] = useState(mode === "last");
  const [busy, setBusy] = useState(false);

  const max = Math.max(1, totalQuantity);
  const requested = mode === "last" ? totalQuantity : Math.min(amount, max);
  const remaining = Math.max(0, totalQuantity - requested);

  async function confirm() {
    setBusy(true);
    const result = await consumeFromItem({
      itemId: item.id,
      amount: requested,
      location: scope === "all" ? undefined : scope,
      addToGrocery,
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    onOpenChange(false);
    setAmount(1);
    onConsumed?.(remaining, result.data);

    const message =
      requested >= totalQuantity
        ? `Used the last ${name}`
        : `Used ${requested} ${name}`;
    toast.success(result.data.groceryAdded ? `${message} · added to grocery list` : message, {
      action: {
        label: "Undo",
        onClick: () => {
          void restoreBatches({ snapshots: result.data.snapshots });
        },
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {mode === "last" ? "Used the last one" : "Use some"}
          </DialogTitle>
          <DialogDescription>
            {name} · {totalQuantity} left
            {scope === "all" ? "" : ` · ${locationLabel(scope)}`}
          </DialogDescription>
        </DialogHeader>

        {mode === "partial" ? (
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="icon"
              aria-label="Decrease amount"
              onClick={() => setAmount((value) => Math.max(1, value - 1))}
            >
              −
            </Button>
            <div className="w-20 text-center text-2xl font-extrabold tabular-nums">
              {amount}
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="Increase amount"
              onClick={() => setAmount((value) => Math.min(max, value + 1))}
            >
              +
            </Button>
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Removes it from your pantry list.
          </p>
        )}

        {mode === "partial" ? (
          <p className="text-center text-xs text-muted-foreground">
            {remaining} left after using {requested}
          </p>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={addToGrocery}
            onCheckedChange={(checked) => setAddToGrocery(checked === true)}
          />
          Add {name} to the grocery list
        </label>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={busy}>
            {busy
              ? "Saving…"
              : mode === "last"
                ? "Used the last one"
                : `Use ${requested}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
