"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDal } from "@/lib/auth";
import { addManyGroceryItems } from "@/app/(app)/grocery/actions";
import { createRootLookup } from "@/lib/canonical";
import { fefoSort, toBatchSnapshot, type BatchSnapshot } from "@/lib/batches";
import {
  addNeed,
  buildPantryPools,
  emptyDemand,
  emptyPool,
  needFromParts,
  pantryNeed,
  type PantryDemand,
  type PantryPool,
} from "@/lib/meal-summary";
import {
  fromOunces,
  parseQuantityText,
  splitNameAndQuantity,
  toImperialText,
  toOunces,
} from "@/lib/stock";
import type { InventoryRow } from "@/lib/types";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const ingredientSchema = z.object({
  name: z.string().trim().min(1).max(160),
  quantity_text: z.string().max(120).default(""),
  optional: z.boolean().default(false),
  on_shopping_list: z.boolean().default(true),
});

const recipeTypeSchema = z.enum(["cooking", "no_cook"]).default("cooking");

const recipeFormSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().max(4000).default(""),
  prep_time: z.number().int().min(0).max(1440).default(0),
  cook_time: z.number().int().min(0).max(1440).default(0),
  yields: z.number().int().min(1).max(999).default(1),
  source: z.string().trim().max(200).nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  recipe_type: recipeTypeSchema,
  ingredients: z.array(ingredientSchema).max(100).default([]),
});

export type RecipeFormInput = z.input<typeof recipeFormSchema>;

async function linkIngredientItems(
  supabase: Awaited<ReturnType<typeof requireDal>>["supabase"],
  householdId: string,
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("items")
    .select("id, name, canonical_item_id")
    .eq("household_id", householdId);

  const rows = (data ?? []) as {
    id: string;
    name: string;
    canonical_item_id: string | null;
  }[];
  const rootOf = createRootLookup(rows);
  const byName = new Map<string, string>();
  for (const row of rows) {
    byName.set(row.name.toLowerCase(), rootOf(row.id));
  }
  return byName;
}

export async function createRecipe(
  input: RecipeFormInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = recipeFormSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Check the recipe fields" };
    const { supabase, householdId, user } = await requireDal();
    const form = parsed.data;

    const itemByName = await linkIngredientItems(supabase, householdId);

    const { data: recipe, error } = await supabase
      .from("recipes")
      .insert({
        household_id: householdId,
        name: form.name,
        description: form.description,
        prep_time: form.prep_time,
        cook_time: form.cook_time,
        time: form.prep_time + form.cook_time,
        yields: form.yields,
        source: form.source || null,
        tags: form.tags,
        recipe_type: form.recipe_type,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error || !recipe) {
      return { ok: false, error: error?.message ?? "Could not create recipe" };
    }

    if (form.ingredients.length > 0) {
      const { error: ingredientError } = await supabase.from("recipe_ingredients").insert(
        form.ingredients.map((ingredient, index) => ({
          household_id: householdId,
          recipe_id: recipe.id as string,
          item_id: itemByName.get(ingredient.name.toLowerCase()) ?? null,
          name: ingredient.name,
          quantity_text: toImperialText(ingredient.quantity_text),
          optional: ingredient.optional,
          on_shopping_list: ingredient.on_shopping_list,
          sort_order: index,
        })),
      );
      if (ingredientError) {
        return { ok: false, error: ingredientError.message };
      }
    }

    revalidatePath("/recipes");
    revalidatePath("/plan");
    revalidatePath("/home");
    return { ok: true, data: { id: recipe.id as string } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not create recipe",
    };
  }
}

