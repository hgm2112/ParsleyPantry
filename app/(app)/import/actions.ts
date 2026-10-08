"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDal } from "@/lib/auth";
import { categoryMatchKey, parseCategoryLabel } from "@/lib/kitchenowl";
import { toImperialText } from "@/lib/stock";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ImportSummary = {
  categories: { created: number; renamed: number };
  items: { created: number; skipped: number; backfilled: number };
  recipes: { created: number; skipped: number };
  ingredients: number;
};

const owlIngredientSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullish(),
  optional: z.boolean().nullish(),
});

const owlExportSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().min(1),
      category: z.string().nullish(),
      icon: z.string().nullish(),
    }),
  ),
  recipes: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string().nullish(),
      prep_time: z.number().nullish(),
      cook_time: z.number().nullish(),
      time: z.number().nullish(),
      yields: z.number().nullish(),
      source: z.string().nullish(),
      tags: z.array(z.string()).nullish(),
      items: z.array(owlIngredientSchema).nullish(),
    }),
  ),
});

const CHUNK = 100;

type ChunkResult = { id: string; name: string }[];

async function insertChunked(
  supabase: Awaited<ReturnType<typeof requireDal>>["supabase"],
  table: "categories" | "items" | "recipes" | "recipe_ingredients",
  rows: Record<string, unknown>[],
  select: string,
): Promise<ChunkResult> {
  const inserted: ChunkResult = [];
  for (let index = 0; index < rows.length; index += CHUNK) {
    const slice = rows.slice(index, index + CHUNK);
    const { data, error } = await supabase.from(table).insert(slice).select(select);
    if (error) throw new Error(`${table}: ${error.message}`);
    inserted.push(...((data ?? []) as unknown as ChunkResult));
  }
  return inserted;
}

