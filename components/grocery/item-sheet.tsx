"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  assignAisle,
  deleteGroceryItem,
  setItemStoreAisle,
  updateGroceryItem,
} from "@/app/(app)/grocery/actions";
import type { CategoryRow, StoreAisleRow, StoreRow } from "@/lib/types";
import type { GroceryListItem } from "@/components/grocery/grocery-view";

type Props = {
  item: GroceryListItem;
  store: StoreRow | null;
  aisles: StoreAisleRow[];
  assignedAisleId: string | null;
  categories: CategoryRow[];
  stores: StoreRow[];
  rememberedByStore: Record<string, string | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: (patch: Partial<GroceryListItem>) => void;
  onDeleted: () => void;
};

export function ItemSheet({
  item,
  store,
  aisles,
  assignedAisleId,
  categories,
  stores,
  rememberedByStore,
  open,
  onOpenChange,
  onChanged,
  onDeleted,
}: Props) {
  const storeAisles = (storeId: string) =>
    aisles
      .filter((aisle) => aisle.store_id === storeId)
      .sort((a, b) => a.sort_order - b.sort_order);
  const router = useRouter();
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity);
  const [unit, setUnit] = useState(item.unit ?? "");
  const [categoryId, setCategoryId] = useState(item.category_id ?? "__none");
  const [saleOnly, setSaleOnly] = useState(item.sale_only);
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

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
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onChanged({
      name: trimmed || item.name,
      quantity,
      unit: unit.trim() || null,
      category_id: categoryId === "__none" ? null : categoryId,
      sale_only: saleOnly,
    });
    toast.success("Saved");
    onOpenChange(false);
  }

  async function changeAisle(aisleId: string | null) {
    if (!store) return;
    const result = item.item_id
      ? await setItemStoreAisle(item.item_id, store.id, aisleId)
      : await assignAisle(item.id, store.id, aisleId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(item.item_id ? "Aisle remembered" : "Aisle saved");
    router.refresh();
  }

  async function changeRemembered(storeId: string, aisleId: string | null) {
    if (!item.item_id) return;
    const result = await setItemStoreAisle(item.item_id, storeId, aisleId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Aisle remembered");
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-3">
        <SheetHeader>
          <SheetTitle>Edit item</SheetTitle>
          <SheetDescription>
            {store
              ? item.item_id
                ? `Filing under ${store.name} — remembered for future trips`
                : `Filing under ${store.name} (this trip only)`
              : "Quantity, unit, and category"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 px-4">
          <div className="space-y-2">
            <Label htmlFor="grocery-name">Name</Label>
            <Input
              id="grocery-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Quantity</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Decrease quantity"
                  onClick={() => setQuantity((value) => Math.max(0, value - 1))}
                >
                  <Minus />
                </Button>
                <span className="flex-1 text-center font-extrabold tabular-nums">
                  {quantity}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Increase quantity"
                  onClick={() => setQuantity((value) => value + 1)}
                >
                  <Plus />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="grocery-unit">Unit</Label>
              <Input
                id="grocery-unit"
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                placeholder="ea…"
              />
            </div>
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

          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5">
            <Checkbox
              checked={saleOnly}
              onCheckedChange={(value) => setSaleOnly(value === true)}
              aria-label="Only buy if on sale"
            />
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Tag className="h-3.5 w-3.5 text-amber-600" />
              Only buy if on sale
            </span>
          </label>

          {store && storeAisles(store.id).length > 0 ? (
            <div className="space-y-2">
              <Label>Aisle at {store.name}</Label>
              <Select
                value={assignedAisleId ?? "__none"}
                items={[
                  { value: "__none", label: "Needs an aisle" },
                  ...storeAisles(store.id).map((aisle) => ({
                    value: aisle.id,
                    label: aisle.name,
                  })),
                ]}
                onValueChange={(value) =>
                  void changeAisle(
                    !value || value === "__none" ? null : value,
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Not filed yet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Needs an aisle</SelectItem>
                  {storeAisles(store.id).map((aisle) => (
                    <SelectItem key={aisle.id} value={aisle.id}>
                      {aisle.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {item.item_id && stores.length > 0 ? (
            <div className="space-y-2">
              <Label>Remember for future trips</Label>
              <div className="space-y-2">
                {stores.map((entry) => {
                  const list = storeAisles(entry.id);
                  if (list.length === 0) return null;
                  const value = rememberedByStore[entry.id] ?? "__none";
                  return (
                    <div key={entry.id} className="flex items-center gap-2">
                      <span className="w-36 shrink-0 truncate text-sm text-muted-foreground">
                        {entry.name}
                      </span>
                      <Select
                        value={value}
                        items={[
                          { value: "__none", label: "Not set" },
                          ...list.map((aisle) => ({
                            value: aisle.id,
                            label: aisle.name,
                          })),
                        ]}
                        onValueChange={(next) =>
                          void changeRemembered(
                            entry.id,
                            !next || next === "__none" ? null : next,
                          )
                        }
                      >
                        <SelectTrigger className="h-8 flex-1 text-sm">
                          <SelectValue placeholder="Not set" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Not set</SelectItem>
                          {list.map((aisle) => (
                            <SelectItem key={aisle.id} value={aisle.id}>
                              {aisle.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Used automatically whenever this item is added for that store.
              </p>
            </div>
          ) : null}
        </div>

        <SheetFooter className="gap-2 sm:gap-0">
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
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
