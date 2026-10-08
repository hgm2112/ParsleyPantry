"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListChecks, Loader2, Pencil, Plus, Search, Settings2, Tag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  adoptCategoryAisles,
  addGroceryItem,
  clearCheckedGrocery,
  restoreGroceryItems,
  setGrocerySettings,
  updateGroceryItem,
} from "@/app/(app)/grocery/actions";
import {
  ANY_STORE_KEY,
  UNASSIGNED_GROUP_KEY,
  buildItemStores,
  buildStoreSections,
  missingAislesForStore,
  visibleForStores,
} from "@/lib/grocery-groups";
import { tintFor } from "@/lib/tints";
import { aisleEmoji } from "@/lib/tiles";
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
import { ItemDialog } from "@/components/grocery/item-dialog";

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

export type CatalogEntry = {
  id: string;
  name: string;
  unit: string | null;
  category_id: string | null;
  barcode: string | null;
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
    on_shopping_list: boolean;
  }[];
};

type Props = {
  initialItems: GroceryListItem[];
  stores: StoreRow[];
  aisles: StoreAisleRow[];
  assignments: { grocery_item_id: string; store_id: string; aisle_id: string }[];
  categories: CategoryRow[];
  itemStores: { grocery_item_id: string; store_id: string }[];
  settings: HouseholdSettingsRow;
  inventory: InventoryEntry[];
  recipes: GroceryRecipe[];
  rememberedAisles: { item_id: string; store_id: string; aisle_id: string }[];
  catalog: CatalogEntry[];
};

type Group = {
  key: string;
  title: string;
  hint?: string;
  adopt?: boolean;
  items: GroceryListItem[];
};

type Section = {
  key: string;
  title: string;
  groups: Group[];
};

