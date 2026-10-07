"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDal } from "@/lib/auth";
import { categoryMatchKey } from "@/lib/kitchenowl";
import { syncStoreAislesToCategories } from "@/lib/grocery";
import type {
  GroceryViewMode,
  StoreAisleRow,
  StoreRow,
} from "@/lib/types";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const uuid = z.string().uuid();

/* ------------------------------------------------------------------ */
/* Grocery items                                                       */
/* ------------------------------------------------------------------ */

const addSchema = z.object({
  name: z.string().trim().min(1).max(160),
  itemId: uuid.nullish(),
  categoryId: uuid.nullish(),
  quantity: z.number().min(0).max(9999).default(1),
  unit: z.string().trim().max(32).nullish(),
  source: z
    .enum(["manual", "low_stock", "consume", "recipe", "planner"])
    .default("manual"),
});

export type AddGroceryInput = z.input<typeof addSchema>;

export async function addGroceryItem(
  rawInput: AddGroceryInput,
): Promise<ActionResult<{ id: string; created: boolean }>> {
  try {
    const parsed = addSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
    }
    const input = parsed.data;
    const { supabase, householdId, user } = await requireDal();

    const lookup = supabase
      .from("grocery_items")
      .select("id")
      .eq("household_id", householdId)
      .eq("checked", false);

    const { data: existingRows } = await (
      input.itemId ? lookup.eq("item_id", input.itemId) : lookup.eq("name", input.name)
    ).limit(1);

    const existing = (existingRows ?? [])[0] as { id: string } | undefined;
    if (existing) {
      revalidatePath("/grocery");
      return { ok: true, data: { id: existing.id, created: false } };
    }

    const { data, error } = await supabase
      .from("grocery_items")
      .insert({
        household_id: householdId,
        item_id: input.itemId ?? null,
        name: input.name,
        quantity: input.quantity,
        unit: input.unit ?? null,
        category_id: input.categoryId ?? null,
        source: input.source,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not add item" };
    }

    revalidatePath("/grocery");
    return { ok: true, data: { id: (data as { id: string }).id, created: true } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not add item",
    };
  }
}

const updateSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(160).optional(),
  quantity: z.number().min(0).max(9999).optional(),
  unit: z.string().trim().max(32).nullish(),
  categoryId: uuid.nullish(),
  checked: z.boolean().optional(),
});

export type UpdateGroceryInput = z.input<typeof updateSchema>;

export async function updateGroceryItem(
  rawInput: UpdateGroceryInput,
): Promise<ActionResult> {
  try {
    const parsed = updateSchema.safeParse(rawInput);
    if (!parsed.success) return { ok: false, error: "Invalid input" };
    const input = parsed.data;
    const { supabase, householdId } = await requireDal();

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.quantity !== undefined) patch.quantity = input.quantity;
    if (input.unit !== undefined) patch.unit = input.unit;
    if (input.categoryId !== undefined) patch.category_id = input.categoryId;
    if (input.checked !== undefined) patch.checked = input.checked;

    if (Object.keys(patch).length === 0) return { ok: true, data: null };

    const { error } = await supabase
      .from("grocery_items")
      .update(patch)
      .eq("id", input.id)
      .eq("household_id", householdId);

    if (error) return { ok: false, error: error.message };
    revalidatePath("/grocery");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Update failed",
    };
  }
}

export async function deleteGroceryItem(id: string): Promise<ActionResult> {
  try {
    const { supabase, householdId } = await requireDal();
    const { error } = await supabase
      .from("grocery_items")
      .delete()
      .eq("id", id)
      .eq("household_id", householdId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/grocery");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Delete failed",
    };
  }
}

export async function clearCheckedGrocery(): Promise<ActionResult> {
  try {
    const { supabase, householdId } = await requireDal();
    const { error } = await supabase
      .from("grocery_items")
      .delete()
      .eq("household_id", householdId)
      .eq("checked", true);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/grocery");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not clear items",
    };
  }
}

const restoreSchema = z
  .array(
    z.object({
      id: uuid,
      item_id: uuid.nullish(),
      name: z.string().trim().min(1).max(160),
      quantity: z.number().min(0).max(9999),
      unit: z.string().trim().max(32).nullish(),
      category_id: uuid.nullish(),
      source: z.enum(["manual", "low_stock", "consume", "recipe", "planner"]),
    }),
  )
  .max(200);

export type RestoreGroceryInput = z.input<typeof restoreSchema>;

