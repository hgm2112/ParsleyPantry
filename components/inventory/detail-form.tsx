"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Loader2,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExpiryChip } from "@/components/expiry-chip";
import { LocationBadge } from "@/components/location-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ConsumeDialog } from "@/components/inventory/consume-dialog";
import {
  addInventoryToGrocery,
  deleteInventory,
  updateInventory,
} from "@/app/(app)/inventory/actions";
import { addDays } from "@/lib/expiry";
import { isLowStock } from "@/lib/stock";
import { cn } from "@/lib/utils";
import type { CategoryRow, InventoryEntry, Location } from "@/lib/types";

const LOCATIONS: { value: Location; label: string }[] = [
  { value: "pantry", label: "Pantry" },
  { value: "fridge", label: "Fridge" },
  { value: "freezer", label: "Freezer" },
];

export function InventoryDetail({
  entry: initial,
  categories,
}: {
  entry: InventoryEntry;
  categories: CategoryRow[];
}) {
  const router = useRouter();
  const [entry, setEntry] = useState<InventoryEntry>(initial);
  const [unit, setUnit] = useState(initial.unit ?? "");
  const [source, setSource] = useState(initial.source ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [lowThreshold, setLowThreshold] = useState(
    initial.item.low_threshold != null ? String(initial.item.low_threshold) : "",
  );
  const [categoryId, setCategoryId] = useState(initial.item.category_id ?? "");
  const [saveBusy, setSaveBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [consumeMode, setConsumeMode] = useState<"partial" | "last" | null>(null);

  const low = isLowStock(entry, entry.item);

  async function patch(changes: Partial<Parameters<typeof updateInventory>[0]>) {
    const result = await updateInventory({
      inventoryId: entry.id,
      ...changes,
    });
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    if (result.data.inventory.item) {
      setEntry(result.data.inventory as InventoryEntry);
    }
    return true;
  }

  async function saveDetails() {
    setSaveBusy(true);
    const ok = await patch({
      unit: unit.trim() || null,
      source: source.trim() || null,
      notes: notes.trim() || null,
      lowThreshold: lowThreshold ? Number(lowThreshold) : null,
      autoRestock: entry.item.auto_restock,
    });
    setSaveBusy(false);
    toast[ok ? "success" : "error"](ok ? "Saved" : "Could not save");
  }

  async function toggleAutoRestock(checked: boolean) {
    setEntry((current) => ({
      ...current,
      item: { ...current.item, auto_restock: checked },
    }));
    const result = await updateInventory({
      inventoryId: entry.id,
      autoRestock: checked,
    });
    if (!result.ok) toast.error(result.error);
  }

  async function addToGrocery() {
    const result = await addInventoryToGrocery(entry.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.data.created
        ? `${entry.item.name} added to grocery list`
        : "Already on the grocery list",
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon-sm"
            render={<Link href="/inventory" />}
            aria-label="Back to inventory"
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">
              {entry.item.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <LocationBadge location={entry.location} />
              <ExpiryChip date={entry.expiration_date} />
              {low ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Running low
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-destructive"
          onClick={() => setDeleteOpen(true)}
          aria-label="Remove from inventory"
        >
          <Trash2 />
        </Button>
      </div>

      <section className="space-y-3 rounded-xl border bg-background p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Quantity</Label>
            <p className="text-xs text-muted-foreground">
              {entry.item.barcode
                ? `Barcode ${entry.item.barcode}`
                : "No barcode saved"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Decrease quantity"
              disabled={entry.quantity <= 0}
              onClick={() => void patch({ quantity: Math.max(0, entry.quantity - 1) })}
            >
              −
            </Button>
            <span className="w-12 text-center text-xl font-semibold tabular-nums">
              {entry.quantity % 1 === 0 ? entry.quantity : entry.quantity.toFixed(1)}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Increase quantity"
              onClick={() => void patch({ quantity: entry.quantity + 1 })}
            >
              +
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Location</Label>
          <div className="grid grid-cols-3 gap-2">
            {LOCATIONS.map((location) => (
              <button
                key={location.value}
                type="button"
                onClick={() => void patch({ location: location.value })}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                  entry.location === location.value
                    ? "border-green-700 bg-green-700 text-white dark:border-green-600 dark:bg-green-600"
                    : "bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                {location.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="expiry">Expiration</Label>
          <div className="flex gap-2">
            <Input
              id="expiry"
              type="date"
              value={entry.expiration_date ?? ""}
              onChange={(event) =>
                void patch({ expirationDate: event.target.value || null })
              }
            />
            <Button
              variant="outline"
              onClick={() => void patch({ expirationDate: addDays(7) })}
            >
              +7d
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border bg-background p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="unit">Unit</Label>
            <Input
              id="unit"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              placeholder="ea, lb…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="source">Source</Label>
            <Input
              id="source"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder="Meijer…"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select
            value={categoryId || "__none"}
            items={[
              { value: "__none", label: "None" },
              ...categories.map((category) => ({
                value: category.id,
                label: category.name,
              })),
            ]}
            onValueChange={(value) => {
              setCategoryId(!value || value === "__none" ? "" : value);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">None</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Input
            id="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Where it lives…"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="threshold">Running low at or below</Label>
          <Input
            id="threshold"
            type="number"
            min={0}
            step="any"
            value={lowThreshold}
            onChange={(event) => setLowThreshold(event.target.value)}
            placeholder="e.g. 1"
          />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={entry.item.auto_restock}
              onCheckedChange={(checked) => void toggleAutoRestock(checked === true)}
            />
            Auto-add to grocery list when it gets low
          </label>
        </div>

        <Button className="w-full" onClick={saveDetails} disabled={saveBusy}>
          {saveBusy ? <Loader2 className="animate-spin" /> : <Check />}
          Save details
        </Button>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          disabled={entry.quantity <= 0}
          onClick={() => setConsumeMode("partial")}
        >
          Use some…
        </Button>
        <Button
          variant="outline"
          disabled={entry.quantity <= 0}
          onClick={() => setConsumeMode("last")}
        >
          Used the last one
        </Button>
        <Button variant="outline" className="col-span-2" onClick={addToGrocery}>
          <ShoppingCart /> Add to grocery list
        </Button>
      </section>

      {consumeMode ? (
        <ConsumeDialog
          inventory={entry}
          mode={consumeMode}
          open
          onOpenChange={(open) => {
            if (!open) setConsumeMode(null);
          }}
          onConsumed={(quantity) =>
            setEntry((current) => ({ ...current, quantity }))
          }
        />
      ) : null}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Remove ${entry.item.name}?`}
        description="This deletes the stock row. The catalog item stays for next time."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          const result = await deleteInventory(entry.id);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`${entry.item.name} removed`);
          router.push("/inventory");
          router.refresh();
        }}
      />
    </div>
  );
}
