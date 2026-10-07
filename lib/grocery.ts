import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { categoryMatchKey } from "@/lib/kitchenowl";
import type { GrocerySource, StoreAisleRow } from "@/lib/types";

export type EnsureGroceryInput = {
  itemId: string | null;
  name: string;
  quantity?: number;
  unit?: string | null;
  categoryId?: string | null;
  source: GrocerySource;
};

/**
 * Adds an unchecked grocery row unless the same item is already waiting to be
 * bought. Never duplicates low-stock / consume re-adds.
 */
export async function ensureGroceryItem(
  supabase: SupabaseClient,
  householdId: string,
  input: EnsureGroceryInput,
): Promise<{ created: boolean; id: string | null }> {
  const base = supabase
    .from("grocery_items")
    .select("id")
    .eq("household_id", householdId)
    .eq("checked", false);

  const { data: existingRows } = await (
    input.itemId
      ? base.eq("item_id", input.itemId)
      : base.eq("name", input.name)
  ).limit(1);

  const existing = (existingRows ?? [])[0] as { id: string } | undefined;
  if (existing) return { created: false, id: existing.id };

  const { data: inserted, error } = await supabase
    .from("grocery_items")
    .insert({
      household_id: householdId,
      item_id: input.itemId,
      name: input.name,
      quantity: input.quantity ?? 1,
      unit: input.unit ?? null,
      category_id: input.categoryId ?? null,
      source: input.source,
    })
    .select("id")
    .single();

  if (error || !inserted) return { created: false, id: null };
  return { created: true, id: (inserted as { id: string }).id };
}

type CategoryEntry = { name: string; sort: number };

/**
 * Treats household categories as the source of truth for store aisles.
 * Pairs each aisle with a category (exact name first, then match key),
 * renames paired aisles to the category's current label, and rewrites the
 * store's aisle order so paired aisles follow the category order while
 * manual extras keep their relative order at the end. Only writes rows
 * that actually changed.
 */
export async function syncStoreAislesToCategories(
  supabase: SupabaseClient,
  householdId: string,
): Promise<void> {
  const [categoriesResult, storesResult, aislesResult] = await Promise.all([
    supabase
      .from("categories")
      .select("name, sort_order")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true }),
    supabase.from("stores").select("id").eq("household_id", householdId),
    supabase.from("store_aisles").select("*").eq("household_id", householdId),
  ]);
  if (categoriesResult.error || storesResult.error || aislesResult.error) {
    throw new Error(
      categoriesResult.error?.message ??
        storesResult.error?.message ??
        aislesResult.error?.message ??
        "Could not sync store aisles",
    );
  }

  // First category with a given key wins; keys are unique by construction.
  const categories: (CategoryEntry & { key: string })[] = [];
  for (const [index, row] of (categoriesResult.data ?? []).entries()) {
    const typed = row as { name: string; sort_order: number };
    const key = categoryMatchKey(typed.name);
    if (!key || categories.some((entry) => entry.key === key)) continue;
    categories.push({
      key,
      name: typed.name,
      sort: typed.sort_order ?? index,
    });
  }
  categories.sort((a, b) => a.sort - b.sort);

  const stores = (storesResult.data ?? []) as { id: string }[];
  const allAisles = (aislesResult.data ?? []) as StoreAisleRow[];

  for (const store of stores) {
    const pool = allAisles
      .filter((aisle) => aisle.store_id === store.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    if (pool.length === 0) continue;

    const paired = new Map<string, StoreAisleRow>();
    // Exact-name matches first, so a rename can never collide with a row
    // that already holds the category's label.
    for (const category of categories) {
      const index = pool.findIndex(
        (aisle) => aisle.name.toLowerCase() === category.name.toLowerCase(),
      );
      if (index >= 0) paired.set(category.key, pool.splice(index, 1)[0]);
    }
    for (const category of categories) {
      if (paired.has(category.key)) continue;
      const index = pool.findIndex(
        (aisle) => categoryMatchKey(aisle.name) === category.key,
      );
      if (index >= 0) paired.set(category.key, pool.splice(index, 1)[0]);
    }

    const ordered = [
      ...categories.flatMap((category) => {
        const aisle = paired.get(category.key);
        return aisle ? [{ aisle, name: category.name }] : [];
      }),
      ...pool.map((aisle) => ({ aisle, name: aisle.name })),
    ];

    const updates = ordered.flatMap(({ aisle, name }, index) => {
      const patch: { name?: string; sort_order?: number } = {};
      if (aisle.name !== name) patch.name = name;
      if (aisle.sort_order !== index) patch.sort_order = index;
      return Object.keys(patch).length > 0 ? [{ id: aisle.id, patch }] : [];
    });
    if (updates.length === 0) continue;

    const results = await Promise.all(
      updates.map((update) =>
        supabase
          .from("store_aisles")
          .update(update.patch)
          .eq("id", update.id)
          .eq("household_id", householdId)
          .select("id"),
      ),
    );
    for (const result of results) {
      if (result.error) throw new Error(result.error.message);
    }
  }
}
