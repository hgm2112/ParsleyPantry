"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  assignAisle,
  deleteGroceryItem,
  setGroceryItemStores,
  setItemStoreAisle,
  updateGroceryItem,
} from "@/app/(app)/grocery/actions";
import {
  type ItemAisleAssignment,
  type RememberedAisle,
  resolveEffectiveAisle,
} from "@/lib/grocery-groups";
import type { CategoryRow, StoreAisleRow, StoreRow } from "@/lib/types";
import type { GroceryListItem } from "@/components/grocery/grocery-view";

type Props = {
  item: GroceryListItem;
  stores: StoreRow[];
  /** Stores this line is bought at; empty means "Any store". */
  membership: string[];
  aisles: StoreAisleRow[];
  assignments: ItemAisleAssignment[];
  rememberedAisles: RememberedAisle[];
  categories: CategoryRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: (patch: Partial<GroceryListItem>) => void;
  onDeleted: () => void;
};

export function ItemDialog({
  item,
  stores,
  membership,
  aisles,
  assignments,
  rememberedAisles,
  categories,
  open,
  onOpenChange,
  onChanged,
  onDeleted,
}: Props) {
  const storeAisles = (storeId: string) =>
    aisles
      .filter((aisle) => aisle.store_id === storeId)
      .sort((a, b) => a.sort_order - b.sort_order);

  /** Aisle each store would file this line under before any pin. */
  const effectiveAisle = (storeId: string): string | null => {
    const aislesForStore = storeAisles(storeId);
    if (aislesForStore.length === 0) return null;
    const map = resolveEffectiveAisle(
      [item],
      storeId,
      aislesForStore,
      assignments,
      rememberedAisles,
      categories,
    );
    return map.get(item.id) ?? null;
  };

  const router = useRouter();
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity);
  const [unit, setUnit] = useState(item.unit ?? "");
  const [categoryId, setCategoryId] = useState(item.category_id ?? "__none");
  const [saleOnly, setSaleOnly] = useState(item.sale_only);
  const [storeIds, setStoreIds] = useState<string[]>(membership);
  const [aisleByStore, setAisleByStore] = useState<Record<string, string | null>>(
    () => {
      const map: Record<string, string | null> = {};
      for (const store of stores) {
        if (!membership.includes(store.id)) continue;
        map[store.id] = effectiveAisle(store.id);
      }
      return map;
    },
  );
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function toggleStore(storeId: string) {
    setStoreIds((current) =>
      current.includes(storeId)
        ? current.filter((id) => id !== storeId)
        : [...current, storeId],
    );
  }

  async function save() {
    setBusy(true);
    const trimmed = name.trim();
    const result = await updateGroceryItem({
      id: item.id,
      name: trimmed || item.name,
      quantity,
      unit: unit.trim() || null,
      categoryId: categoryId === "__none" ? null : categoryId,
      saleOnly,
    });
    if (!result.ok) {
      setBusy(false);
      toast.error(result.error);
      return;
    }

    const before = new Set(membership);
    const after = new Set(storeIds);
    const sameMembership =
      before.size === after.size && [...after].every((id) => before.has(id));
    if (!sameMembership) {
      const storesResult = await setGroceryItemStores(item.id, storeIds);
      if (!storesResult.ok) {
        setBusy(false);
        toast.error(storesResult.error);
        return;
      }
    }

    // Pin the aisles shown in the dialog: they may only be category-derived,
    // and a category edit must never silently unfile the line.
    for (const storeId of storeIds) {
      const aisleId = aisleByStore[storeId];
      if (!aisleId) continue;
      const aisleResult = item.item_id
        ? await setItemStoreAisle(item.item_id, storeId, aisleId)
        : await assignAisle(item.id, storeId, aisleId);
      if (!aisleResult.ok) {
        setBusy(false);
        toast.error(aisleResult.error);
        return;
      }
    }

    setBusy(false);
    onChanged({
      name: trimmed || item.name,
      quantity,
      unit: unit.trim() || null,
      category_id: categoryId === "__none" ? null : categoryId,
      sale_only: saleOnly,
    });
    toast.success("Saved");
    onOpenChange(false);
    if (!sameMembership) router.refresh();
  }

  async function changeAisle(storeId: string, aisleId: string | null) {
    setAisleByStore((current) => ({ ...current, [storeId]: aisleId }));
    const result = item.item_id
      ? await setItemStoreAisle(item.item_id, storeId, aisleId)
      : await assignAisle(item.id, storeId, aisleId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(item.item_id ? "Aisle remembered" : "Aisle saved");
    router.refresh();
  }

  async function remove() {
    setDeleteBusy(true);
    const result = await deleteGroceryItem(item.id);
    setDeleteBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${item.name} removed`);
    onDeleted();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3">
        <DialogHeader>
          <DialogTitle>Edit item</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            aria-label="Item name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-9 min-w-0 flex-1"
          />
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Decrease quantity"
              onClick={() => setQuantity((value) => Math.max(0, value - 1))}
            >
              <Minus />
            </Button>
            <span className="w-5 text-center text-sm font-extrabold tabular-nums">
              {quantity}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Increase quantity"
              onClick={() => setQuantity((value) => value + 1)}
            >
              <Plus />
            </Button>
          </div>
          <Input
            aria-label="Unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            placeholder="ea…"
            className="h-9 w-14 shrink-0 px-2 text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Only buy if on sale"
            aria-pressed={saleOnly}
            onClick={() => setSaleOnly((value) => !value)}
            className={cn(
              "shrink-0",
              saleOnly &&
                "border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900",
            )}
          >
            <Tag />
          </Button>
        </div>

        <div className="space-y-2">
          <Label>Category</Label>
          <Select
            value={categoryId}
            items={[
              { value: "__none", label: "None" },
              ...categories.map((category) => ({
                value: category.id,
                label: category.name,
              })),
            ]}
            onValueChange={(value) => setCategoryId(value ?? "__none")}
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

        {stores.length > 0 ? (
          <div className="space-y-2">
            <Label>Buy at</Label>
            <div className="flex flex-wrap gap-1.5">
              {stores.map((store) => {
                const on = storeIds.includes(store.id);
                return (
                  <button
                    key={store.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleStore(store.id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm font-semibold transition-colors",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {store.name}
                  </button>
                );
              })}
            </div>
            {storeIds.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Not filed to a store yet — it shows under &quot;Any store&quot;.
              </p>
            ) : null}
          </div>
        ) : null}

        {storeIds.map((storeId) => {
          const store = stores.find((entry) => entry.id === storeId);
          if (!store || !store.use_aisles || storeAisles(storeId).length === 0) return null;
          const value = aisleByStore[storeId] ?? effectiveAisle(storeId);
          return (
            <div key={storeId} className="space-y-2">
              <Label>Aisle at {store.name}</Label>
              <Select
                value={value ?? "__none"}
                items={[
                  { value: "__none", label: "Needs an aisle" },
                  ...storeAisles(storeId).map((aisle) => ({
                    value: aisle.id,
                    label: aisle.name,
                  })),
                ]}
                onValueChange={(next) => {
                  const aisleId = !next || next === "__none" ? null : next;
                  void changeAisle(storeId, aisleId);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Not filed yet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Needs an aisle</SelectItem>
                  {storeAisles(storeId).map((aisle) => (
                    <SelectItem key={aisle.id} value={aisle.id}>
                      {aisle.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="destructive"
            onClick={remove}
            disabled={deleteBusy}
            aria-label={`Remove ${item.name}`}
          >
            {deleteBusy ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
          <Button onClick={save} disabled={busy} className="flex-1">
            {busy ? <Loader2 className="animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
