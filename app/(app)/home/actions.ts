"use server";

import { revalidatePath } from "next/cache";
import { requireDal } from "@/lib/auth";
import {
  isDashboardWidgetId,
  normalizeDashboardOrder,
  type DashboardWidgetId,
} from "@/lib/dashboard-order";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NEW_TO_TRY_TAG = "new to try";

/**
 * Adds a named leftover to the household list. Names are free text; the only
 * guard against accidental double-submits is the widget's in-flight busy
 * flag — the same name can be saved intentionally (no unique constraint).
 */
export async function addLeftover(
  rawName: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const name = rawName.trim();
    if (!name) return { ok: false, error: "Leftover needs a name" };
    if (name.length > 160) return { ok: false, error: "Name is too long" };
    const { supabase, householdId } = await requireDal();

    const { data, error } = await supabase
      .from("leftovers")
      .insert({ household_id: householdId, name })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, error: "Couldn't save the leftover — try again." };
    }

    revalidatePath("/home");
    return { ok: true, data: { id: data.id as string } };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Couldn't save the leftover",
    };
  }
}

/** Case-insensitive exact-segment match for the "New to try" tag. */
function hasNewToTryTag(tags: string[]): boolean {
  return tags.some((tag) => tag.trim().toLowerCase() === NEW_TO_TRY_TAG);
}

/**
 * Adds an existing completed recipe to the manual "New to Try" collection.
 * Membership lives in `new_to_try` (not derived from tags) — the tag check
 * here only gates which candidates the picker may offer. Incomplete drafts
 * (no ingredients, or `no_cook` placeholders) are rejected server-side.
 * The PK on (household_id, recipe_id) makes double-adds idempotent.
 */
export async function addNewToTry(recipeId: string): Promise<ActionResult> {
  try {
    if (!UUID_RE.test(recipeId)) return { ok: false, error: "Invalid recipe" };
    const { supabase, householdId } = await requireDal();

    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .select("id, tags, recipe_type, recipe_ingredients(id)")
      .eq("household_id", householdId)
      .eq("id", recipeId)
      .maybeSingle();
    if (recipeError) {
      return { ok: false, error: recipeError.message };
    }
    if (!recipe) return { ok: false, error: "Recipe not found" };

    const typed = recipe as unknown as {
      tags: string[] | null;
      recipe_type: string | null;
      recipe_ingredients: { id: string }[] | null;
    };
    if (typed.recipe_type === "no_cook") {
      return {
        ok: false,
        error: "That recipe is a no-cook placeholder, not a completed recipe",
      };
    }
    if ((typed.recipe_ingredients ?? []).length === 0) {
      return {
        ok: false,
        error: "That recipe has no ingredients yet — add some before it can be tried",
      };
    }
    if (!hasNewToTryTag(typed.tags ?? [])) {
      return {
        ok: false,
        error: "That recipe needs the “New to try” tag before it can be added",
      };
    }

    const { error } = await supabase
      .from("new_to_try")
      .insert({ household_id: householdId, recipe_id: recipeId });
    // Duplicate (double tap / two devices) still counts as success.
    if (error && error.code !== "23505") {
      return { ok: false, error: "Couldn't add the recipe — try again." };
    }

    revalidatePath("/home");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Couldn't add the recipe",
    };
  }
}

/**
 * "Keep": the user decided the recipe belongs to the normal library.
 * Strips the `New to try` tag (exact-segment, case-insensitive; other tags
 * preserved) and removes collection membership. Recipe, ingredients,
 * instructions, and metadata are untouched. Meal-plan history unaffected.
 */
export async function keepNewToTry(recipeId: string): Promise<ActionResult> {
  try {
    if (!UUID_RE.test(recipeId)) return { ok: false, error: "Invalid recipe" };
    const { supabase, householdId } = await requireDal();

    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .select("id, name, tags")
      .eq("household_id", householdId)
      .eq("id", recipeId)
      .maybeSingle();
    if (recipeError) {
      return { ok: false, error: recipeError.message };
    }
    if (!recipe) return { ok: false, error: "Recipe not found" };

    const typed = recipe as unknown as { name: string; tags: string[] | null };
    const nextTags = (typed.tags ?? []).filter(
      (tag) => tag.trim().toLowerCase() !== NEW_TO_TRY_TAG,
    );
    const { error: updateError } = await supabase
      .from("recipes")
      .update({ tags: nextTags })
      .eq("household_id", householdId)
      .eq("id", recipeId);
    if (updateError) {
      return { ok: false, error: updateError.message };
    }

    const { error: deleteError } = await supabase
      .from("new_to_try")
      .delete()
      .eq("household_id", householdId)
      .eq("recipe_id", recipeId);
    if (deleteError) {
      return { ok: false, error: deleteError.message };
    }

    revalidatePath("/home");
    revalidatePath("/recipes");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Couldn't keep the recipe",
    };
  }
}