/** Re-inserts rows deleted by clearCheckedGrocery so a clear can be undone. */
export async function restoreGroceryItems(
  items: RestoreGroceryInput,
): Promise<ActionResult<{ restored: number }>> {
  try {
    const parsed = restoreSchema.safeParse(items);
    if (!parsed.success) return { ok: false, error: "Invalid input" };
    if (parsed.data.length === 0) return { ok: true, data: { restored: 0 } };
    const { supabase, householdId, user } = await requireDal();

    const { error } = await supabase.from("grocery_items").insert(
      parsed.data.map((item) => ({
        id: item.id,
        household_id: householdId,
        item_id: item.item_id ?? null,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit ?? null,
        category_id: item.category_id ?? null,
        checked: true,
        source: item.source,
        created_by: user.id,
      })),
    );
    if (error) return { ok: false, error: error.message };
    revalidatePath("/grocery");
    return { ok: true, data: { restored: parsed.data.length } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not restore items",
    };
  }
}

export async function addManyGroceryItems(
  inputs: AddGroceryInput[],
): Promise<ActionResult<{ added: number; skipped: number }>> {
  try {
    const parsed = z.array(addSchema).safeParse(inputs);
    if (!parsed.success) return { ok: false, error: "Invalid input" };

    let added = 0;
    let skipped = 0;
    for (const input of parsed.data) {
      const result = await addGroceryItem(input);
      if (!result.ok) return result;
      if (result.data.created) added += 1;
      else skipped += 1;
    }
    return { ok: true, data: { added, skipped } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not add items",
    };
  }
}

/* ------------------------------------------------------------------ */
/* Aisle assignment                                                    */
/* ------------------------------------------------------------------ */

export async function assignAisle(
  groceryItemId: string,
  storeId: string,
  aisleId: string | null,
): Promise<ActionResult> {
  try {
    const { supabase, householdId } = await requireDal();

    if (aisleId === null) {
      const { error } = await supabase
        .from("grocery_item_aisles")
        .delete()
        .eq("grocery_item_id", groceryItemId)
        .eq("store_id", storeId);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase.from("grocery_item_aisles").upsert(
        {
          household_id: householdId,
          grocery_item_id: groceryItemId,
          store_id: storeId,
          aisle_id: aisleId,
        },
        { onConflict: "grocery_item_id,store_id" },
      );
      if (error) return { ok: false, error: error.message };
    }

    revalidatePath("/grocery");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not assign aisle",
    };
  }
}

/**
 * Durable per-store aisle memory on the catalog item: bread can sit in
 * Aisle 10 at one store and somewhere else at another, across trips.
 */
export async function setItemStoreAisle(
  itemId: string,
  storeId: string,
  aisleId: string | null,
): Promise<ActionResult> {
  try {
    const { supabase, householdId } = await requireDal();

    if (aisleId === null) {
      const { error } = await supabase
        .from("item_store_aisles")
        .delete()
        .eq("household_id", householdId)
        .eq("item_id", itemId)
        .eq("store_id", storeId);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase.from("item_store_aisles").upsert(
        {
          household_id: householdId,
          item_id: itemId,
          store_id: storeId,
          aisle_id: aisleId,
        },
        { onConflict: "item_id,store_id" },
      );
      if (error) return { ok: false, error: error.message };
    }

    revalidatePath("/grocery");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not save store aisle",
    };
  }
}

/**
 * Seeds ONE store's aisle list from the household categories: creates the
 * aisles it's missing (seed-enabled categories only) and links rows to
 * their category via category_id so later renames never duplicate. Never
 * renames or reorders what the store already has — after seeding, the
 * store owns its list. Other stores are never touched.
 */
