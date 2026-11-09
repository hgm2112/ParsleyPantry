"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Cookie, Loader2, Minus, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { StockRow } from "@/components/home/stock-row";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { saveHomeSnacks } from "@/app/(app)/home/actions";
import {
  deleteInventory,
  updateInventory,
} from "@/app/(app)/inventory/actions";
import {
  groupByItem,
  earliestEffective,
  pickFefoBatch,
  type ItemGroup,
} from "@/lib/batches";
import { formatExpiry } from "@/lib/expiry";
import { displayQtyUnit } from "@/lib/stock";
import type { InventoryEntry, SubcategoryRow } from "@/lib/types";

/** Items whose sub-category name contains "snack" (existing rule, unchanged). */
export function SnackWidget({
  rows,
  subcategories,
  selectedItemIds,
}: {
  rows: InventoryEntry[];
  subcategories: SubcategoryRow[];
  selectedItemIds: string[];
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<{
    id: string;
    kind: "minus" | "plus";
  } | null>(null);

  const snackGroups = useMemo(() => {
    const names = new Map(
      subcategories.map((entry) => [entry.id, entry.name.toLowerCase()]),
    );
    return groupByItem(rows).filter((group) => {
      const id = group.item.subcategory_id;
      if (!id) return false;
      return (names.get(id) ?? "").includes("snack");
    });
  }, [rows, subcategories]);

  const snackGroupById = useMemo(
    () => new Map(snackGroups.map((group) => [group.item.id, group])),
    [snackGroups],
  );

  // Manually selected only, in saved order. IDs with no current group
  // (consumed/deleted) are ignored — never a broken reference.
  const selectedGroups = useMemo(() => {
    const order = new Map(selectedItemIds.map((id, index) => [id, index]));
    return snackGroups
      .filter((group) => order.has(group.item.id))
      .sort(
        (a, b) =>
          (order.get(a.item.id) ?? 0) - (order.get(b.item.id) ?? 0),
      );
  }, [snackGroups, selectedItemIds]);

  const candidates = useMemo(() => {
    const sorted = [...snackGroups].sort((a, b) =>
      a.item.name.localeCompare(b.item.name),
    );
    const needle = query.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter((group) =>
      group.item.name.toLowerCase().includes(needle),
    );
  }, [snackGroups, query]);

  function openPicker() {
    setDraft(
      new Set(
        selectedItemIds.filter((id) => snackGroupById.has(id)),
      ),
    );
    setQuery("");
    setPickerOpen(true);
  }

  function toggle(itemId: string, checked: boolean) {
    if (saving) return;
    setDraft((prev) => {
      const next = new Set(prev);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    const result = await saveHomeSnacks([...draft]);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Snacks updated");
    setPickerOpen(false);
    router.refresh();
  }

  /** Consume exactly one unit from the FEFO batch (existing Pantry pattern). */
  async function handleMinus(group: ItemGroup) {
    if (busy) return;
    const batch = pickFefoBatch(group.batches);
    if (!batch) return;
    setBusy({ id: group.item.id, kind: "minus" });
    const removesWholeBatch = batch.quantity <= 1;
    const removedAmount = removesWholeBatch ? batch.quantity : 1;
    const remaining = group.totalQuantity - removedAmount;
    const result = removesWholeBatch
      ? await deleteInventory(batch.id)
      : await updateInventory({
          inventoryId: batch.id,
          quantity: batch.quantity - 1,
        });
    if (!result.ok) {
      setBusy(null);
      toast.error(result.error);
      return;
    }
    if (remaining <= 0) {
      // No quantity left anywhere (or any batch) — clean the selection so
      // there's no stale reference. Best-effort: stale IDs are ignored anyway.
      await saveHomeSnacks(
        selectedItemIds.filter((id) => id !== group.item.id),
      );
    }
    setBusy(null);
    router.refresh();
  }

  /** Add exactly one unit to the FEFO batch (existing inventory quickAdd). */
  async function handlePlus(group: ItemGroup) {
    if (busy) return;
    const batch = pickFefoBatch(group.batches);
    if (!batch) return;
    setBusy({ id: group.item.id, kind: "plus" });
    const result = await updateInventory({
      inventoryId: batch.id,
      quantity: batch.quantity + 1,
    });
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Cookie className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-extrabold">Snacks</h2>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={openPicker}
        >
          <Plus />
          Snack
        </Button>
      </div>
      {selectedGroups.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Choose which snacks appear here.
        </p>
      ) : (
        <ul className="space-y-2">
          {selectedGroups.map((group) => (
            <StockRow
              key={group.item.id}
              group={group}
              actions={
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Consume one ${group.item.name}`}
                    title={`Consume one ${group.item.name}`}
                    disabled={busy !== null}
                    onClick={() => void handleMinus(group)}
                    className="h-7 w-7 shrink-0 text-muted-foreground transition-colors hover:text-red-600 dark:hover:text-red-400"
                  >
                    {busy?.id === group.item.id && busy.kind === "minus" ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Minus className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Add one ${group.item.name}`}
                    title={`Add one ${group.item.name}`}
                    disabled={busy !== null}
                    onClick={() => void handlePlus(group)}
                    className="h-7 w-7 shrink-0 text-muted-foreground transition-colors hover:text-emerald-600 dark:hover:text-emerald-400"
                  >
                    {busy?.id === group.item.id && busy.kind === "plus" ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </Button>
                </>
              }
            />
          ))}
        </ul>
      )}

      <Dialog
        open={pickerOpen}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setPickerOpen(false);
            setQuery("");
          }
        }}
      >
        <DialogContent className="max-h-[85vh] gap-3 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose snacks</DialogTitle>
            <DialogDescription>
              Pick which snacks appear on your Home dashboard.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search snacks"
              className="pl-8"
            />
          </div>

          <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
            {candidates.length === 0 ? (
              <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                {snackGroups.length === 0
                  ? "No snacks in inventory yet — tag items as snacks first."
                  : "No snacks match."}
              </li>
            ) : (
              candidates.map((group) => {
                const checked = draft.has(group.item.id);
                const unit = group.batches[0]?.unit ?? group.item.unit;
                const { qtyText, unitText } = displayQtyUnit(
                  group.totalQuantity,
                  unit,
                );
                const expiry = formatExpiry(
                  earliestEffective(group.batches),
                );
                return (
                  <li key={group.item.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-accent/50">
                      <Checkbox
                        checked={checked}
                        disabled={saving}
                        onCheckedChange={(next) => toggle(group.item.id, next === true)}
                        aria-label={`${group.item.name} ${checked ? "selected" : "not selected"}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {group.item.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          QTY: {qtyText}
                          {unitText ? ` ${unitText}` : ""} · {expiry}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })
            )}
          </ul>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPickerOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? <Loader2 className="animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