export function GroceryView({
  initialItems,
  stores,
  aisles,
  assignments,
  categories,
  itemStores,
  settings,
  inventory,
  recipes,
  rememberedAisles,
  catalog,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<GroceryViewMode>(settings.grocery_view_mode);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const live = (settings.selected_store_ids ?? []).filter((id) =>
      stores.some((entry) => entry.id === id),
    );
    if (live.length > 0) return live;
    return stores[0] ? [stores[0].id] : [];
  });
  const [overrides, setOverrides] = useState<Record<string, Partial<GroceryListItem>>>({});
  const [editing, setEditing] = useState<GroceryListItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [adoptBusy, setAdoptBusy] = useState(false);

  // Categories that are acting as store aisles are not item categories —
  // keep them out of the add/edit pickers.
  const pickerCategories = useMemo(() => {
    const aisleLinked = new Set(
      aisles
        .map((aisle) => aisle.category_id)
        .filter((id): id is string => id !== null),
    );
    return categories.filter((category) => !aisleLinked.has(category.id));
  }, [aisles, categories]);

  const items = useMemo(
    () =>
      initialItems.map((item) =>
        overrides[item.id] ? { ...item, ...overrides[item.id] } : item,
      ),
    [initialItems, overrides],
  );

  // Stores in view. An empty selection can't come from the UI (the last pill
  // stays on); if it does anyway, read it as "every store" so the list never
  // goes blank.
  const sectionStores = useMemo(() => {
    const active = stores.filter((entry) => selectedIds.includes(entry.id));
    return active.length > 0 ? active : stores;
  }, [stores, selectedIds]);

  const itemStoreMap = useMemo(() => buildItemStores(itemStores), [itemStores]);

  const visibleItems = useMemo(
    () =>
      visibleForStores(
        items,
        itemStoreMap,
        sectionStores.map((entry) => entry.id),
      ),
    [items, itemStoreMap, sectionStores],
  );

  // Would-seed categories without an aisle yet, per store. Drives each
  // store's "Use my categories as aisles" rescue button.
  const missingByStore = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of stores) {
      map.set(entry.id, missingAislesForStore(entry.id, aisles, categories));
    }
    return map;
  }, [stores, aisles, categories]);

  // Unchecked lines per store, for the store pills.
  const toBuyByStore = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (item.checked) continue;
      for (const storeId of itemStoreMap.get(item.id) ?? []) {
        map.set(storeId, (map.get(storeId) ?? 0) + 1);
      }
    }
    return map;
  }, [items, itemStoreMap]);

  const stockByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of inventory) {
      map.set(entry.item_id, (map.get(entry.item_id) ?? 0) + entry.quantity);
    }
    return map;
  }, [inventory]);

  const onListSet = useMemo(
    () =>
      new Set(
        items
          .map((item) => item.item_id)
          .filter((itemId): itemId is string => !!itemId),
      ),
    [items],
  );

  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const scored: { entry: CatalogEntry; rank: number }[] = [];
    for (const entry of catalog) {
      const name = entry.name.toLowerCase();
      const barcode = entry.barcode ?? "";
      if (!name.includes(needle) && !barcode.includes(needle)) continue;
      scored.push({ entry, rank: name.startsWith(needle) ? 0 : 1 });
    }
    scored.sort(
      (a, b) => a.rank - b.rank || a.entry.name.localeCompare(b.entry.name),
    );
    return scored.slice(0, 8).map((entry) => entry.entry);
  }, [catalog, query]);

  const totalLeft = visibleItems.filter((item) => !item.checked).length;
  const totalChecked = visibleItems.length - totalLeft;

  const sections = useMemo<Section[]>(() => {
    const built = buildStoreSections<GroceryListItem>({
      items: visibleItems,
      mode,
      stores: sectionStores,
      aisles,
      itemStores: itemStoreMap,
      assignments,
      rememberedAisles,
      categories,
    });

    if (mode !== "aisle") {
      return built.map((section) => ({
        key: section.key,
        title: section.title,
        groups: section.groups,
      }));
    }

    return built.map((section) => {
      const missing =
        section.key === ANY_STORE_KEY
          ? 0
          : missingByStore.get(section.key) ?? 0;
      return {
        key: section.key,
        title: section.title,
        groups: section.groups.map(
          (group): Group =>
            section.key === ANY_STORE_KEY
              ? {
                  ...group,
                  hint: "Tap an item to choose where you buy it",
                }
              : group.key.endsWith(UNASSIGNED_GROUP_KEY)
                ? {
                    ...group,
                    hint: "Tap an item to file it under an aisle",
                    adopt: missing > 0,
                  }
                : group,
        ),
      };
    });
  }, [
    visibleItems,
    mode,
    sectionStores,
    aisles,
    itemStoreMap,
    assignments,
    rememberedAisles,
    categories,
    missingByStore,
  ]);

  const showStoreHeaders = sections.length > 1;

  async function quickAdd(entry: CatalogEntry) {
    if (onListSet.has(entry.id)) {
      toast.message(`${entry.name} is already on the list`);
      return;
    }
    setAddingId(entry.id);
    const result = await addGroceryItem({
      name: entry.name,
      itemId: entry.id,
      categoryId: entry.category_id,
      quantity: 1,
      unit: entry.unit,
      source: "manual",
    });
    setAddingId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setQuery("");
    toast.success(`${entry.name} added to the list`);
    router.refresh();
  }

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

  /** Turns one store on or off. The last store always stays in view. */
  async function toggleStore(storeId: string) {
    const next = selectedIds.includes(storeId)
      ? selectedIds.filter((id) => id !== storeId)
      : stores
          .filter((entry) => selectedIds.includes(entry.id) || entry.id === storeId)
          .map((entry) => entry.id);
    if (next.length === 0) return;

    setSelectedIds(next);
    const result = await setGrocerySettings({ selectedStoreIds: next });
    if (!result.ok) {
      setSelectedIds(selectedIds);
      toast.error(result.error);
    }
  }

  async function showAllStores() {
    const next = stores.map((entry) => entry.id);
    if (next.length === 0) return;
    setSelectedIds(next);
    const result = await setGrocerySettings({ selectedStoreIds: next });
    if (!result.ok) {
      setSelectedIds(selectedIds);
      toast.error(result.error);
    }
  }

  async function adoptAisles(storeId: string) {
    setAdoptBusy(true);
    const result = await adoptCategoryAisles(storeId);
    setAdoptBusy(false);    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.data.created > 0
        ? `Added ${result.data.created} aisles from your categories`
        : "Nothing to add — every seed category already has an aisle here",
    );
    router.refresh();
  }

  async function restoreCleared(removed: GroceryListItem[]) {
    const result = await restoreGroceryItems(
      removed.map((item) => ({
        id: item.id,
        item_id: item.item_id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category_id: item.category_id,
        sale_only: item.sale_only,
        source: item.source,
      })),
    );
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Restored");
    router.refresh();
  }

  async function clearChecked() {
    // Only the stores in view get emptied — never a store you aren't seeing.
    const removed = visibleItems.filter((item) => item.checked);
    if (removed.length === 0) return;
    setOverrides((current) => {
      const copy = { ...current };
      for (const item of removed) delete copy[item.id];
      return copy;
    });
    const result = await clearCheckedGrocery(removed.map((item) => item.id));
    if (!result.ok) {
      toast.error(result.error);
      router.refresh();
      return;
    }
    toast.success(
      `Cleared ${removed.length} item${removed.length === 1 ? "" : "s"}`,
      {
        duration: 10000,
        action: {
          label: "Undo",
          onClick: () => void restoreCleared(removed),
        },
      },
    );
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-30 -mx-3 border-b bg-background/95 px-3 pt-3 pb-2.5 backdrop-blur md:top-14 md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div>
              <h1 className="text-lg font-extrabold">Shopping list</h1>
              <p className="text-xs text-muted-foreground">
                {totalLeft} to buy
                {totalChecked > 0 ? ` · ${totalChecked} in cart` : ""}
              </p>
            </div>
            <div className="flex overflow-hidden rounded-md border">
              <button
                type="button"
                disabled={stores.length === 0}
                onClick={() => void changeMode("aisle")}
                className={cn(
                  "px-2 py-1 text-xs font-semibold disabled:opacity-40",
                  mode === "aisle"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                Aisles
              </button>
              <button
                type="button"
                onClick={() => void changeMode("category")}
                className={cn(
                  "px-2 py-1 text-xs font-semibold",
                  mode === "category"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                Categories
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus /> Add
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              render={<Link href="/grocery/stores" />}
              aria-label="Manage stores and aisles"
            >
              <Settings2 />
            </Button>
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${
                    visibleItems.length === 0
                      ? 0
                      : Math.round((totalChecked / visibleItems.length) * 100)
                  }%`,
                }}
              />
            </div>
            <span className="whitespace-nowrap text-xs font-semibold text-muted-foreground">
              {totalChecked} of {visibleItems.length} ·{" "}
              {visibleItems.length === 0
                ? 0
                : Math.round((totalChecked / visibleItems.length) * 100)}
              %
            </span>
        </div>

        {stores.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {stores.map((entry) => {
              const on = selectedIds.includes(entry.id);
              const count = toBuyByStore.get(entry.id) ?? 0;
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => void toggleStore(entry.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold transition-colors",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-muted-foreground hover:bg-accent",
                  )}
                >
                  {entry.name}
                  {count > 0 ? (
                    <span className="text-xs font-bold tabular-nums opacity-80">
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="mt-2.5 flex items-center gap-2">
          <div
            className="relative flex-1"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setSearchFocused(false);
              }
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => setSearchFocused(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  const first = searchResults[0];
                  if (first) void quickAdd(first);
                } else if (event.key === "Escape") {
                  setQuery("");
                  setSearchFocused(false);
                }
              }}
              placeholder="Type to add an item…"
              className="h-9 pl-8 pr-3"
              aria-label="Search catalog to add to grocery list"
            />
            {searchFocused && query.trim() ? (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-xl border bg-background shadow-md">
                {searchResults.length === 0 ? (
                  <p className="px-3 py-2.5 text-sm text-muted-foreground">
                    No catalog match — use Add for recipes or a new item.
                  </p>
                ) : (
                  searchResults.map((entry) => (
                    <button
                      type="button"
                      key={entry.id}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => void quickAdd(entry)}
                      disabled={addingId === entry.id}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-60"
                    >
                      {addingId === entry.id ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate">
                        {entry.name}
                        {entry.unit ? (
                          <span className="text-muted-foreground"> · {entry.unit}</span>
                        ) : null}
                      </span>
                      {stockByItem.get(entry.id) ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          ×{stockByItem.get(entry.id)} in pantry
                        </span>
                      ) : null}
                      {onListSet.has(entry.id) ? (
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                          on list
                        </span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </div>

        {mode === "aisle" && stores.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing your categories —{" "}
            <Link href="/grocery/stores" className="underline">
              create a store
            </Link>{" "}
            to arrange by a store&apos;s own aisles.
          </p>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="text-sm font-semibold">Nothing on the list</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Add items manually, pull them from inventory, or push a recipe&apos;s
            ingredients.
          </p>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus /> Add the first item
          </Button>
        </div>
      ) : sections.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          Nothing on the list for{" "}
          {sectionStores.map((entry) => entry.name).join(" or ")}.{" "}
          <button type="button" className="underline" onClick={showAllStores}>
            Show every store
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => (
            <Fragment key={section.key}>
              {showStoreHeaders ? (
                <div className="flex items-center gap-2 sm:col-span-2 xl:col-span-3">
                  <h2 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
                    {section.title}
                  </h2>
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-xs font-semibold text-muted-foreground">
                    {section.groups.reduce(
                      (total, group) =>
                        total + group.items.filter((item) => !item.checked).length,
                      0,
                    )}{" "}
                    left
                  </span>
                </div>
              ) : null}
              {section.groups.map((group) => {
                const tint = tintFor(group.title);
                const emoji = aisleEmoji(group.title);
                return (
                  <section
                    key={group.key}
                    className={cn(
                      "flex flex-col overflow-hidden rounded-xl border",
                      tint.header,
                    )}
                  >
                    <div className="flex items-baseline justify-between px-3 py-2">
                      <h2 className="text-sm font-extrabold">
                        {emoji ? (
                          <span className="mr-1.5" aria-hidden>
                            {emoji}
                          </span>
                        ) : null}
                        {group.title}
                      </h2>
                      <span className="text-xs opacity-70">
                        {group.items.filter((item) => !item.checked).length} left
                      </span>
                    </div>
                    {group.hint ? (
                      <p className="px-3 pb-2 text-xs opacity-80">
                        {group.hint}
                        {group.adopt ? (
                          <>
                            {" "}
                            <button
                              type="button"
                              className="underline disabled:no-underline"
                              disabled={adoptBusy}
                              onClick={() => void adoptAisles(section.key)}
                            >
                              {adoptBusy ? "Adding aisles…" : "Use my categories as aisles"}
                            </button>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                    <ul className="flex-1 divide-y divide-black/5 bg-background">
                      {group.items.map((item) => (
                        <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                          <Checkbox
                            checked={item.checked}
                            onCheckedChange={() => void toggleChecked(item)}
                            aria-label={
                              item.checked
                                ? `Put ${item.name} back on the list`
                                : `Mark ${item.name} as bought`
                            }
                          />
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => setEditing(item)}
                          >
                            <span className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "truncate text-sm font-semibold",
                                  item.checked && "text-muted-foreground line-through",
                                )}
                              >
                                {item.name}
                              </span>
                              {item.sale_only ? (
                                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                  <Tag className="h-2.5 w-2.5" />
                                  Sale only
                                </span>
                              ) : null}
                            </span>
                            {item.source !== "manual" ? (
                              <span className="text-xs text-muted-foreground">
                                from {item.source}
                              </span>
                            ) : null}
                          </button>
                          <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                            {item.quantity}
                            {item.unit ? ` ${item.unit}` : ""}
                          </span>
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
                );
              })}
            </Fragment>
          ))}
        </div>
      )}

      {totalChecked > 0 ? (
        <div className="sticky bottom-16 z-30 -mx-3 border-t bg-background/95 px-3 py-2.5 backdrop-blur md:bottom-0 md:-mx-6 md:px-6">
          <Button size="lg" className="w-full" onClick={clearChecked}>
            <ListChecks /> Finish shopping · {totalChecked}
          </Button>
        </div>
      ) : null}

      <AddGrocerySheet
        open={addOpen}
        onOpenChange={setAddOpen}
        inventory={inventory}
        recipes={recipes}
        categories={pickerCategories}
        onAdded={() => router.refresh()}
      />

      {editing ? (
        <ItemDialog
          key={editing.id}
          item={editing}
          stores={stores}
          membership={Array.from(itemStoreMap.get(editing.id) ?? [])}
          aisles={aisles}
          assignments={assignments}
          rememberedAisles={rememberedAisles}
          categories={pickerCategories}
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