export async function updateRecipe(
  recipeId: string,
  input: RecipeFormInput,
): Promise<ActionResult> {
  try {
    const parsed = recipeFormSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Check the recipe fields" };
    const { supabase, householdId } = await requireDal();
    const form = parsed.data;

    const { error: recipeError } = await supabase
      .from("recipes")
      .update({
        description: form.description,
        name: form.name,
        prep_time: form.prep_time,
        cook_time: form.cook_time,
        time: form.prep_time + form.cook_time,
        yields: form.yields,
        source: form.source || null,
        tags: form.tags,
        recipe_type: form.recipe_type,
      })
      .eq("id", recipeId)
      .eq("household_id", householdId);
    if (recipeError) return { ok: false, error: recipeError.message };

    const { error: clearError } = await supabase
      .from("recipe_ingredients")
      .delete()
      .eq("recipe_id", recipeId)
      .eq("household_id", householdId);
    if (clearError) return { ok: false, error: clearError.message };

    if (form.ingredients.length > 0) {
      const itemByName = await linkIngredientItems(supabase, householdId);
      const { error: ingredientError } = await supabase.from("recipe_ingredients").insert(
        form.ingredients.map((ingredient, index) => ({
          household_id: householdId,
          recipe_id: recipeId,
          item_id: itemByName.get(ingredient.name.toLowerCase()) ?? null,
          name: ingredient.name,
          quantity_text: toImperialText(ingredient.quantity_text),
          optional: ingredient.optional,
          on_shopping_list: ingredient.on_shopping_list,
          sort_order: index,
        })),
      );
      if (ingredientError) return { ok: false, error: ingredientError.message };
    }

    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);
    revalidatePath("/plan");
    revalidatePath("/home");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Update failed",
    };
  }
}

export async function deleteRecipe(recipeId: string): Promise<ActionResult> {
  try {
    const { supabase, householdId } = await requireDal();
    const { error } = await supabase
      .from("recipes")
      .delete()
      .eq("id", recipeId)
      .eq("household_id", householdId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/recipes");
    revalidatePath("/plan");
    revalidatePath("/home");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Delete failed",
    };
  }
}

export async function addRecipeToGrocery(
  recipeId: string,
  ingredientIds: string[],
): Promise<ActionResult<{ added: number; skipped: number }>> {
  try {
    const selectedParsed = z.array(z.string().uuid()).max(100).safeParse(ingredientIds);
    if (!selectedParsed.success) {
      return { ok: false, error: "Check the selected ingredients" };
    }
    const selected = new Set(selectedParsed.data);
    if (selected.size === 0) {
      return { ok: false, error: "Select at least one ingredient" };
    }

    const { supabase, householdId } = await requireDal();

    const { data: recipe } = await supabase
      .from("recipes")
      .select("id, name")
      .eq("household_id", householdId)
      .eq("id", recipeId)
      .maybeSingle();
    if (!recipe) return { ok: false, error: "Recipe not found" };

    const { data: ingredients, error: fetchError } = await supabase
      .from("recipe_ingredients")
      .select("*")
      .eq("household_id", householdId)
      .eq("recipe_id", recipeId)
      .order("sort_order", { ascending: true });
    if (fetchError) return { ok: false, error: fetchError.message };

    const rows = (ingredients ?? []) as {
      id: string;
      name: string;
      item_id: string | null;
      quantity_text: string;
    }[];
    const picked = rows.filter((row) => selected.has(row.id));
    if (picked.length === 0) {
      return { ok: false, error: "Select at least one ingredient" };
    }

    // Remember the selection: picked rows on the list, the rest off it.
    const enableIds = picked.map((row) => row.id);
    const disableIds = rows
      .filter((row) => !selected.has(row.id))
      .map((row) => row.id);
    if (enableIds.length > 0) {
      const { error } = await supabase
        .from("recipe_ingredients")
        .update({ on_shopping_list: true })
        .eq("household_id", householdId)
        .in("id", enableIds);
      if (error) return { ok: false, error: error.message };
    }
    if (disableIds.length > 0) {
      const { error } = await supabase
        .from("recipe_ingredients")
        .update({ on_shopping_list: false })
        .eq("household_id", householdId)
        .in("id", disableIds);
      if (error) return { ok: false, error: error.message };
    }

    // Grocery lines link the canonical root so product + generic pushes
    // dedupe onto one line and pantry checks resolve across the group.
    const { data: itemRows } = await supabase
      .from("items")
      .select("id, name, canonical_item_id")
      .eq("household_id", householdId);
    const catalogRows = (itemRows ?? []) as {
      id: string;
      name: string;
      canonical_item_id: string | null;
    }[];
    const rootOf = createRootLookup(catalogRows);
    const nameToRoot = new Map<string, string>();
    for (const row of catalogRows) {
      nameToRoot.set(row.name.trim().toLowerCase(), rootOf(row.id));
    }

    const inputs = picked.map((ingredient) => {
      const parsed = parseQuantityText(ingredient.quantity_text);
      const linkedRoot = ingredient.item_id ? rootOf(ingredient.item_id) : null;
      const byName = nameToRoot.get(
        splitNameAndQuantity(ingredient.name).name.trim().toLowerCase(),
      );
      return {
        itemId: linkedRoot ?? byName ?? null,
        name: ingredient.name,
        quantity: parsed.quantity,
        unit: parsed.unit,
        source: "recipe" as const,
      };
    });

    const result = await addManyGroceryItems(inputs);
    if (!result.ok) return result;
    revalidatePath(`/recipes/${recipeId}`);
    return { ok: true, data: result.data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not add ingredients",
    };
  }
}

