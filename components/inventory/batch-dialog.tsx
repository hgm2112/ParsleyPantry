"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  ExpirationEntries,
  entriesToBatches,
  newExpirationEntry,
  type ExpirationEntryValue,
} from "@/components/inventory/entry-fields";
import { locationLabel } from "@/components/location-badge";
import { FreezeDialog } from "@/components/inventory/freeze-dialog";
import {
  addToInventory,
  deleteInventory,
  restoreBatches,
  updateInventory,
} from "@/app/(app)/inventory/actions";
import { addDays, formatExpiry, parseDate } from "@/lib/expiry";
import { formatFreezerQuality } from "@/lib/freezer";
import { toBatchSnapshot } from "@/lib/batches";
import { cn } from "@/lib/utils";
import type { InventoryEntry, InventoryWithItem, ItemRow, Location } from "@/lib/types";

const LOCATIONS: { value: Location; label: string }[] = [
  { value: "pantry", label: "Pantry" },
  { value: "fridge", label: "Fridge" },
  { value: "freezer", label: "Freezer" },
];

type BatchDialogProps = {
  item: ItemRow;
  subcategoryName?: string | null;
  /** Editing an existing batch; null/undefined = add a new one. */
  batch?: InventoryEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A batch was created/updated (and possibly merged into `replacedId`). */
  onSaved: (row: InventoryEntry, replacedId?: string) => void;
  /** The batch was removed. */
  onRemoved?: (id: string) => void;
};

function asEntry(row: InventoryWithItem): InventoryEntry | null {
  return row.item ? (row as InventoryEntry) : null;
}

/**
 * Add or edit one batch: quantity + expiration date + storage location.
 * Moving to the freezer hands off to FreezeDialog (date frozen + food type).
 */