export async function adoptCategoryAisles(
  storeId: string,
): Promise<ActionResult<{ created: number }>> {
  try {
    const { supabase, householdId } = await requireDal();

    const [categoriesResult, storeResult, aislesResult] = await Promise.all([
      supabase
        .from("categories")
        .select("id, name, sort_order")
        .eq("household_id", householdId)
        .eq("seed_stores", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("stores")
        .select("id")
        .eq("household_id", householdId)
        .eq("id", storeId)
        .maybeSingle(),
      supabase
        .from("store_aisles")
        .select("*")
        .eq("household_id", householdId)
        .eq("store_id", storeId),
    ]);
    if (categoriesResult.error) {
      return { ok: false, error: categoriesResult.error.message };
    }
    if (aislesResult.error) {
      return { ok: false, error: aislesResult.error.message };
    }
    if (!storeResult.data) return { ok: false, error: "Store not found" };

    const existing = (aislesResult.data ?? []) as StoreAisleRow[];
    const linkedCategoryIds = new Set(
      existing
        .map((aisle) => aisle.category_id)
        .filter((id): id is string => id !== null),
    );
    const unlinkedByKey = new Map<string, StoreAisleRow>();
    for (const aisle of existing) {
      if (aisle.category_id) continue;
      const key = categoryMatchKey(aisle.name);
      if (key && !unlinkedByKey.has(key)) unlinkedByKey.set(key, aisle);
    }

    let nextSort =
      existing.reduce((max, aisle) => Math.max(max, aisle.sort_order), -1) + 1;
    const links: { id: string; categoryId: string }[] = [];
    const pending: {
      household_id: string;
      store_id: string;
      name: string;
      sort_order: number;
      category_id: string;
    }[] = [];

    for (const row of (categoriesResult.data ?? []) as {
      id: string;
      name: string;
      sort_order: number;
    }[]) {
      if (linkedCategoryIds.has(row.id)) continue;
      const key = categoryMatchKey(row.name);
      const match = key ? unlinkedByKey.get(key) : undefined;
      if (match) {
        links.push({ id: match.id, categoryId: row.id });
        unlinkedByKey.delete(key!);
        linkedCategoryIds.add(row.id);
        continue;
      }
      pending.push({
        household_id: householdId,
        store_id: storeId,
        name: row.name,
        sort_order: nextSort++,
        category_id: row.id,
      });
    }

    for (const link of links) {
      const { error } = await supabase
        .from("store_aisles")
        .update({ category_id: link.categoryId })
        .eq("id", link.id)
        .eq("household_id", householdId);
      if (error) return { ok: false, error: error.message };
    }
    if (pending.length > 0) {
      const { error } = await supabase.from("store_aisles").insert(pending);
      if (error) return { ok: false, error: error.message };
    }

    revalidatePath("/grocery");
    revalidatePath("/grocery/stores");
    return { ok: true, data: { created: pending.length } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not add aisles",
    };
  }
}

/**
 * Explicitly overwrites ONE store's aisle list with the seed-enabled
 * categories: paired rows take the category's label and order, manual
 * extras stay at the end. The destructive counterpart to the seed button.
 */
export async function resetStoreFromCategories(
  storeId: string,
): Promise<ActionResult> {
  try {
    const { supabase, householdId } = await requireDal();
    const { data: store, error } = await supabase
      .from("stores")
      .select("id")
      .eq("household_id", householdId)
      .eq("id", storeId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!store) return { ok: false, error: "Store not found" };

    await syncStoreAislesToCategories(supabase, householdId, storeId);

    revalidatePath("/grocery");
    revalidatePath("/grocery/stores");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not reset store aisles",
    };
  }
}

/* ------------------------------------------------------------------ */
/* Settings (selected store + view mode)                               */
/* ------------------------------------------------------------------ */

export async function setGrocerySettings(input: {
  selectedStoreId?: string | null;
  groceryViewMode?: GroceryViewMode;
}): Promise<ActionResult> {
  try {
    const { supabase, householdId } = await requireDal();
    const patch: Record<string, unknown> = {};
    if (input.selectedStoreId !== undefined) {
      patch.selected_store_id = input.selectedStoreId;
    }
    if (input.groceryViewMode !== undefined) {
      patch.grocery_view_mode = input.groceryViewMode;
    }
    if (Object.keys(patch).length === 0) return { ok: true, data: null };

    const { error } = await supabase
      .from("household_settings")
      .update(patch)
      .eq("household_id", householdId);

    if (error) return { ok: false, error: error.message };
    revalidatePath("/grocery");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save settings",
    };
  }
}

/* ------------------------------------------------------------------ */
/* Stores & aisles                                                     */
/* ------------------------------------------------------------------ */

export async function createStore(
  name: string,
): Promise<ActionResult<{ store: StoreRow }>> {
  try {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: "Store needs a name" };
    const { supabase, householdId } = await requireDal();

    const { data: existing } = await supabase
      .from("stores")
      .select("id")
      .eq("household_id", householdId)
      .ilike("name", trimmed)
      .limit(1);
    if ((existing ?? []).length > 0) {
      return { ok: false, error: "A store with that name already exists" };
    }

    const { data, error } = await supabase
      .from("stores")
      .insert({ household_id: householdId, name: trimmed })
      .select("*")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not create store" };
    }

    revalidatePath("/grocery");
    return { ok: true, data: { store: data as StoreRow } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not create store",
    };
  }
}

