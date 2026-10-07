import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { planStoreAisles } from "@/lib/aisle-plan";
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

/**
 * Brings ONE store's aisle list in line with the household's seed-enabled
 * categories: renames paired aisles to the category's current label, heals
 * their category link, and rewrites the order so paired aisles follow the
 * category order while manual extras keep their relative order at the end.
 * Only writes rows that changed. Called by the explicit per-store reset —
 * nothing runs this automatically.
 */
export async function syncStoreAislesToCategories(
  supabase: SupabaseClient,
  householdId: string,
  storeId: string,
): Promise<void> {
  const [categoriesResult, aislesResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, sort_order")
      .eq("household_id", householdId)
      .eq("seed_stores", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("store_aisles")
      .select("*")
      .eq("household_id", householdId)
      .eq("store_id", storeId),
  ]);
  if (categoriesResult.error || aislesResult.error) {
    throw new Error(
      categoriesResult.error?.message ??
        aislesResult.error?.message ??
        "Could not sync store aisles",
    );
  }

  const categories = (categoriesResult.data ?? []) as {
    id: string;
    name: string;
    sort_order: number;
  }[];
  const aisles = (aislesResult.data ?? []) as StoreAisleRow[];
  const actualById = new Map(aisles.map((aisle) => [aisle.id, aisle]));

  const plan = planStoreAisles(categories, aisles);
  const updates = plan.flatMap((entry, index) => {
    const aisle = actualById.get(entry.id);
    if (!aisle) return [];
    const patch: { name?: string; sort_order?: number; category_id?: string } = {};
    if (aisle.name !== entry.name) patch.name = entry.name;
    if (aisle.sort_order !== index) patch.sort_order = index;
    if (entry.categoryId && aisle.category_id !== entry.categoryId) {
      patch.category_id = entry.categoryId;
    }
    return Object.keys(patch).length > 0 ? [{ id: aisle.id, patch }] : [];
  });
  if (updates.length === 0) return;

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