/** One ingredient as the cook dialog shows it: what the pantry can cover. */
export type RecipeCookItem = {
  id: string;
  name: string;
  quantityText: string;
  optional: boolean;
  /** Canonical root id; null = the ingredient isn't linked to a catalog item. */
  rootId: string | null;
  /** Catalog name of the matched group (differs for branded products). */
  pantryName: string | null;
  /** Recipe unit — display only; deduction compares quantity in pool space. */
  unit: string | null;
  needed: number;
  available: number;
  take: number;
  shortfall: number;
  /** Deduction amount in pool space — ounces for weight needs, containers otherwise. */
  takePool: number;
  /** Which pool column `takePool` is measured in. */
  poolBasis: "oz" | "count";
};

type CookResolution =
  | { ok: false; error: string }
  | {
      ok: true;
      recipe: { id: string; name: string };
      items: RecipeCookItem[];
      groupByRoot: Map<string, string[]>;
      /** Unreserved pool per root — shared roots don't double-dip. */
      availableByRoot: Map<string, PantryPool>;
    };

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Recipe-driven pantry resolution for the Quick Bites cook dialog: every saved
 * ingredient paired with current stock via item_id → canonical root, pooled
 * across all batches (oz-family weights convert exactly; cups/counts compare
 * as plain numbers, like the recipe editor). Meal-plan stock holds reduce
 * availability — reserved stock is never shown as usable. Read-only.
 */
