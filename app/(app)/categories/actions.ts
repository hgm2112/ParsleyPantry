"use server";

import { revalidatePath } from "next/cache";
import { requireDal } from "@/lib/auth";
import type { CategoryRow } from "@/lib/types";

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
        seed_stores: false,
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
 * Renames the category. Store aisle lists are never touched — each store
 * owns its own labels (seed/reset happen explicitly from the store).
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
 * Toggles whether this category seeds store aisle lists. Seed, reset, and
 * the grocery "needs an aisle" rescue only consider seed-enabled rows.
 */
export async function setCategorySeedStores(
  id: string,
  seedStores: boolean,
): Promise<ActionResult> {
  try {
    const { supabase, householdId } = await requireDal();
    const { error } = await supabase
      .from("categories")
      .update({ seed_stores: seedStores })
      .eq("id", id)
      .eq("household_id", householdId);
    if (error) return { ok: false, error: friendly(error) };

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

    revalidatePath("/", "layout");
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
 * the ids don't exactly cover the household's categories.
 */
export async function reorderCategories(ids: string[]): Promise<ActionResult> {
  try {
    const { supabase, householdId } = await requireDal();

    const { data, error } = await supabase
      .from("categories")
      .select("id")
      .eq("household_id", householdId);
    if (error) return { ok: false, error: error.message };

    const valid = new Set(
      ((data ?? []) as { id: string }[]).map((category) => category.id),
    );
    const ordered = ids.filter((id) => valid.has(id));
    if (ordered.length !== valid.size) {
      return { ok: false, error: "That order doesn't match your categories" };
    }

    const results = await Promise.all(
      ordered.map((id, index) =>
        supabase
          .from("categories")
          .update({ sort_order: index })
          .eq("id", id)
          .eq("household_id", householdId)
          .select("id"),
      ),
    );
    for (const result of results) {
      if (result.error) return { ok: false, error: result.error.message };
    }

    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not reorder",
    };
  }
}