export async function updateStore(
  id: string,
  patch: { name?: string; sortOrder?: number },
): Promise<ActionResult> {
  try {
    const { supabase, householdId } = await requireDal();
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name.trim();
    if (patch.sortOrder !== undefined) body.sort_order = patch.sortOrder;
    const { error } = await supabase
      .from("stores")
      .update(body)
      .eq("id", id)
      .eq("household_id", householdId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/grocery");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Update failed",
    };
  }
}

export async function deleteStore(id: string): Promise<ActionResult> {
  try {
    const { supabase, householdId } = await requireDal();
    const { error } = await supabase
      .from("stores")
      .delete()
      .eq("id", id)
      .eq("household_id", householdId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/grocery");
    revalidatePath("/settings");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Delete failed",
    };
  }
}

export async function createAisle(
  storeId: string,
  name: string,
): Promise<ActionResult<{ aisle: StoreAisleRow }>> {
  try {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: "Aisle needs a name" };
    const { supabase, householdId } = await requireDal();

    const { data: last } = await supabase
      .from("store_aisles")
      .select("sort_order")
      .eq("store_id", storeId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const sortOrder = ((last as { sort_order: number } | null)?.sort_order ?? -1) + 1;

    const { data, error } = await supabase
      .from("store_aisles")
      .insert({
        household_id: householdId,
        store_id: storeId,
        name: trimmed,
        sort_order: sortOrder,
      })
      .select("*")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not create aisle" };
    }
    revalidatePath("/grocery");
    return { ok: true, data: { aisle: data as StoreAisleRow } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not create aisle",
    };
  }
}

export async function updateAisle(
  id: string,
  patch: { name?: string },
): Promise<ActionResult> {
  try {
    const { supabase, householdId } = await requireDal();
    const { error } = await supabase
      .from("store_aisles")
      .update({ name: (patch.name ?? "").trim() })
      .eq("id", id)
      .eq("household_id", householdId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/grocery");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Update failed",
    };
  }
}

export async function deleteAisle(id: string): Promise<ActionResult> {
  try {
    const { supabase, householdId } = await requireDal();
    const { error } = await supabase
      .from("store_aisles")
      .delete()
      .eq("id", id)
      .eq("household_id", householdId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/grocery");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Delete failed",
    };
  }
}

export async function moveAisle(
  id: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  try {
    const { supabase, householdId } = await requireDal();

    const { data: current } = await supabase
      .from("store_aisles")
      .select("*")
      .eq("id", id)
      .eq("household_id", householdId)
      .maybeSingle();

    const aisle = current as StoreAisleRow | null;
    if (!aisle) return { ok: false, error: "Aisle not found" };

    const { data: siblings } = await supabase
      .from("store_aisles")
      .select("*")
      .eq("store_id", aisle.store_id)
      .order("sort_order", { ascending: true });

    const list = ((siblings ?? []) as StoreAisleRow[]).sort(
      (a, b) => a.sort_order - b.sort_order,
    );
    const index = list.findIndex((entry) => entry.id === id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= list.length) {
      return { ok: true, data: null };
    }

    const other = list[swapWith];
    await supabase
      .from("store_aisles")
      .update({ sort_order: other.sort_order })
      .eq("id", aisle.id);
    await supabase
      .from("store_aisles")
      .update({ sort_order: aisle.sort_order })
      .eq("id", other.id);

    revalidatePath("/grocery");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not reorder",
    };
  }
}

/**
 * Drag-and-drop save: sets sort_order from the given id order. Fails if
 * the ids don't exactly cover this store's aisles.
 */
export async function reorderStoreAisles(
  storeId: string,
  ids: string[],
): Promise<ActionResult> {
  try {
    const { supabase, householdId } = await requireDal();
    const { data, error } = await supabase
      .from("store_aisles")
      .select("id")
      .eq("household_id", householdId)
      .eq("store_id", storeId);
    if (error) return { ok: false, error: error.message };

    const valid = new Set(
      ((data ?? []) as { id: string }[]).map((aisle) => aisle.id),
    );
    const ordered = ids.filter((id) => valid.has(id));
    if (ordered.length !== valid.size) {
      return { ok: false, error: "That order doesn't match this store's aisles" };
    }

    const results = await Promise.all(
      ordered.map((id, index) =>
        supabase
          .from("store_aisles")
          .update({ sort_order: index })
          .eq("id", id)
          .eq("household_id", householdId)
          .select("id"),
      ),
    );
    for (const result of results) {
      if (result.error) return { ok: false, error: result.error.message };
    }

    revalidatePath("/grocery");
    revalidatePath("/grocery/stores");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not reorder",
    };
  }
}