export function BatchDialog({
  item,
  subcategoryName,
  batch,
  open,
  onOpenChange,
  onSaved,
  onRemoved,
}: BatchDialogProps) {
  const name = item.name;
  const editing = batch ?? null;
  const wasFrozen = editing?.location === "freezer";

  const [entries, setEntries] = useState<ExpirationEntryValue[]>(() => [
    newExpirationEntry(
      editing?.expiration_date ?? addDays(7),
      editing ? String(editing.quantity) : "",
    ),
  ]);
  const [location, setLocation] = useState<Location>(editing?.location ?? "pantry");
  // Editing touches one batch; the freezer flow hands off per batch too.
  const single = Boolean(editing) || location === "freezer";
  const [busy, setBusy] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [freezeRow, setFreezeRow] = useState<InventoryEntry | null>(null);

  const freezerBatch = wasFrozen ? editing : null;

  function handOffToFreeze(row: InventoryEntry, replacedId?: string) {
    onSaved(row, replacedId);
    setFreezeRow(row);
  }

  async function confirm() {
    const batches = entriesToBatches(single ? entries.slice(0, 1) : entries);
    if (batches.length === 0) {
      toast.error("Enter a quantity");
      return;
    }
    setBusy(true);

    const wantsFreezer = location === "freezer" && !wasFrozen;
    if (editing) {
      const batch = batches[0];
      const result = await updateInventory({
        inventoryId: editing.id,
        quantity: batch.quantity,
        expirationDate: batch.expirationDate,
        location,
      });
      setBusy(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const row = asEntry(result.data.inventory);
      if (!row) {
        toast.error("Could not save batch");
        return;
      }
      if (wantsFreezer) {
        handOffToFreeze(row, editing.id);
        return;
      }
      const merged = row.id !== editing.id;
      onSaved(row, editing.id);
      onOpenChange(false);
      toast.success(merged ? `Merged into an existing ${name} batch` : "Batch saved");
      return;
    }

    const result = await addToInventory({
      itemId: item.id,
      name: item.name,
      location,
      batches,
      unit: item.unit ?? undefined,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    if (wantsFreezer) {
      const row = asEntry(result.data.inventory);
      if (!row) {
        toast.error("Could not add batch");
        return;
      }
      handOffToFreeze(row);
      return;
    }

    const rows = result.data.inventories
      .map(asEntry)
      .filter((row): row is InventoryEntry => row != null);
    if (rows.length === 0) {
      toast.error("Could not add batch");
      return;
    }
    for (const row of rows) onSaved(row);
    onOpenChange(false);
    toast.success(`Batch added to ${locationLabel(location)}`);
  }

  async function removeBatch() {
    if (!editing) return;
    const snapshot = toBatchSnapshot(editing);
    setBusy(true);
    const result = await deleteInventory(editing.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onRemoved?.(editing.id);
    onOpenChange(false);
    toast.success("Batch removed", {
      action: {
        label: "Undo",
        onClick: () => void restoreBatches({ snapshots: [snapshot] }),
      },
      duration: 8000,
    });
  }

  return (
    <>
      <Dialog open={open && !freezeRow} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${name} batch` : `Add ${name} batch`}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Quantities and dates are tracked per batch — this edit only touches the batch in ${locationLabel(editing.location)}.`
                : "Each batch keeps its own quantity, date, and storage history."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <ExpirationEntries
              entries={single ? entries.slice(0, 1) : entries}
              onChange={setEntries}
              single={single}
            />

            {freezerBatch ? (
              <p className="text-xs text-muted-foreground">
                Refrigerated date — kept while frozen; the quality date governs.
              </p>
            ) : null}

            <div className="space-y-2">
              <Label>Location</Label>
              <div className="grid grid-cols-3 gap-2">
                {LOCATIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLocation(option.value)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm font-semibold transition-colors",
                      location === option.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {freezerBatch ? (
              <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
                <p className="text-sm font-semibold">
                  {freezerBatch.frozen_at
                    ? `❄️ Frozen on ${parseDate(freezerBatch.frozen_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}`
                    : freezerBatch.purchased_frozen
                      ? "❄️ Purchased frozen — original date unknown"
                      : "❄️ Frozen — date not tracked"}
                </p>
                <p className="text-sm">
                  {freezerBatch.freezer_quality_date
                    ? formatFreezerQuality(freezerBatch.freezer_quality_date)
                    : "No quality date tracked"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Refrigerated date:{" "}
                  {freezerBatch.expiration_date
                    ? formatExpiry(freezerBatch.expiration_date)
                    : "none"}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFreezeRow(freezerBatch)}
                >
                  Edit freezer details
                </Button>
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {editing ? (
              <Button
                variant="outline"
                className="h-7 text-xs text-destructive sm:h-8 sm:text-sm"
                onClick={() => setRemoveOpen(true)}
              >
                <Trash2 /> Remove
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="h-11 sm:h-8"
              onClick={() => void confirm()}
              disabled={busy}
            >
              {busy ? "Saving…" : editing ? "Save" : "Add batch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {freezeRow ? (
        <FreezeDialog
          inventory={freezeRow}
          subcategoryName={subcategoryName ?? null}
          open
          onOpenChange={(open) => {
            if (!open) {
              setFreezeRow(null);
              onOpenChange(false);
            }
          }}
          onSaved={(row) => {
            const entry = asEntry(row);
            if (entry) onSaved(entry, entry.id);
            setFreezeRow(null);
            onOpenChange(false);
          }}
        />
      ) : null}

      {editing ? (
        <ConfirmDialog
          open={removeOpen}
          onOpenChange={setRemoveOpen}
          title={`Remove this ${name} batch?`}
          description={`${editing.quantity} in ${locationLabel(editing.location)}${
            editing.expiration_date ? ` · ${formatExpiry(editing.expiration_date)}` : ""
          } will be removed. The catalog item stays.`}
          confirmLabel="Remove"
          destructive
          onConfirm={removeBatch}
        />
      ) : null}
    </>
  );
}
