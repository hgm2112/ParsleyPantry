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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: (patch: Partial<GroceryListItem>) => void;
  onDeleted: () => void;
};

export function ItemDialog({
  item,
  store,
  aisles,
  assignedAisleId,
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
                "border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200",
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
                void changeAisle(!value || value === "__none" ? null : value)
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