export async function importKitchenOwl(
  input: unknown,
): Promise<ActionResult<ImportSummary>> {
  try {
    const parsed = owlExportSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: "That file doesn't look like a KitchenOwl export (need items[] and recipes[])",
      };
    }

    const { supabase, householdId, user } = await requireDal();
    const { items: owlItems, recipes: owlRecipes } = parsed.data;

    /* Categories ------------------------------------------------------ */

    const { data: existingCategories } = await supabase
      .from("categories")
      .select("id, name, sort_order")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true });

    const categoryByKey = new Map<string, { id: string; name: string }>();
    let nextCategorySort = 0;
    for (const row of (existingCategories ?? []) as {
      id: string;
      name: string;
      sort_order: number;
    }[]) {
      categoryByKey.set(categoryMatchKey(row.name), {
        id: row.id,
        name: row.name,
      });
      nextCategorySort = Math.max(nextCategorySort, row.sort_order + 1);
    }

    type LabelEntry = {
      label: string;
      name: string;
      icon: string | null;
      number: number | null;
      order: number;
    };
    const labelOrder: LabelEntry[] = [];
    const seenLabelKeys = new Set<string>();
    for (const item of owlItems) {
      const label = (item.category ?? "").trim();
      if (!label) continue;
      const key = categoryMatchKey(label);
      if (!key || seenLabelKeys.has(key)) continue;
      seenLabelKeys.add(key);
      labelOrder.push({ label, order: labelOrder.length, ...parseCategoryLabel(label) });
    }
    labelOrder.sort(
      (a, b) =>
        (a.number ?? Number.MAX_SAFE_INTEGER) -
          (b.number ?? Number.MAX_SAFE_INTEGER) || a.order - b.order,
    );

    // Restore the original KitchenOwl labels (emoji + aisle number) on
    // categories that were first imported without them.
    const categoryRenames = labelOrder.flatMap((entry) => {
      const existing = categoryByKey.get(categoryMatchKey(entry.label));
      return existing && existing.name !== entry.name
        ? [{ id: existing.id, name: entry.name }]
        : [];
    });
    let categoriesRenamed = 0;
    for (let index = 0; index < categoryRenames.length; index += CHUNK) {
      const slice = categoryRenames.slice(index, index + CHUNK);
      const results = await Promise.all(
        slice.map((entry) =>
          supabase
            .from("categories")
            .update({ name: entry.name })
            .eq("id", entry.id)
            .eq("household_id", householdId)
            .select("id"),
        ),
      );
      for (const result of results) {
        categoriesRenamed += (result.data ?? []).length;
      }
    }
    for (const entry of categoryRenames) {
      const current = categoryByKey.get(
        categoryMatchKey(entry.name),
      );
      if (current && current.id === entry.id) current.name = entry.name;
    }

    const pendingCategories = labelOrder.filter(
      (entry) => !categoryByKey.has(categoryMatchKey(entry.label)),
    );
    if (pendingCategories.length > 0) {
      const inserted = await insertChunked(
        supabase,
        "categories",
        pendingCategories.map((entry) => ({
          household_id: householdId,
          name: entry.name,
          icon: entry.icon,
          sort_order: nextCategorySort++,
        })),
        "id, name",
      );
      for (const row of inserted) {
        categoryByKey.set(categoryMatchKey(row.name), {
          id: row.id,
          name: row.name,
        });
      }
    }

    const categoryIdForLabel = (label: string | null | undefined): string | null => {
      const trimmed = (label ?? "").trim();
      if (!trimmed) return null;
      return categoryByKey.get(categoryMatchKey(trimmed))?.id ?? null;
    };

    /* Items ----------------------------------------------------------- */

    const { data: existingItems } = await supabase
      .from("items")
      .select("id, name, category_id")
      .eq("household_id", householdId);

    const itemByKey = new Map<
      string,
      { id: string; name: string; category_id: string | null }
    >();
    for (const row of (existingItems ?? []) as {
      id: string;
      name: string;
      category_id: string | null;
    }[]) {
      itemByKey.set(row.name.toLowerCase(), {
        id: row.id,
        name: row.name,
        category_id: row.category_id,
      });
    }

    const pendingItems: Record<string, unknown>[] = [];
    const queuedItemKeys = new Set<string>();
    const backfillByKey = new Map<string, string>();
    let itemsSkipped = 0;
    for (const owlItem of owlItems) {
      const name = owlItem.name.trim();
      const key = name.toLowerCase();
      if (!name || queuedItemKeys.has(key)) {
        itemsSkipped += 1;
        continue;
      }
      const existing = itemByKey.get(key);
      if (existing) {
        itemsSkipped += 1;
        if (existing.category_id === null) {
          const categoryId = categoryIdForLabel(owlItem.category);
          if (categoryId) backfillByKey.set(key, categoryId);
        }
        continue;
      }
      queuedItemKeys.add(key);
      pendingItems.push({
        household_id: householdId,
        name,
        category_id: categoryIdForLabel(owlItem.category),
        icon: owlItem.icon ?? null,
        created_by: user.id,
      });
    }

    const insertedItems = await insertChunked(
      supabase,
      "items",
      pendingItems,
      "id, name",
    );
    for (const row of insertedItems) {
      itemByKey.set(row.name.toLowerCase(), {
        id: row.id,
        name: row.name,
        category_id: null,
      });
    }

    let itemsBackfilled = 0;
    const backfills = [...backfillByKey.entries()]
      .map(([key, categoryId]) => ({ id: itemByKey.get(key)?.id, categoryId }))
      .filter((entry): entry is { id: string; categoryId: string } => !!entry.id);
    for (let index = 0; index < backfills.length; index += CHUNK) {
      const slice = backfills.slice(index, index + CHUNK);
      const results = await Promise.all(
        slice.map((entry) =>
          supabase
            .from("items")
            .update({ category_id: entry.categoryId })
            .eq("id", entry.id)
            .eq("household_id", householdId)
            .is("category_id", null)
            .select("id"),
        ),
      );
      for (const result of results) {
        itemsBackfilled += (result.data ?? []).length;
      }
    }

    /* Recipes --------------------------------------------------------- */

    const { data: existingRecipes } = await supabase
      .from("recipes")
      .select("name")
      .eq("household_id", householdId);

    const recipeKeys = new Set(
      ((existingRecipes ?? []) as { name: string }[]).map((row) =>
        row.name.trim().toLowerCase(),
      ),
    );

    const pendingRecipes: Record<string, unknown>[] = [];
    const queuedRecipeKeys = new Set<string>();
    let recipesSkipped = 0;
    const orderedRecipes: (z.infer<typeof owlExportSchema>["recipes"][number])[] = [];
    for (const owlRecipe of owlRecipes) {
      const key = owlRecipe.name.trim().toLowerCase();
      if (!key || recipeKeys.has(key) || queuedRecipeKeys.has(key)) {
        recipesSkipped += 1;
        continue;
      }
      queuedRecipeKeys.add(key);
      orderedRecipes.push(owlRecipe);
      pendingRecipes.push({
        household_id: householdId,
        name: owlRecipe.name.trim(),
        description: (owlRecipe.description ?? "").trim(),
        prep_time: Math.max(0, Math.trunc(owlRecipe.prep_time ?? 0)),
        cook_time: Math.max(0, Math.trunc(owlRecipe.cook_time ?? 0)),
        time: Math.max(0, Math.trunc(owlRecipe.time ?? 0)),
        yields: Math.max(1, Math.trunc(owlRecipe.yields ?? 1)),
        source: owlRecipe.source?.trim() || null,
        tags: owlRecipe.tags ?? [],
        created_by: user.id,
      });
    }

    const insertedRecipes = await insertChunked(
      supabase,
      "recipes",
      pendingRecipes,
      "id, name",
    );
    const recipeIdByKey = new Map(
      insertedRecipes.map((row) => [row.name.toLowerCase(), row.id]),
    );

    let ingredientCount = 0;
    const ingredientRows: Record<string, unknown>[] = [];
    for (const owlRecipe of orderedRecipes) {
      const recipeId = recipeIdByKey.get(owlRecipe.name.trim().toLowerCase());
      if (!recipeId) continue;
      (owlRecipe.items ?? []).forEach((ingredient, index) => {
        const name = ingredient.name.trim();
        if (!name) return;
        ingredientRows.push({
          household_id: householdId,
          recipe_id: recipeId,
          item_id: itemByKey.get(name.toLowerCase())?.id ?? null,
          name,
          quantity_text: toImperialText(ingredient.description ?? ""),
          optional: ingredient.optional === true,
          on_shopping_list: ingredient.optional !== true,
          sort_order: index,
        });
      });
    }
    ingredientCount = ingredientRows.length;
    await insertChunked(supabase, "recipe_ingredients", ingredientRows, "id");

    revalidatePath("/", "layout");

    return {
      ok: true,
      data: {
        categories: { created: pendingCategories.length, renamed: categoriesRenamed },
        items: {
          created: insertedItems.length,
          skipped: itemsSkipped,
          backfilled: itemsBackfilled,
        },
        recipes: {
          created: insertedRecipes.length,
          skipped: recipesSkipped,
        },
        ingredients: ingredientCount,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Import failed",
    };
  }
}
