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
  consumeInventory,
  updateInventory,
} from "@/app/(app)/inventory/actions";
import type { InventoryWithItem } from "@/lib/types";

type ConsumeDialogProps = {
  inventory: InventoryWithItem;
  mode: "partial" | "last";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new quantity after a successful consume. */
  onConsumed?: (quantity: number) => void;
};

export function ConsumeDialog({
  inventory,
  mode,
  open,
  onOpenChange,
  onConsumed,
}: ConsumeDialogProps) {
  const name = inventory.item?.name ?? "Item";
  const [amount, setAmount] = useState(1);
  const [addToGrocery, setAddToGrocery] = useState(mode === "last");
  const [busy, setBusy] = useState(false);

  const max = Math.max(1, inventory.quantity);
  const requested = mode === "last" ? inventory.quantity : Math.min(amount, max);
  const remaining = Math.max(0, inventory.quantity - requested);

  async function confirm() {
    setBusy(true);
    const previousQuantity = inventory.quantity;
    const result = await consumeInventory({
      inventoryId: inventory.id,
      amount: requested,
      addToGrocery,
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    onOpenChange(false);
    setAmount(1);
    onConsumed?.(result.data.quantity);

    const message =
      requested >= inventory.quantity
        ? `Used the last ${name}`
        : `Used ${requested} ${name}`;
    toast.success(result.data.groceryAdded ? `${message} · added to grocery list` : message, {
      action: {
        label: "Undo",
        onClick: () => {
          void updateInventory({
            inventoryId: inventory.id,
            quantity: previousQuantity,
          });
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
            {name} · {inventory.quantity} left · {locationLabel(inventory.location)}
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
            Quantity goes to 0 and stays on your pantry list.
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
