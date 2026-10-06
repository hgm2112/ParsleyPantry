"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListChecks, Pencil, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  clearCheckedGrocery,
  setGrocerySettings,
  updateGroceryItem,
} from "@/app/(app)/grocery/actions";
import type {
  CategoryRow,
  GroceryItemRow,
  GroceryViewMode,
  HouseholdSettingsRow,
  InventoryEntry,
  StoreAisleRow,
  StoreRow,
} from "@/lib/types";
import { AddGrocerySheet } from "@/components/grocery/add-sheet";
import { ItemSheet } from "@/components/grocery/item-sheet";

export type GroceryListItem = GroceryItemRow & {
  item: {
    id: string;
    name: string;
    category_id: string | null;
    unit: string | null;
    barcode: string | null;
    default_location: string;
  } | null;
};

export type GroceryRecipe = {
  id: string;
  name: string;
  recipe_ingredients: {
    id: string;
    item_id: string | null;
    name: string;
    quantity_text: string;
    optional: boolean;
  }[];
};

type Props = {
  initialItems: GroceryListItem[];
  stores: StoreRow[];
  aisles: StoreAisleRow[];
  assignments: { grocery_item_id: string; store_id: string; aisle_id: string }[];
  categories: CategoryRow[];
  settings: HouseholdSettingsRow;
  inventory: InventoryEntry[];
  recipes: GroceryRecipe[];
};

type Group = { key: string; title: string; hint?: string; items: GroceryListItem[] };