/**
 * Permanently deletes one leftover row — no archive, no undo. Household
 * scoping on top of RLS ensures only the caller's own record is removed;
 * a row already gone (double tap, another device) still counts as success.
 */
export async function deleteLeftover(id: string): Promise<ActionResult> {
  try {
    if (!UUID_RE.test(id)) return { ok: false, error: "Invalid leftover" };
    const { supabase, householdId } = await requireDal();

    const { error } = await supabase
      .from("leftovers")
      .delete()
      .eq("id", id)
      .eq("household_id", householdId);
    if (error) {
      return { ok: false, error: "Couldn't remove the leftover — try again." };
    }

    revalidatePath("/home");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Couldn't remove the leftover",
    };
  }
}

/**
 * Saves the household-level Home dashboard widget order (stable IDs only).
 * Sizes/spans are hardcoded per widget client-side, never persisted here.
 * Unknown IDs are rejected; duplicates are dropped.
 */
export async function saveDashboardWidgetOrder(
  rawOrder: unknown,
): Promise<ActionResult<{ order: DashboardWidgetId[] }>> {
  try {
    if (!Array.isArray(rawOrder)) {
      return { ok: false, error: "Invalid dashboard layout" };
    }
    if (rawOrder.some((id) => !isDashboardWidgetId(id))) {
      return { ok: false, error: "Invalid dashboard layout" };
    }
    const order = normalizeDashboardOrder(rawOrder);
    if (order.length === 0) {
      return { ok: false, error: "Invalid dashboard layout" };
    }
    const { supabase, householdId } = await requireDal();

    const { error } = await supabase
      .from("household_settings")
      .upsert(
        { household_id: householdId, dashboard_widget_order: order },
        { onConflict: "household_id" },
      );
    if (error) {
      return { ok: false, error: "Couldn't save your layout — try again." };
    }

    revalidatePath("/home");
    return { ok: true, data: { order } };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Couldn't save your layout",
    };
  }
}

/**
 * Saves the household-level Home Snacks selection (catalog item IDs).
 * Only IDs that are currently snack items in this household's inventory are
 * kept; duplicates dropped, stale/consumed IDs pruned. Empty array clears.
 * The column intentionally has no FK so removed inventory can't break it.
 */
export async function saveHomeSnacks(
  rawItemIds: unknown,
): Promise<ActionResult<{ itemIds: string[] }>> {
  try {
    if (!Array.isArray(rawItemIds)) {
      return { ok: false, error: "Invalid snack selection" };
    }
    if (rawItemIds.some((id) => typeof id !== "string" || !UUID_RE.test(id))) {
      return { ok: false, error: "Invalid snack selection" };
    }
    const requested = [...new Set(rawItemIds as string[])];
    const { supabase, householdId } = await requireDal();

    let valid = new Set<string>();
    if (requested.length > 0) {
      const [{ data: itemsData }, { data: subsData }, { data: invData }] =
        await Promise.all([
          supabase
            .from("items")
            .select("id, subcategory_id")
            .eq("household_id", householdId)
            .in("id", requested),
          supabase
            .from("subcategories")
            .select("id, name")
            .eq("household_id", householdId),
          supabase
            .from("inventory")
            .select("item_id")
            .eq("household_id", householdId)
            .gt("quantity", 0)
            .in("item_id", requested),
        ]);
      const snackSubcategoryIds = new Set(
        (((subsData ?? []) as { id: string; name: string }[]).filter(
          (sub) => sub.name.toLowerCase().includes("snack"),
        ).map((sub) => sub.id)),
      );
      const inInventory = new Set(
        ((invData ?? []) as { item_id: string }[]).map((row) => row.item_id),
      );
      valid = new Set(
        ((itemsData ?? []) as { id: string; subcategory_id: string | null }[])
          .filter(
            (item) =>
              item.subcategory_id &&
              snackSubcategoryIds.has(item.subcategory_id) &&
              inInventory.has(item.id),
          )
          .map((item) => item.id),
      );
    }
    const itemIds = requested.filter((id) => valid.has(id));

    const { error } = await supabase
      .from("household_settings")
      .upsert(
        { household_id: householdId, home_snack_item_ids: itemIds },
        { onConflict: "household_id" },
      );
    if (error) {
      return { ok: false, error: "Couldn't save your snacks — try again." };
    }

    revalidatePath("/home");
    return { ok: true, data: { itemIds } };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Couldn't save your snacks",
    };
  }
}
