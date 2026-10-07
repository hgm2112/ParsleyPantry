"use server";

import { revalidatePath } from "next/cache";
import { requireDal } from "@/lib/auth";
import { categoryMatchKey } from "@/lib/kitchenowl";
import { syncStoreAislesToCategories } from "@/lib/grocery";
import type { CategoryRow, StoreAisleRow } from "@/lib/types";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function friendly(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "You already have a category with that name";
  return error.message;
}

export async function createCategory(
  name: string,
): Promise<ActionResult<{ category: CategoryRow }>> {
  try {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: "Category needs a name" };
    const { supabase, householdId } = await requireDal();

    const { data: last } = await supabase
      .from("categories")
      .select("sort_order")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sortOrder =
      ((last as { sort_order: number } | null)?.sort_order ?? -1) + 1;

    const { data, error } = await supabase
      .from("categories")
      .insert({
        household_id: householdId,
        name: trimmed,
        icon: null,
        sort_order: sortOrder,
      })
      .select("*")
      .single();
    if (error || !data) {
      return {
        ok: false,
        error: error ? friendly(error) : "Could not create category",
      };
    }

    revalidatePath("/", "layout");
    return { ok: true, data: { category: data as CategoryRow } };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not create category",
    };
  }
}

/**
 * Renames the category, follows it into every store's aisle list (key-safe:
 * aisles still under the old label are updated before the sync), then
 * re-propagates labels and order.
 */
export async function updateCategory(
  id: string,
  patch: { name?: string },
): Promise<ActionResult> {
  try {
    const trimmed = (patch.name ?? "").trim();
    if (!trimmed) return { ok: false, error: "Category needs a name" };
    const { supabase, householdId } = await requireDal();

    const { data: current } = await supabase
      .from("categories")
      .select("*")
      .eq("id", id)
      .eq("household_id", householdId)
      .maybeSingle();
    const category = current as CategoryRow | null;
    if (!category) return { ok: false, error: "Category not found" };
    if (category.name === trimmed) return { ok: true, data: null };

    const { error: updateError } = await supabase
      .from("categories")
      .update({ name: trimmed })
      .eq("id", id)
      .eq("household_id", householdId);
    if (updateError) return { ok: false, error: friendly(updateError) };

    // If the rename changed the match key, find the aisles still carrying
    // the old label and rename them here — the sync below pairs by the new
    // key and could no longer see them. One per store (prefer the exact
    // old name); the sync catches the rest.
    const oldKey = categoryMatchKey(category.name);
    const newKey = categoryMatchKey(trimmed);
    if (oldKey && newKey && oldKey !== newKey) {
      const { data: aisles, error: aislesError } = await supabase
        .from("store_aisles")
        .select("*")
        .eq("household_id", householdId);
      if (aislesError) return { ok: false, error: aislesError.message };

      const byStore = new Map<string, StoreAisleRow[]>();
      for (const aisle of (aisles ?? []) as StoreAisleRow[]) {
        const list = byStore.get(aisle.store_id) ?? [];
        list.push(aisle);
        byStore.set(aisle.store_id, list);
      }
      const renames: { id: string; name: string }[] = [];
      for (const list of byStore.values()) {
        const exact = list.find(
          (aisle) => aisle.name.toLowerCase() === category.name.toLowerCase(),
        );
        const match =
          exact ??
          list.find((aisle) => categoryMatchKey(aisle.name) === oldKey);
        if (match) renames.push({ id: match.id, name: trimmed });
      }
      const renameResults = await Promise.all(
        renames.map((rename) =>
          supabase
            .from("store_aisles")
            .update({ name: rename.name })
            .eq("id", rename.id)
            .eq("household_id", householdId)
            .select("id"),
        ),
      );
      for (const result of renameResults) {
        if (result.error) return { ok: false, error: friendly(result.error) };
      }
    }

    await syncStoreAislesToCategories(supabase, householdId);

    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Update failed",
    };
  }
}

/**
 * Removes the category. Items keep existing without a category (FK set
 * null) and store aisles are left alone — they become manual aisles until
 * something pairs them again.
 */
export async function deleteCategory(id: string): Promise<ActionResult> {
  try {
    const { supabase, householdId } = await requireDal();
    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", id)
      .eq("household_id", householdId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Delete failed",
    };
  }
}

export async function moveCategory(
  id: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  try {
    const { supabase, householdId } = await requireDal();

    const { data: siblings } = await supabase
      .from("categories")
      .select("*")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true });
    const list = ((siblings ?? []) as CategoryRow[]).sort(
      (a, b) => a.sort_order - b.sort_order,
    );
    const index = list.findIndex((entry) => entry.id === id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= list.length) {
      return { ok: true, data: null };
    }

    const current = list[index];
    const other = list[swapWith];
    const updates = [
      supabase
        .from("categories")
        .update({ sort_order: other.sort_order })
        .eq("id", current.id)
        .eq("household_id", householdId),
      supabase
        .from("categories")
        .update({ sort_order: current.sort_order })
        .eq("id", other.id)
        .eq("household_id", householdId),
    ];
    for (const result of await Promise.all(updates)) {
      if (result.error) return { ok: false, error: result.error.message };
    }

    // Aisle groups follow the new category order in every store.
    await syncStoreAislesToCategories(supabase, householdId);

    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not reorder",
    };
  }
}
