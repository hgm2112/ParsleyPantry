"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Minus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ExpiryChip } from "@/components/expiry-chip";
import { LocationBadge } from "@/components/location-badge";
import { displayQtyUnit, packCount, packHintText } from "@/lib/stock";
import { expiryChipProps } from "@/lib/freezer";
import {
  updateInventory,
  deleteInventory,
} from "@/app/(app)/inventory/actions";
import { toBatchSnapshot, type BatchSnapshot, type ItemGroup } from "@/lib/batches";
import type { InventoryEntry } from "@/lib/types";

type BatchActionsSheetProps = {
  group: ItemGroup | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActionComplete: (snapshots: BatchSnapshot[], itemId: string) => void;
};

export function BatchActionsSheet({
  group,
  open,
  onOpenChange,
  onActionComplete,
}: BatchActionsSheetProps) {
  const [confirmBatch, setConfirmBatch] = useState<InventoryEntry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!group) return null;

  const item = group.item;

  async function performQtyChange(batch: InventoryEntry, delta: number) {
    const newQty = batch.quantity + delta;
    if (newQty < 0) return;

    if (delta < 0 && batch.quantity + delta === 0) {
      // last unit via - , treat as remove with confirm
      setConfirmBatch(batch);
      return;
    }

    setBusyId(batch.id);
    const snap = toBatchSnapshot(batch);
    const res = await updateInventory({ inventoryId: batch.id, quantity: newQty });
    setBusyId(null);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }

    onActionComplete([snap], item.id);
    onOpenChange(false);
  }

  async function handleRemove(batch: InventoryEntry, skipConfirm = false) {
    if (!skipConfirm && batch.quantity === 1) {
      setConfirmBatch(batch);
      return;
    }

    setBusyId(batch.id);
    const snap = toBatchSnapshot(batch);
    const res = await deleteInventory(batch.id);
    setBusyId(null);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }

    onActionComplete([snap], item.id);
    onOpenChange(false);
  }

  async function confirmLastUnitRemove() {
    if (!confirmBatch) return;
    const batch = confirmBatch;
    setConfirmBatch(null);
    await handleRemove(batch, true);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[70vh]">
          <SheetHeader>
            <SheetTitle className="text-base">{item.name}</SheetTitle>
            <SheetDescription>
              {group.batches.length} {group.batches.length === 1 ? "batch" : "batches"} · choose one to adjust
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-3 overflow-y-auto">
            {group.batches.map((batch) => {
              const unit = batch.unit ?? item.unit;
              const { qtyText, unitText } = displayQtyUnit(batch.quantity, unit);
              const isBusy = busyId === batch.id;

              return (
                <div
                  key={batch.id}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <span>
                        QTY: {qtyText}
                        {packCount(batch.quantity, item) ? (
                          <span className="ml-0.5 text-xs text-muted-foreground">
                            ({packHintText(batch.quantity, item)})
                          </span>
                        ) : null}
                      </span>
                      {unitText ? (
                        <span className="text-xs text-muted-foreground">{unitText}</span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <ExpiryChip {...expiryChipProps(batch)} className="uppercase" />
                      <LocationBadge location={batch.location} className="uppercase" />
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      disabled={isBusy}
                      onClick={() => void performQtyChange(batch, 1)}
                      aria-label="Add one"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      disabled={isBusy}
                      onClick={() => void performQtyChange(batch, -1)}
                      aria-label="Subtract one"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive"
                      disabled={isBusy}
                      onClick={() => void handleRemove(batch)}
                      aria-label="Remove batch"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            Changes apply to the selected batch only
          </p>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!confirmBatch}
        onOpenChange={(o) => {
          if (!o) setConfirmBatch(null);
        }}
        title="Remove last unit?"
        description="This will delete the batch."
        confirmLabel="Remove"
        destructive
        onConfirm={() => void confirmLastUnitRemove()}
      />
    </>
  );
}