async function resolveRecipeCook(
  supabase: Awaited<ReturnType<typeof requireDal>>["supabase"],
  householdId: string,
  recipeId: string,
): Promise<CookResolution> {
  const { data: recipeData, error: recipeError } = await supabase
    .from("recipes")
    .select("id, name")
    .eq("household_id", householdId)
    .eq("id", recipeId)
    .maybeSingle();
  if (recipeError) return { ok: false, error: recipeError.message };
  const recipe = recipeData as { id: string; name: string } | null;
  if (!recipe) return { ok: false, error: "Recipe not found" };

  const [ingredientsResult, inventoryResult, holdsResult, itemsResult] =
    await Promise.all([
      supabase
        .from("recipe_ingredients")
        .select("id, name, item_id, quantity_text, optional, sort_order")
        .eq("household_id", householdId)
        .eq("recipe_id", recipeId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("inventory")
        .select("*")
        .eq("household_id", householdId)
        .gt("quantity", 0),
      supabase
        .from("stock_holds")
        .select("item_id, quantity, unit")
        .eq("household_id", householdId),
      supabase
        .from("items")
        .select("id, name, canonical_item_id")
        .eq("household_id", householdId),
    ]);
  if (ingredientsResult.error) {
    return { ok: false, error: ingredientsResult.error.message };
  }

  const catalogRows = (itemsResult.data ?? []) as {
    id: string;
    name: string;
    canonical_item_id: string | null;
  }[];
  const rootOf = createRootLookup(catalogRows);
  const nameById = new Map<string, string>();
  const groupByRoot = new Map<string, string[]>();
  for (const row of catalogRows) {
    const root = rootOf(row.id);
    nameById.set(row.id, row.name);
    const group = groupByRoot.get(root) ?? [];
    group.push(row.id);
    groupByRoot.set(root, group);
  }

  const stockPools = buildPantryPools(
    (inventoryResult.data ?? []) as InventoryRow[],
    catalogRows,
  );
  const heldByRoot = new Map<string, PantryDemand>();
  for (const hold of (holdsResult.data ?? []) as {
    item_id: string;
    quantity: number;
    unit: string | null;
  }[]) {
    const root = rootOf(hold.item_id);
    const demand = heldByRoot.get(root) ?? emptyDemand();
    addNeed(demand, needFromParts(hold.quantity, hold.unit));
    heldByRoot.set(root, demand);
  }

  /** Unreserved pool per root: stock minus meal-plan holds, per basis. */
  const unreservedPool = (rootId: string | null): PantryPool => {
    if (!rootId) return emptyPool();
    const pool = stockPools.pools.get(rootId) ?? emptyPool();
    const held = heldByRoot.get(rootId);
    return {
      ounces: Math.max(0, pool.ounces - (held?.ounces ?? 0)),
      packages: Math.max(0, pool.packages - (held?.packages ?? 0)),
    };
  };

  const items: RecipeCookItem[] = [];
  /** Unreserved stock per root BEFORE this recipe's ingredients claim any. */
  const availableByRoot = new Map<string, PantryPool>();
  /** Running budget: two ingredients on one root must not claim stock twice. */
  const remainingByRoot = new Map<string, PantryPool>();
  for (const row of (ingredientsResult.data ?? []) as {
    id: string;
    name: string;
    item_id: string | null;
    quantity_text: string;
    optional: boolean;
  }[]) {
    const parsed = parseQuantityText(row.quantity_text);
    const rootId = row.item_id ? rootOf(row.item_id) : null;
    // Weight needs compare in ounces (container sizes expanded); everything
    // else ("2 cans", a bare "1") compares against container counts.
    const need = pantryNeed(row.quantity_text);
    const basis = need.ounces != null ? "oz" : "count";
    const pool = unreservedPool(rootId);
    if (rootId && !availableByRoot.has(rootId)) {
      availableByRoot.set(rootId, { ...pool });
      remainingByRoot.set(rootId, { ...pool });
    }
    const availablePool = rootId
      ? (remainingByRoot.get(rootId) ?? pool)
      : pool;
    const needed = basis === "oz" ? (need.ounces ?? 0) : need.packages;
    const availableInBasis = basis === "oz" ? availablePool.ounces : availablePool.packages;
    const takePool = Math.min(availableInBasis, needed);
    if (rootId) {
      const next = { ...availablePool };
      if (basis === "oz") next.ounces = Math.max(0, next.ounces - takePool);
      else next.packages = Math.max(0, next.packages - takePool);
      remainingByRoot.set(rootId, next);
    }
    const shortfall = Math.max(0, needed - takePool);
    // Report in the recipe's own unit so the dialog reads "1 lb"/"2 eggs".
    const toRecipe = (value: number) =>
      parsed.unit ? (fromOunces(value, parsed.unit) ?? value) : value;
    items.push({
      id: row.id,
      name: row.name,
      quantityText: row.quantity_text,
      optional: row.optional === true,
      rootId,
      pantryName: rootId ? (nameById.get(rootId) ?? null) : null,
      unit: parsed.unit,
      needed: round3(toRecipe(needed)),
      available: round3(toRecipe(availableInBasis)),
      take: round3(toRecipe(takePool)),
      shortfall: round3(toRecipe(shortfall)),
      takePool: round3(takePool),
      poolBasis: basis,
    });
  }

  return {
    ok: true,
    recipe,
    items,
    groupByRoot,
    availableByRoot,
  };
}

/** Read-only pantry impact preview for the Quick Bites cook dialog. */
export async function previewRecipeCook(
  recipeId: string,
): Promise<
  ActionResult<{
    recipe: { id: string; name: string };
    items: RecipeCookItem[];
  }>
> {
  try {
    if (!z.string().uuid().safeParse(recipeId).success) {
      return { ok: false, error: "Invalid recipe" };
    }
    const { supabase, householdId } = await requireDal();
    const resolved = await resolveRecipeCook(supabase, householdId, recipeId);
    if (!resolved.ok) return resolved;
    return {
      ok: true,
      data: { recipe: resolved.recipe, items: resolved.items },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load ingredients",
    };
  }
}

const cookRecipeSchema = z.object({
  recipeId: z.string().uuid(),
  ingredientIds: z.array(z.string().uuid()).min(1).max(100),
});

export type CookRecipeInput = z.input<typeof cookRecipeSchema>;

export type CookRecipeData = {
  deducted: { id: string; name: string; amount: number; unit: string | null }[];
  skipped: { id: string; name: string; reason: string }[];
  /** Pre-deduction rows so the client can undo via restoreBatches. */
  snapshots: BatchSnapshot[];
};

/**
 * Deducts the selected ingredients from the pantry FEFO across each
 * canonical group. Quantities are recomputed server-side; stock reserved by
 * meal-plan holds is left untouched. Empty batches are deleted, and the
 * touched rows are returned as snapshots for the Undo toast.
 */
export async function cookRecipe(
  rawInput: CookRecipeInput,
): Promise<ActionResult<CookRecipeData>> {
  try {
    const parsed = cookRecipeSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { ok: false, error: "Select at least one ingredient" };
    }
    const { supabase, householdId } = await requireDal();
    const resolved = await resolveRecipeCook(
      supabase,
      householdId,
      parsed.data.recipeId,
    );
    if (!resolved.ok) return resolved;

    const selected = new Set(parsed.data.ingredientIds);
    const snapshots: BatchSnapshot[] = [];
    // A batch can serve more than one ingredient row (shared canonical root) —
    // undo needs the state BEFORE the first deduction, not intermediate ones.
    const snapshotted = new Set<string>();
    const deducted: CookRecipeData["deducted"] = [];
    const skipped: CookRecipeData["skipped"] = [];

    for (const ingredient of resolved.items) {
      if (!selected.has(ingredient.id)) continue;
      if (!ingredient.rootId) {
        skipped.push({
          id: ingredient.id,
          name: ingredient.name,
          reason: "Not matched to the pantry",
        });
        continue;
      }
      // Shared canonical roots must not double-dip: recompute the remaining
      // unreserved pool after every deduction.
      const rootPool = resolved.availableByRoot.get(ingredient.rootId) ?? emptyPool();
      const rootAvailable =
        ingredient.poolBasis === "oz" ? rootPool.ounces : rootPool.packages;
      const takePool = Math.min(ingredient.takePool, rootAvailable);
      if (takePool <= 0) {
        skipped.push({
          id: ingredient.id,
          name: ingredient.name,
          reason: "Nothing available",
        });
        continue;
      }

      const groupIds =
        resolved.groupByRoot.get(ingredient.rootId) ?? [ingredient.rootId];
      const { data: rowsData, error: rowsError } = await supabase
        .from("inventory")
        .select("*")
        .eq("household_id", householdId)
        .in("item_id", groupIds)
        .gt("quantity", 0);
      if (rowsError) return { ok: false, error: rowsError.message };
      const rows = fefoSort((rowsData ?? []) as InventoryRow[]);

      let remaining = takePool;
      for (const row of rows) {
        if (remaining <= 0) break;
        const ozPerUnit = toOunces(1, row.unit);
        let take: number;
        if (ingredient.poolBasis === "oz") {
          // Weight needs only consume weight batches.
          if (ozPerUnit == null) continue;
          take = Math.min(row.quantity, remaining / ozPerUnit);
        } else {
          take = Math.min(row.quantity, remaining);
        }
        if (take <= 0) continue;
        const nextQuantity = round3(row.quantity - take);
        if (!snapshotted.has(row.id)) {
          snapshotted.add(row.id);
          snapshots.push(toBatchSnapshot(row));
        }
        if (nextQuantity <= 0) {
          const { error } = await supabase
            .from("inventory")
            .delete()
            .eq("id", row.id);
          if (error) return { ok: false, error: error.message };
        } else {
          const { error } = await supabase
            .from("inventory")
            .update({ quantity: nextQuantity })
            .eq("id", row.id);
          if (error) return { ok: false, error: error.message };
        }
        remaining -=
          ingredient.poolBasis === "oz" ? take * (ozPerUnit ?? 0) : take;
      }

      const takenPool = Math.max(0, takePool - Math.max(0, remaining));
      const reduced = { ...rootPool };
      if (ingredient.poolBasis === "oz") {
        reduced.ounces = Math.max(0, reduced.ounces - takenPool);
      } else {
        reduced.packages = Math.max(0, reduced.packages - takenPool);
      }
      resolved.availableByRoot.set(ingredient.rootId, reduced);
      const toRecipe = (value: number) =>
        ingredient.unit
          ? (fromOunces(value, ingredient.unit) ?? value)
          : value;
      deducted.push({
        id: ingredient.id,
        name: ingredient.name,
        amount: round3(toRecipe(takenPool)),
        unit: ingredient.unit,
      });
      if (remaining > 0.0001) {
        skipped.push({
          id: ingredient.id,
          name: ingredient.name,
          reason: "Part of it is reserved or out of stock",
        });
      }
    }

    if (snapshots.length === 0) {
      return {
        ok: false,
        error: "Nothing was deducted — those ingredients aren't available.",
      };
    }

    revalidatePath("/home");
    revalidatePath("/inventory");
    revalidatePath("/recipes");
    revalidatePath("/plan");
    return { ok: true, data: { deducted, skipped, snapshots } };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not deduct ingredients",
    };
  }
}