export function GroceryView({
  initialItems,
  stores,
  aisles,
  assignments,
  categories,
  settings,
  inventory,
  recipes,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<GroceryViewMode>(settings.grocery_view_mode);
  const [storeId, setStoreId] = useState<string | null>(
    settings.selected_store_id ?? (stores[0]?.id ?? null),
  );
  const [overrides, setOverrides] = useState<Record<string, Partial<GroceryListItem>>>({});
  const [editing, setEditing] = useState<GroceryListItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const store = stores.find((entry) => entry.id === storeId) ?? null;
  const storeAisles = useMemo(
    () =>
      aisles
        .filter((aisle) => aisle.store_id === storeId)
        .sort((a, b) => a.sort_order - b.sort_order),
    [aisles, storeId],
  );

  const aisleByItem = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of assignments) {
      if (row.store_id === storeId) map.set(row.grocery_item_id, row.aisle_id);
    }
    return map;
  }, [assignments, storeId]);

  const items = useMemo(
    () =>
      initialItems.map((item) =>
        overrides[item.id] ? { ...item, ...overrides[item.id] } : item,
      ),
    [initialItems, overrides],
  );

  const totalLeft = items.filter((item) => !item.checked).length;
  const totalChecked = items.length - totalLeft;

  const groups: Group[] = useMemo(() => {
    if (mode === "aisle" && store) {
      const result: Group[] = storeAisles.map((aisle) => ({
        key: aisle.id,
        title: aisle.name,
        items: items.filter((item) => aisleByItem.get(item.id) === aisle.id),
      }));

      const unassigned = items.filter((item) => !aisleByItem.has(item.id));
      if (unassigned.length > 0) {
        result.push({
          key: "__unassigned",
          title: "Needs an aisle",
          hint: "Tap an item to file it under an aisle",
          items: unassigned,
        });
      }

      return result.filter((group) => group.items.length > 0);
    }

    const byCategory = new Map<string | null, GroceryListItem[]>();
    for (const item of items) {
      const categoryId = item.category_id ?? item.item?.category_id ?? null;
      const list = byCategory.get(categoryId) ?? [];
      list.push(item);
      byCategory.set(categoryId, list);
    }

    const ordered: Group[] = categories.map((category) => ({
      key: category.id,
      title: category.name,
      items: byCategory.get(category.id) ?? [],
    }));
    const leftovers = byCategory.get(null) ?? [];
    const claimed = new Set(categories.map((category) => category.id));
    for (const [categoryId, list] of byCategory) {
      if (categoryId && !claimed.has(categoryId)) {
        ordered.push({
          key: categoryId,
          title:
            categories.find((category) => category.id === categoryId)?.name ??
            "Other",
          items: list,
        });
      }
    }
    if (leftovers.length > 0) {
      ordered.push({ key: "__other", title: "Other", items: leftovers });
    }

    return ordered.filter((group) => group.items.length > 0);
  }, [items, mode, store, storeAisles, aisleByItem, categories]);

  function patchLocal(id: string, patch: Partial<GroceryListItem>) {
    setOverrides((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  async function toggleChecked(item: GroceryListItem) {
    const next = !item.checked;
    patchLocal(item.id, { checked: next });
    const result = await updateGroceryItem({ id: item.id, checked: next });
    if (!result.ok) {
      patchLocal(item.id, { checked: item.checked });
      toast.error(result.error);
    }
  }

  async function changeMode(next: GroceryViewMode) {
    setMode(next);
    const result = await setGrocerySettings({ groceryViewMode: next });
    if (!result.ok) toast.error(result.error);
  }

  async function changeStore(next: string) {
    setStoreId(next || null);
    const result = await setGrocerySettings({ selectedStoreId: next || null });
    if (!result.ok) toast.error(result.error);
  }

  async function clearChecked() {
    const removed = items.filter((item) => item.checked);
    setOverrides((current) => {
      const copy = { ...current };
      for (const item of removed) delete copy[item.id];
      return copy;
    });
    const result = await clearCheckedGrocery();
    if (!result.ok) toast.error(result.error);
    else toast.success(`Cleared ${removed.length} checked`);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-30 -mx-3 border-b bg-background/95 px-3 pt-3 pb-2.5 backdrop-blur md:top-14 md:-mx-6 md:px-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold">Grocery list</h1>
            <p className="text-xs text-muted-foreground">
              {totalLeft} to buy
              {totalChecked > 0 ? ` · ${totalChecked} in cart` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {totalChecked > 0 ? (
              <Button variant="ghost" size="sm" onClick={clearChecked}>
                <ListChecks /> Clear
              </Button>
            ) : null}
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus /> Add
            </Button>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {stores.length > 0 ? (
            <Select value={storeId ?? ""} onValueChange={(value) => void changeStore(value ?? "")}>
              <SelectTrigger className="h-8 w-44 text-sm">
                <SelectValue placeholder="Pick a store" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <div className="flex overflow-hidden rounded-md border">
            <button
              type="button"
              disabled={!store}
              onClick={() => void changeMode("aisle")}
              className={cn(
                "px-3 py-1.5 text-sm font-medium disabled:opacity-40",
                mode === "aisle"
                  ? "bg-green-700 text-white"
                  : "bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              Aisles
            </button>
            <button
              type="button"
              onClick={() => void changeMode("category")}
              className={cn(
                "px-3 py-1.5 text-sm font-medium",
                mode === "category"
                  ? "bg-green-700 text-white"
                  : "bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              Categories
            </button>
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            render={<Link href="/grocery/stores" />}
            aria-label="Manage stores and aisles"
          >
            <Settings2 />
          </Button>
        </div>

        {mode === "aisle" && !store ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Create a store to shop by aisle —{" "}
            <Link href="/grocery/stores" className="underline">
              manage stores
            </Link>
            .
          </p>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="text-sm font-medium">Nothing on the list</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Add items manually, pull them from inventory, or push a recipe&apos;s
            ingredients.
          </p>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus /> Add the first item
          </Button>
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          Everything is in the cart.{" "}
          <button type="button" className="underline" onClick={clearChecked}>
            Clear checked items
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.key}>
              <div className="mb-1.5 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.title}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {group.items.filter((item) => !item.checked).length} left
                </span>
              </div>
              {group.hint ? (
                <p className="mb-1.5 text-xs text-muted-foreground">{group.hint}</p>
              ) : null}
              <ul className="divide-y rounded-xl border bg-background">
                {group.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                    <Checkbox
                      checked={item.checked}
                      onCheckedChange={() => void toggleChecked(item)}
                      aria-label={`Mark ${item.name} as bought`}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setEditing(item)}
                    >
                      <span
                        className={cn(
                          "block truncate text-sm font-medium",
                          item.checked && "text-muted-foreground line-through",
                        )}
                      >
                        {item.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.quantity}
                        {item.unit ? ` ${item.unit}` : ""}
                        {item.source !== "manual" ? ` · from ${item.source}` : ""}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${item.name}`}
                      onClick={() => setEditing(item)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <AddGrocerySheet
        open={addOpen}
        onOpenChange={setAddOpen}
        inventory={inventory}
        recipes={recipes}
        categories={categories}
        onAdded={() => router.refresh()}
      />

      {editing ? (
        <ItemSheet
          key={editing.id}
          item={editing}
          store={store}
          aisles={storeAisles}
          assignedAisleId={aisleByItem.get(editing.id) ?? null}
          categories={categories}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onChanged={(patch) => patchLocal(editing.id, patch)}
          onDeleted={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
