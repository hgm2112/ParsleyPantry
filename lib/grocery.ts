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
 * Resolves a free-text grocery add to a catalog item, creating one when the
 * name is new. This is what makes the type-ahead remember items added via
 * "[+ Add] → Manual": without a catalog row they leave no trace once the
 * shopping line is cleared. Mirrors the pantry add form's find-or-create.
 */
export async function findOrCreateCatalogItem(
  supabase: SupabaseClient,
  householdId: string,
  input: {
    name: string;
    categoryId?: string | null;
    unit?: string | null;
    createdBy?: string | null;
  },
): Promise<{ id: string; category_id: string | null; unit: string | null } | null> {
  const name = input.name.trim();
  if (!name) return null;

  const { data: found } = await supabase
    .from("items")
    .select("id, category_id, unit")
    .eq("household_id", householdId)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (found) return found as { id: string; category_id: string | null; unit: string | null };

  const { data: inserted, error } = await supabase
    .from("items")
    .insert({
      household_id: householdId,
      name,
      category_id: input.categoryId ?? null,
      unit: input.unit ?? null,
      default_location: "pantry",
      created_by: input.createdBy ?? null,
    })
    .select("id, category_id, unit")
    .single();

  if (error || !inserted) {
    // A concurrent insert may have won the unique-name race; reuse it.
    const { data: again } = await supabase
      .from("items")
      .select("id, category_id, unit")
      .eq("household_id", householdId)
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    return (again as { id: string; category_id: string | null; unit: string | null }) ?? null;
  }
  return inserted as { id: string; category_id: string | null; unit: string | null };
}

/** Records that an item was added to the list — feeds type-ahead ranking. */
export async function bumpGroceryAddMemory(
  supabase: SupabaseClient,
  householdId: string,
  itemId: string | null,
): Promise<void> {
  if (!itemId) return;
  const { data } = await supabase
    .from("items")
    .select("grocery_add_count")
    .eq("household_id", householdId)
    .eq("id", itemId)
    .maybeSingle();
  const next = ((data?.grocery_add_count as number | null) ?? 0) + 1;
  await supabase
    .from("items")
    .update({
      grocery_add_count: next,
      grocery_last_added_at: new Date().toISOString(),
    })
    .eq("household_id", householdId)
    .eq("id", itemId);
}

/** Durable store memory for a catalog item — seeds where re-adds are filed. */
export async function rememberItemStores(
  supabase: SupabaseClient,
  householdId: string,
  itemId: string,
  storeIds: string[],
): Promise<void> {
  const wanted = [...new Set(storeIds)];
  await supabase
    .from("item_stores")
    .delete()
    .eq("household_id", householdId)
    .eq("item_id", itemId);
  if (wanted.length === 0) return;
  await supabase.from("item_stores").insert(
    wanted.map((storeId) => ({
      household_id: householdId,
      item_id: itemId,
      store_id: storeId,
    })),
  );
}

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

/**
 * Files a freshly created grocery line. When the line has a catalog item with
 * remembered stores, it lands there (that's where you buy it); otherwise it
 * goes under the default store. Items with no store show up in "Any store".
 */
export async function fileGroceryItem(
  supabase: SupabaseClient,
  householdId: string,
  groceryItemId: string,
  itemId?: string | null,
): Promise<void> {
  if (itemId) {
    const { data: remembered } = await supabase
      .from("item_stores")
      .select("store_id")
      .eq("household_id", householdId)
      .eq("item_id", itemId);
    const rememberedIds = (remembered ?? []).map(
      (row) => (row as { store_id: string }).store_id,
    );
    if (rememberedIds.length > 0) {
      await supabase.from("grocery_item_stores").insert(
        rememberedIds.map((storeId) => ({
          household_id: householdId,
          grocery_item_id: groceryItemId,
          store_id: storeId,
        })),
      );
      return;
    }
  }
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
  // Free-text paths (if any) should also resolve to catalog for memory.
  let itemId = input.itemId ?? null;
  let categoryId = input.categoryId ?? null;
  let unit = input.unit ?? null;
  if (!itemId) {
    const catalogItem = await findOrCreateCatalogItem(supabase, householdId, {
      name: input.name,
      categoryId,
      unit,
    });
    if (catalogItem) {
      itemId = catalogItem.id;
      if (!categoryId) categoryId = catalogItem.category_id;
      if (!unit) unit = catalogItem.unit;
    }
  }

  const base = supabase
    .from("grocery_items")
    .select("id")
    .eq("household_id", householdId)
    .eq("checked", false);

  const { data: existingRows } = await (
    itemId ? base.eq("item_id", itemId) : base.eq("name", input.name)
  ).limit(1);

  const existing = (existingRows ?? [])[0] as { id: string } | undefined;
  if (existing) return { created: false, id: existing.id };

  const { data: inserted, error } = await supabase
    .from("grocery_items")
    .insert({
      household_id: householdId,
      item_id: itemId,
      name: input.name,
      quantity: input.quantity ?? 1,
      unit,
      category_id: categoryId,
      source: input.source,
    })
    .select("id")
    .single();

  if (error || !inserted) return { created: false, id: null };

  const id = (inserted as { id: string }).id;
  await bumpGroceryAddMemory(supabase, householdId, itemId);
  await fileGroceryItem(supabase, householdId, id, itemId);
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

