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

async function RecipeContent({
  recipeId,
  returnTo,
}: {
  recipeId: string;
  returnTo?: string;
}) {
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
      .select("item_id, quantity")
      .eq("household_id", householdId),
    supabase
      .from("items")
      .select("id, name, canonical_item_id")
      .eq("household_id", householdId),
  ]);

  const recipe = recipeResult.data as RecipeRow | null;
  if (!recipe) notFound();

  const ingredients = (ingredientsResult.data ?? []) as RecipeIngredientRow[];

  const inventoryData = (inventoryResult.data ?? []) as { item_id: string; quantity: number }[];
  const itemsData = (itemsResult.data ?? []) as {
    id: string;
    name: string;
    canonical_item_id: string | null;
  }[];
  const rootOf = createRootLookup(itemsData);

  // Stock pools are keyed by canonical identity so every product under one
  // generic ingredient contributes to the same pantry check.
  const stockByItem: Record<string, number> = {};
  for (const row of inventoryData) {
    const key = rootOf(row.item_id);
    stockByItem[key] = (stockByItem[key] ?? 0) + row.quantity;
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
        nameToItemId={nameToItemId}
        itemRoots={itemRoots}
        returnTo={returnTo}
      />
    </div>
  );
}

export default function RecipePage({
  params,
  searchParams,
}: PageProps<"/recipes/[id]">) {
  return (
    <Suspense fallback={<RecipeSkeleton />}>
      <RecipeWrapper params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function RecipeWrapper({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const returnTo =
    typeof sp.returnTo === "string" && sp.returnTo.startsWith("/")
      ? sp.returnTo
      : undefined;
  return <RecipeContent recipeId={id} returnTo={returnTo} />;
}
