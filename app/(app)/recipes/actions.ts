"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDal } from "@/lib/auth";
import { addManyGroceryItems } from "@/app/(app)/grocery/actions";
import { parseQuantityText, toImperialText } from "@/lib/stock";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const ingredientSchema = z.object({
  name: z.string().trim().min(1).max(160),
  quantity_text: z.string().max(120).default(""),
  optional: z.boolean().default(false),
  on_shopping_list: z.boolean().default(true),
});

const recipeFormSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().max(4000).default(""),
  prep_time: z.number().int().min(0).max(1440).default(0),
  cook_time: z.number().int().min(0).max(1440).default(0),
  yields: z.number().int().min(1).max(999).default(1),
  source: z.string().trim().max(200).nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  ingredients: z.array(ingredientSchema).max(100).default([]),
});

export type RecipeFormInput = z.input<typeof recipeFormSchema>;

async function linkIngredientItems(
  supabase: Awaited<ReturnType<typeof requireDal>>["supabase"],
  householdId: string,
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("items")
    .select("id, name")
    .eq("household_id", householdId);

  const byName = new Map<string, string>();
  for (const row of ((data ?? []) as { id: string; name: string }[])) {
    byName.set(row.name.toLowerCase(), row.id);
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
        name: form.name,
        description: form.description,
        prep_time: form.prep_time,
        cook_time: form.cook_time,
        time: form.prep_time + form.cook_time,
        yields: form.yields,
        source: form.source || null,
        tags: form.tags,
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

    const inputs = picked.map((ingredient) => {
      const parsed = parseQuantityText(ingredient.quantity_text);
      return {
        itemId: ingredient.item_id,
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
