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
 * Where new grocery lines land: the first store in the household's list order
 * that is in view, else its first store. Items with no store show up in
 * "Any store", so a null return is fine.
 */
export async function primaryStoreId(
  supabase: SupabaseClient,
  householdId: string,
): Promise<string | null> {
  const [settingsResult, storesResult] = await Promise.all([
    supabase
      .from("household_settings")
      .select("selected_store_ids")
      .eq("household_id", householdId)
      .maybeSingle(),
    supabase
      .from("stores")
      .select("id")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  const ordered = (storesResult.data ?? []).map((row) => (row as { id: string }).id);
  if (ordered.length === 0) return null;

  const selected = new Set(
    ((settingsResult.data?.selected_store_ids ?? []) as unknown) as
      | string[]
      | null,
  );
  return ordered.find((id) => selected.has(id)) ?? ordered[0];
}

/** Files a freshly created grocery line under the default store. */
export async function fileGroceryItem(
  supabase: SupabaseClient,
  householdId: string,
  groceryItemId: string,
): Promise<void> {
  const storeId = await primaryStoreId(supabase, householdId);
  if (!storeId) return;
  await supabase.from("grocery_item_stores").insert({
    household_id: householdId,
    grocery_item_id: groceryItemId,
    store_id: storeId,
  });
}

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

  const id = (inserted as { id: string }).id;
  await fileGroceryItem(supabase, householdId, id);
  return { created: true, id };
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

