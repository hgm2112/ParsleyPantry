"use client";

import { useRef, useState } from "react";
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
import { LocationBadge, locationLabel } from "@/components/location-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ConsumeDialog } from "@/components/inventory/consume-dialog";
import { FreezeDialog } from "@/components/inventory/freeze-dialog";
import {
  addToInventory,
  addInventoryToGrocery,
  deleteInventory,
  updateInventory,
} from "@/app/(app)/inventory/actions";
import { addDays, parseDate } from "@/lib/expiry";
import { expiryChipProps, formatFreezerQuality } from "@/lib/freezer";
import { isLowStock } from "@/lib/stock";
import { cn } from "@/lib/utils";
import type { InventoryEntry, Location, SubcategoryRow } from "@/lib/types";

const LOCATIONS: { value: Location; label: string }[] = [
  { value: "pantry", label: "Pantry" },
  { value: "fridge", label: "Fridge" },
  { value: "freezer", label: "Freezer" },
];

export function InventoryDetail({
  entry: initial,
  subcategories,
}: {
  entry: InventoryEntry;
  subcategories: SubcategoryRow[];
}) {
  const router = useRouter();
  const [entry, setEntry] = useState<InventoryEntry>(initial);
  const [unit, setUnit] = useState(initial.unit ?? "oz");
  const [lowThreshold, setLowThreshold] = useState(
    initial.item.low_threshold != null ? String(initial.item.low_threshold) : "",
  );
  const [saveBusy, setSaveBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [useLastOpen, setUseLastOpen] = useState(false);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [consumeMode, setConsumeMode] = useState<"partial" | "last" | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(initial.item.name);
  const nameBusyRef = useRef(false);
  const nameCancelRef = useRef(false);

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
      lowThreshold: lowThreshold ? Number(lowThreshold) : null,
      autoRestock: entry.item.auto_restock,
    });
    setSaveBusy(false);
    toast[ok ? "success" : "error"](ok ? "Saved" : "Could not save");
  }

  async function commitName() {
    if (nameBusyRef.current || nameCancelRef.current) {
      nameCancelRef.current = false;
      return;
    }
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === entry.item.name) {
      setNameDraft(entry.item.name);
      setEditingName(false);
      return;
    }
    nameBusyRef.current = true;
    const result = await updateInventory({
      inventoryId: entry.id,
      itemName: trimmed,
    });
    nameBusyRef.current = false;
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setEntry(result.data.inventory as InventoryEntry);
    setEditingName(false);
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
          <div className="min-w-0 flex-1">
            {editingName ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void commitName();
                }}
              >
                <Input
                  autoFocus
                  value={nameDraft}
                  aria-label="Item name"
                  className="h-8 text-lg font-extrabold"
                  onChange={(event) => setNameDraft(event.target.value)}
                  onBlur={() => void commitName()}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      nameCancelRef.current = true;
                      setNameDraft(entry.item.name);
                      setEditingName(false);
                    }
                  }}
                />
              </form>
            ) : (
              <h1 className="truncate">
                <button
                  type="button"
                  className="block w-full max-w-full truncate cursor-text text-lg font-extrabold hover:text-primary"
                  onClick={() => {
                    setNameDraft(entry.item.name);
                    nameCancelRef.current = false;
                    setEditingName(true);
                  }}
                >
                  {entry.item.name}
                </button>
              </h1>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <LocationBadge location={entry.location} />
              <ExpiryChip {...expiryChipProps(entry)} />
              {low ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
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
              onClick={() => {
                if (entry.quantity <= 1) setUseLastOpen(true);
                else void patch({ quantity: entry.quantity - 1 });
              }}
            >
              −
            </Button>
            <span className="w-12 text-center text-xl font-extrabold tabular-nums">
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
                onClick={() => {
                  // Freezing collects a date + food type first.
                  if (location.value === "freezer" && entry.location !== "freezer") {
                    setFreezeOpen(true);
                    return;
                  }
                  void patch({ location: location.value });
                }}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm font-semibold transition-colors",
                  entry.location === location.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                {location.label}
              </button>
            ))}
          </div>
        </div>

        {entry.location === "freezer" ? (
          <div className="space-y-2">
            <Label>Freezer</Label>
            <p className="text-sm font-semibold">
              {entry.frozen_at
                ? `❄️ Frozen on ${parseDate(entry.frozen_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}`
                : "❄️ Frozen — date not tracked"}
            </p>
            <p className="text-sm">
              {entry.freezer_quality_date
                ? formatFreezerQuality(entry.freezer_quality_date)
                : "No quality date tracked"}
            </p>
            <p className="text-xs text-muted-foreground">
              Original refrigerated date:{" "}
              {entry.expiration_date
                ? parseDate(entry.expiration_date).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "none"}{" "}
              — kept while frozen.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFreezeOpen(true)}
            >
              {entry.frozen_at || entry.item.freezer_food_type
                ? "Edit freezer details"
                : "Record freezer date"}
            </Button>
          </div>
        ) : (
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
        )}
      </section>

      <section className="space-y-3 rounded-xl border bg-background p-4">
        <div className="space-y-2">
          <Label>Sub-category</Label>
          <Select
            value={entry.item.subcategory_id ?? "__none"}
            items={[
              { value: "__none", label: "None" },
              ...subcategories.map((subcategory) => ({
                value: subcategory.id,
                label: subcategory.name,
              })),
            ]}
            onValueChange={(value) =>
              void patch({
                subcategoryId: value && value !== "__none" ? value : null,
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">None</SelectItem>
              {subcategories.map((subcategory) => (
                <SelectItem key={subcategory.id} value={subcategory.id}>
                  {subcategory.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="unit">Unit</Label>
          <Input
            id="unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            placeholder="oz"
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
          onConsumed={(quantity) => {
            if (quantity <= 0) {
              router.push("/inventory");
              router.refresh();
              return;
            }
            setEntry((current) => ({ ...current, quantity }));
          }}
        />
      ) : null}

      {freezeOpen ? (
        <FreezeDialog
          inventory={entry}
          subcategoryName={
            entry.item.subcategory_id
              ? (subcategories.find(
                  (subcategory) => subcategory.id === entry.item.subcategory_id,
                )?.name ?? null)
              : null
          }
          open
          onOpenChange={(open) => {
            if (!open) setFreezeOpen(false);
          }}
          onSaved={(inventory) => {
            if (inventory.item) setEntry(inventory as InventoryEntry);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={useLastOpen}
        onOpenChange={setUseLastOpen}
        title={`Use the last ${entry.item.name}?`}
        description={`${locationLabel(entry.location)} stock will be removed from your pantry. The catalog item stays for next time.`}
        confirmLabel="Used the last one"
        onConfirm={async () => {
          const previousQuantity = entry.quantity;
          const result = await deleteInventory(entry.id);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`Used the last ${entry.item.name} · removed from pantry`, {
            action: {
              label: "Undo",
              onClick: () =>
                void addToInventory({
                  itemId: entry.item.id,
                  name: entry.item.name,
                  location: entry.location,
                  quantity: previousQuantity,
                  unit: entry.unit ?? undefined,
                  expirationDate: entry.expiration_date ?? undefined,
                }),
            },
            duration: 8000,
          });
          router.push("/inventory");
          router.refresh();
        }}
      />

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
