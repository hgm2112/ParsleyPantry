import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireDal } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { RecipeEditor } from "@/components/recipes/recipe-editor";
import { createRootLookup } from "@/lib/canonical";
import type { RecipeIngredientRow, RecipeRow } from "@/lib/types";


export const metadata = { title: "Recipe" };

function RecipeSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

async function RecipeContent({ recipeId }: { recipeId: string }) {
  const { supabase, householdId } = await requireDal();

  const [recipeResult, ingredientsResult, inventoryResult, itemsResult] = await Promise.all([
    supabase
      .from("recipes")
      .select("*")
      .eq("household_id", householdId)
      .eq("id", recipeId)
      .maybeSingle(),
    supabase
      .from("recipe_ingredients")
      .select("*")
      .eq("household_id", householdId)
      .eq("recipe_id", recipeId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("inventory")
      .select("item_id, quantity, unit")
      .eq("household_id", householdId),
    supabase
      .from("items")
      .select("id, name, canonical_item_id")
      .eq("household_id", householdId),
  ]);

  const recipe = recipeResult.data as RecipeRow | null;
  if (!recipe) notFound();

  const ingredients = (ingredientsResult.data ?? []) as RecipeIngredientRow[];

  const inventoryData = (inventoryResult.data ?? []) as { item_id: string; quantity: number; unit: string | null }[];
  const itemsData = (itemsResult.data ?? []) as {
    id: string;
    name: string;
    canonical_item_id: string | null;
  }[];
  const rootOf = createRootLookup(itemsData);

  // Stock pools are keyed by canonical identity so every product under one
  // generic ingredient contributes to the same pantry check.
  const stockByItem: Record<string, number> = {};
  const stockUnitByItem: Record<string, string | null> = {};
  for (const row of inventoryData) {
    const key = rootOf(row.item_id);
    stockByItem[key] = (stockByItem[key] ?? 0) + row.quantity;
    if (stockUnitByItem[key] == null) {
      stockUnitByItem[key] = row.unit;
    } else if (stockUnitByItem[key] !== row.unit) {
      stockUnitByItem[key] = null;
    }
  }

  const nameToItemId: Record<string, string> = {};
  const itemRoots: Record<string, string> = {};
  for (const it of itemsData) {
    const k = it.name.trim().toLowerCase();
    const root = rootOf(it.id);
    itemRoots[it.id] = root;
    if (k) nameToItemId[k] = root;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <RecipeEditor
        recipe={recipe}
        ingredients={ingredients}
        stockByItem={stockByItem}
        stockUnitByItem={stockUnitByItem}
        nameToItemId={nameToItemId}
        itemRoots={itemRoots}
      />
    </div>
  );
}

export default function RecipePage({
  params,
}: PageProps<"/recipes/[id]">) {
  return (
    <Suspense fallback={<RecipeSkeleton />}>
      <RecipeWrapper params={params} />
    </Suspense>
  );
}

async function RecipeWrapper({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RecipeContent recipeId={id} />;
}
