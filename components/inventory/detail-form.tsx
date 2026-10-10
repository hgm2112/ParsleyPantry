"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Loader2,
  Pencil,
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
import { BatchDialog } from "@/components/inventory/batch-dialog";
import {
  addInventoryToGrocery,
  consumeFromItem,
  deleteInventory,
  listCanonicalCandidates,
  renameCanonicalRoot,
  restoreBatches,
  setItemCanonical,
  updateInventory,
  type CanonicalCandidateView,
  type ConsumeItemData,
} from "@/app/(app)/inventory/actions";
import { expiryChipProps, formatFreezerQuality } from "@/lib/freezer";
import {
  fefoSort,
  isItemLow,
  multiDate,
  pickFefoBatch,
  toBatchSnapshot,
} from "@/lib/batches";
import { displayQtyUnit } from "@/lib/stock";
import type { InventoryEntry, ItemRow, SubcategoryRow } from "@/lib/types";

export function InventoryDetail({
  item: initialItem,
  entries: initialEntries,
  subcategories,
  canonicalItem,
}: {
  item: ItemRow;
  entries: InventoryEntry[];
  subcategories: SubcategoryRow[];
  canonicalItem: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const [item, setItem] = useState<ItemRow>(initialItem);
  const [entries, setEntries] = useState<InventoryEntry[]>(initialEntries);
  const [canonical, setCanonical] = useState(canonicalItem);
  const [editingCanonical, setEditingCanonical] = useState(false);
  const [canonicalDraft, setCanonicalDraft] = useState(
    canonicalItem?.name ?? initialItem.name,
  );
  const [canonicalOptions, setCanonicalOptions] = useState<CanonicalCandidateView[]>([]);
  const canonicalBusyRef = useRef(false);
  const [editingRename, setEditingRename] = useState(false);
  const [renameDraft, setRenameDraft] = useState(canonicalItem?.name ?? "");
  const renameBusyRef = useRef(false);
  const [unit, setUnit] = useState(initialItem.unit ?? "oz");
  const [lowThreshold, setLowThreshold] = useState(
    initialItem.low_threshold != null ? String(initialItem.low_threshold) : "",
  );
  const [saveBusy, setSaveBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [useLastOpen, setUseLastOpen] = useState(false);
  const [consumeMode, setConsumeMode] = useState<"partial" | "last" | null>(null);
  const [batchDialog, setBatchDialog] = useState<{
    batch: InventoryEntry | null;
  } | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(initialItem.name);
  const nameBusyRef = useRef(false);
  const nameCancelRef = useRef(false);

  const batches = fefoSort(entries);
  const total = entries.reduce((sum, row) => sum + row.quantity, 0);
  const low = isItemLow(total, entries, item);
  const earliest = pickFefoBatch(entries);
  const multi = multiDate(entries);
  const locations = batches.map((row) => row.location);
  const uniqueLocations = [...new Set(locations)];
  const anchorId = batches[0]?.id ?? null;
  const subcategoryName = item.subcategory_id
    ? (subcategories.find((sub) => sub.id === item.subcategory_id)?.name ?? null)
    : null;

  function applySaved(row: InventoryEntry, replacedId?: string) {
    setEntries((current) => {
      const drop = new Set<string>([row.id]);
      if (replacedId) drop.add(replacedId);
      return [...current.filter((entry) => !drop.has(entry.id)), row];
    });
    setItem(row.item);
  }

  function applyAffected(affected: ConsumeItemData["affected"]) {
    setEntries((current) => {
      let next = current;
      for (const change of affected) {
        next = change.deleted
          ? next.filter((entry) => entry.id !== change.inventoryId)
          : next.map((entry) =>
              entry.id === change.inventoryId
                ? { ...entry, quantity: change.quantity }
                : entry,
            );
      }
      return next;
    });
  }

  async function patchItem(changes: Partial<Parameters<typeof updateInventory>[0]>) {
    if (!anchorId) return false;
    const result = await updateInventory({
      inventoryId: anchorId,
      ...changes,
    });
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    if (result.data.inventory.item) {
      applySaved(result.data.inventory as InventoryEntry, anchorId);
    }
    return true;
  }

  async function saveDetails() {
    setSaveBusy(true);
    const ok = await patchItem({
      unit: unit.trim() || null,
      lowThreshold: lowThreshold ? Number(lowThreshold) : null,
      autoRestock: item.auto_restock,
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
    if (!trimmed || trimmed === item.name) {
      setNameDraft(item.name);
      setEditingName(false);
      return;
    }
    if (!anchorId) return;
    nameBusyRef.current = true;
    const result = await updateInventory({
      inventoryId: anchorId,
      itemName: trimmed,
    });
    nameBusyRef.current = false;
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.data.inventory.item) {
      applySaved(result.data.inventory as InventoryEntry, anchorId ?? undefined);
    }
    setNameDraft(trimmed);
    setEditingName(false);
  }

  async function openCanonicalEdit() {
    setEditingCanonical(true);
    if (canonicalOptions.length > 0) return;
    const result = await listCanonicalCandidates();
    if (!result.ok) return;
    setCanonicalOptions([
      ...result.data.items,
      ...result.data.recipeNames.map((name) => ({
        id: `recipe:${name}`,
        name,
        categoryId: null,
        canonicalItemId: null,
      })),
    ]);
  }

  /** Writes the match (null = clear) and adopts the result into local state. */
  async function writeCanonical(
    name: string | null,
  ): Promise<{ ok: boolean; next: { id: string; name: string } | null }> {
    if (canonicalBusyRef.current) return { ok: false, next: null };
    canonicalBusyRef.current = true;
    const result = await setItemCanonical(item.id, name);
    canonicalBusyRef.current = false;
    if (!result.ok) {
      toast.error(result.error);
      return { ok: false, next: null };
    }
    const next = result.data.canonicalItemId
      ? {
          id: result.data.canonicalItemId,
          name: result.data.canonicalName ?? name ?? item.name,
        }
      : null;
    setCanonical(next);
    setItem((current) => ({
      ...current,
      canonical_item_id: result.data.canonicalItemId,
    }));
    setCanonicalDraft(next?.name ?? item.name);
    return { ok: true, next };
  }

  /** Reverts a match change (null previous = clear back to own identity). */
  async function undoCanonicalChange(
    previous: { id: string; name: string } | null,
  ) {
    const { ok, next } = await writeCanonical(previous?.name ?? null);
    if (ok) toast.success(next ? `Matches recipes as ${next.name}` : "Match cleared");
    router.refresh();
  }

  async function commitCanonical() {
    const trimmed = canonicalDraft.trim();
    const previous = canonical;
    const { ok, next } = await writeCanonical(trimmed || null);
    if (!ok) return;
    setEditingCanonical(false);
    const changed = (previous?.id ?? null) !== (next?.id ?? null);
    toast.success(
      next ? `Matches recipes as ${next.name}` : "Match cleared",
      changed
        ? {
            action: {
              label: "Undo",
              onClick: () => void undoCanonicalChange(previous),
            },
            duration: 8000,
          }
        : undefined,
    );
  }

  /** One-click removal of the match — with Undo in the toast. */
  async function clearCanonical() {
    if (!canonical) return;
    const previous = canonical;
    const { ok, next } = await writeCanonical(null);
    if (!ok || next) return;
    toast.success("Match cleared", {
      action: {
        label: "Undo",
        onClick: () => void undoCanonicalChange(previous),
      },
      duration: 8000,
    });
    router.refresh();
  }

  /**
   * Renames the generic target itself (works even without stock). On a name
   * conflict the target's tree absorbs or promotes — never an error.
   */
  async function commitRename() {
    if (!canonical || renameBusyRef.current) return;
    const trimmed = renameDraft.trim();
    if (!trimmed || trimmed === canonical.name) {
      setRenameDraft(canonical.name);
      setEditingRename(false);
      return;
    }
    const previousId = canonical.id;
    renameBusyRef.current = true;
    const result = await renameCanonicalRoot(canonical.id, trimmed);
    renameBusyRef.current = false;
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    // Promoted result can be this very item → its own identity (null).
    const next =
      result.data.id === item.id
        ? null
        : { id: result.data.id, name: result.data.name };
    setCanonical(next);
    setCanonicalDraft(next?.name ?? item.name);
    setItem((current) => ({ ...current, canonical_item_id: next?.id ?? null }));
    setEditingRename(false);
    toast.success(
      !next
        ? "Match cleared"
        : next.id !== previousId
          ? `Matches recipes as ${next.name}`
          : `Renamed to ${next.name}`,
    );
    router.refresh();
  }

  async function toggleAutoRestock(checked: boolean) {
    if (!anchorId) return;
    setItem((current) => ({ ...current, auto_restock: checked }));
    const result = await updateInventory({
      inventoryId: anchorId,
      autoRestock: checked,
    });
    if (!result.ok) toast.error(result.error);
  }

  async function addToGrocery() {
    if (!anchorId) return;
    const result = await addInventoryToGrocery(anchorId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.data.created
        ? `${item.name} added to grocery list`
        : "Already on the grocery list",
    );
  }

  /** −1 on the total: FEFO within all batches, undo restores each row. */
  async function quickUse() {
    const result = await consumeFromItem({
      itemId: item.id,
      amount: 1,
      addToGrocery: false,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    applyAffected(result.data.affected);
    toast.success(`Used 1 ${item.name}`, {
      action: {
        label: "Undo",
        onClick: () =>
          void restoreBatches({ snapshots: result.data.snapshots }),
      },
    });
  }

  /** +1 on the total: tops up the soonest-expiring batch (never invents dates). */
  async function quickAdd() {
    const target = batches[0];
    if (!target) {
      setBatchDialog({ batch: null });
      return;
    }
    const result = await updateInventory({
      inventoryId: target.id,
      quantity: target.quantity + 1,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.data.inventory.item) {
      applySaved(result.data.inventory as InventoryEntry, target.id);
    }
  }

  async function toggleLow() {
    const target = !entries.some((entry) => entry.is_low);
    for (const entry of batches) {
      if (entry.is_low === target) continue;
      const result = await updateInventory({
        inventoryId: entry.id,
        isLow: target,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.data.inventory.item) {
        applySaved(result.data.inventory as InventoryEntry, entry.id);
      }
    }
    if (target) toast.success(`${item.name} flagged as running low`);
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
                      setNameDraft(item.name);
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
                    setNameDraft(item.name);
                    nameCancelRef.current = false;
                    setEditingName(true);
                  }}
                >
                  {item.name}
                </button>
              </h1>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {uniqueLocations.map((location) => (
                <LocationBadge key={location} location={location} />
              ))}
              {earliest ? (
                <ExpiryChip {...expiryChipProps(earliest)} />
              ) : null}
              {multi ? (
                <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-200">
                  Multiple dates
                </span>
              ) : null}
              {low ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Running low
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>Matches recipes as:</span>
              {editingCanonical ? (
                <form
                  className="flex min-w-0 flex-1 items-center gap-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void commitCanonical();
                  }}
                >
                  <Input
                    autoFocus
                    list="canonical-edit-options"
                    value={canonicalDraft}
                    aria-label="Canonical ingredient"
                    className="h-6 w-40 text-xs"
                    onChange={(event) => setCanonicalDraft(event.target.value)}
                  />
                  <datalist id="canonical-edit-options">
                    {canonicalOptions.map((option) => (
                      <option key={option.id} value={option.name} />
                    ))}
                  </datalist>
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      setCanonicalDraft(canonical?.name ?? item.name);
                      setEditingCanonical(false);
                    }}
                  >
                    Cancel
                  </Button>
                </form>
              ) : editingRename ? (
                <form
                  className="flex min-w-0 flex-1 items-center gap-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void commitRename();
                  }}
                >
                  <Input
                    autoFocus
                    value={renameDraft}
                    aria-label="Rename generic ingredient"
                    className="h-6 w-40 text-xs"
                    onChange={(event) => setRenameDraft(event.target.value)}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      setRenameDraft(canonical?.name ?? "");
                      setEditingRename(false);
                    }}
                  >
                    Cancel
                  </Button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    className="max-w-full truncate font-medium text-foreground underline-offset-2 hover:underline"
                    onClick={() => {
                      setCanonicalDraft(canonical?.name ?? item.name);
                      void openCanonicalEdit();
                    }}
                  >
                    {canonical?.name ?? item.name}
                  </button>
                  {canonical ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-xs text-muted-foreground"
                        aria-label={`Rename ${canonical.name}`}
                        onClick={() => {
                          setRenameDraft(canonical.name);
                          setEditingRename(true);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                        Rename
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-xs text-muted-foreground"
                        aria-label={`Clear match for ${canonical.name}`}
                        onClick={() => void clearCanonical()}
                      >
                        Clear match
                      </Button>
                    </>
                  ) : null}
                </>
              )}
              {!canonical && !editingCanonical && !editingRename ? (
                <span>
                  ({item.canonical_reviewed ? "kept as its own name" : "its own name"})
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
        <div className="flex items-center justify-between gap-2">
          <div>
            <Label>Quantity</Label>
            <p className="text-xs text-muted-foreground">
              {batches.length} {batches.length === 1 ? "batch" : "batches"}
              {uniqueLocations.length > 1
                ? ` · ${uniqueLocations.map(locationLabel).join(", ")}`
                : ""}
              {item.barcode ? ` · Barcode ${item.barcode}` : ""}
              {item.brand ? ` · ${item.brand}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Decrease quantity"
              disabled={total <= 0}
              onClick={() => {
                if (total <= 1) setUseLastOpen(true);
                else void quickUse();
              }}
            >
              −
            </Button>
            <span className="w-12 text-center text-xl font-extrabold tabular-nums">
              {total % 1 === 0 ? total : total.toFixed(1)}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Increase quantity"
              onClick={() => void quickAdd()}
            >
              +
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border bg-background p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <Label>Batches</Label>
            <p className="text-xs text-muted-foreground">
              Quantity and dates are tracked per batch.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBatchDialog({ batch: null })}
          >
            Add batch
          </Button>
        </div>
        <ul className="space-y-2">
          {batches.map((batch) => {
            const { unitText } = displayQtyUnit(batch.quantity, batch.unit);
            return (
              <li
                key={batch.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <LocationBadge
                      location={batch.location}
                      className="uppercase"
                    />
                    <span className="text-sm font-extrabold tabular-nums">
                      {batch.quantity % 1 === 0
                        ? batch.quantity
                        : batch.quantity.toFixed(2).replace(/0$/, "")}
                    </span>
                    {unitText ? (
                      <span className="text-xs font-semibold uppercase text-muted-foreground">
                        {unitText}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ExpiryChip
                      {...expiryChipProps(batch)}
                      className="uppercase"
                    />
                    {batch.location === "freezer" ? (
                      <span className="text-xs text-muted-foreground">
                        {batch.freezer_quality_date
                          ? formatFreezerQuality(batch.freezer_quality_date)
                          : batch.frozen_at
                            ? "No quality date tracked"
                            : "Date not tracked"}
                      </span>
                    ) : null}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setBatchDialog({ batch })}
                >
                  Edit
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3 rounded-xl border bg-background p-4">
        <div className="space-y-2">
          <Label>Sub-category</Label>
          <Select
            value={item.subcategory_id ?? "__none"}
            items={[
              { value: "__none", label: "None" },
              ...subcategories.map((subcategory) => ({
                value: subcategory.id,
                label: subcategory.name,
              })),
            ]}
            onValueChange={(value) =>
              void patchItem({
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
              checked={item.auto_restock}
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
          disabled={total <= 0}
          onClick={() => setConsumeMode("partial")}
        >
          Use some…
        </Button>
        <Button
          variant="outline"
          disabled={total <= 0}
          onClick={() => setConsumeMode("last")}
        >
          Used the last one
        </Button>
        <Button variant="outline" className="col-span-2" onClick={addToGrocery}>
          <ShoppingCart /> Add to grocery list
        </Button>
        <Button variant="outline" className="col-span-2" onClick={toggleLow}>
          {low ? "Clear low flag" : "Mark running low"}
        </Button>
      </section>

      {consumeMode ? (
        <ConsumeDialog
          key={consumeMode}
          item={item}
          totalQuantity={total}
          scope="all"
          mode={consumeMode}
          open
          onOpenChange={(open) => {
            if (!open) setConsumeMode(null);
          }}
          onConsumed={(remaining, data) => {
            if (remaining <= 0) {
              router.push("/inventory");
              router.refresh();
              return;
            }
            applyAffected(data.affected);
            router.refresh();
          }}
        />
      ) : null}

      {batchDialog ? (
        <BatchDialog
          item={item}
          subcategoryName={subcategoryName}
          batch={batchDialog.batch}
          open
          onOpenChange={(open) => {
            if (!open) setBatchDialog(null);
          }}
          onSaved={(row, replacedId) => {
            applySaved(row, replacedId);
            router.refresh();
          }}
          onRemoved={(id) => {
            setEntries((current) =>
              current.filter((entry) => entry.id !== id),
            );
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={useLastOpen}
        onOpenChange={setUseLastOpen}
        title={`Use the last ${item.name}?`}
        description={`All ${batches.length} ${
          batches.length === 1 ? "batch" : "batches"
        } (${uniqueLocations.map(locationLabel).join(", ")}) will be removed from your pantry. The catalog item stays for next time.`}
        confirmLabel="Used the last one"
        onConfirm={async () => {
          const result = await consumeFromItem({
            itemId: item.id,
            amount: total,
            addToGrocery: false,
          });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(
            `Used the last ${item.name} · removed from pantry`,
            {
              action: {
                label: "Undo",
                onClick: () =>
                  void restoreBatches({
                    snapshots: result.data.snapshots,
                  }),
              },
              duration: 8000,
            },
          );
          router.push("/inventory");
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Remove ${item.name}?`}
        description={`This deletes all ${batches.length} ${
          batches.length === 1 ? "batch" : "batches"
        }. The catalog item stays for next time.`}
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          const snapshots = batches.map(toBatchSnapshot);
          for (const batch of batches) {
            const result = await deleteInventory(batch.id);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
          }
          toast.success(`${item.name} removed`, {
            action: {
              label: "Undo",
              onClick: () => void restoreBatches({ snapshots }),
            },
            duration: 8000,
          });
          router.push("/inventory");
          router.refresh();
        }}
      />
    </div>
  );
}
