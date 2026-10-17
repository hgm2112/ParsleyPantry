import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireDal } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RecipesView } from "@/components/recipes/recipes-view";
import { createRootLookup } from "@/lib/canonical";
import { splitNameAndQuantity } from "@/lib/stock";
import type { RecipeRow } from "@/lib/types";

export const metadata = { title: "Recipes" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function RecipesSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="h-6 bg-muted/50" />
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-9 w-full" />
      ))}
    </div>
  );
}

async function RecipesContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const rawItems = typeof params.items === "string" ? params.items : "";
  const onlyItemIds = rawItems
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 40);

  const { supabase, householdId } = await requireDal();

  const [recipesResult, ingredientsResult, inventoryResult, itemsResult] = await Promise.all([
    supabase
      .from("recipes")
      .select("*")
      .eq("household_id", householdId)
      .order("name", { ascending: true }),
    supabase
      .from("recipe_ingredients")
      .select("recipe_id, optional, item_id, name")
      .eq("household_id", householdId),
    supabase
      .from("inventory")
      .select("item_id, quantity")
      .eq("household_id", householdId),
    supabase
      .from("items")
      .select("id, name, canonical_item_id")
      .eq("household_id", householdId),
  ]);

  const recipes = (recipesResult.data ?? []) as RecipeRow[];
  const itemIdsByRecipe: Record<string, string[]> = {};
  const recipeIdsWithIngredients = new Set<string>();
  const pantryStatus: Record<
    string,
    { covered: number; total: number; optional: number }
  > = {};
  const inventoryData = (inventoryResult.data ?? []) as { item_id: string; quantity: number }[];
  const itemsData = (itemsResult.data ?? []) as {
    id: string;
    name: string;
    canonical_item_id: string | null;
  }[];
  const rootOf = createRootLookup(itemsData);

  // Stock and name resolution are keyed by canonical identity (root item),
  // so every product under one generic ingredient shares its pantry pool.
  const stockByItem: Record<string, number> = {};
  for (const row of inventoryData) {
    const key = rootOf(row.item_id);
    stockByItem[key] = (stockByItem[key] ?? 0) + row.quantity;
  }

  const nameToItemId: Record<string, string> = {};
  for (const it of itemsData) {
    const k = it.name.trim().toLowerCase();
    if (k) nameToItemId[k] = rootOf(it.id);
  }
  for (const row of (ingredientsResult.data ?? []) as {
    recipe_id: string;
    optional: boolean;
    item_id: string | null;
    name: string;
  }[]) {
    recipeIdsWithIngredients.add(row.recipe_id);
    let itemId = row.item_id ? rootOf(row.item_id) : null;
    if (!itemId) {
      const { name: cleanName } = splitNameAndQuantity(row.name || "");
      const key = cleanName.trim().toLowerCase();
      itemId = nameToItemId[key] ?? null;
    }
    if (itemId) {
      const list = itemIdsByRecipe[row.recipe_id] ?? [];
      list.push(itemId);
      itemIdsByRecipe[row.recipe_id] = list;
    }
    if (!row.name.trim()) continue;
    if (!pantryStatus[row.recipe_id]) {
      pantryStatus[row.recipe_id] = { covered: 0, total: 0, optional: 0 };
    }
    // Optional ingredients are counted separately and never folded into the
    // have/need tally; required coverage is presence-based (any stock counts),
    // so an ingredient with a mismatched amount/unit still reads as on hand.
    if (row.optional) {
      pantryStatus[row.recipe_id].optional += 1;
      continue;
    }
    pantryStatus[row.recipe_id].total += 1;
    if (itemId && (stockByItem[itemId] ?? 0) > 0) {
      pantryStatus[row.recipe_id].covered += 1;
    }
  }

  return (
    <RecipesView
      recipes={recipes}
      itemIdsByRecipe={itemIdsByRecipe}
      onlyItemIds={onlyItemIds}
      pantryStatus={pantryStatus}
      recipeIdsWithIngredients={Array.from(recipeIdsWithIngredients)}
    />
  );
}

export default function RecipesPage({ searchParams }: PageProps<"/recipes">) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold">Recipes</h1>
          <p className="text-xs text-muted-foreground">
            Push ingredients to the grocery list in one tap.
          </p>
        </div>
        <Button size="sm" render={<Link href="/recipes/new" />}>
          <Plus /> New recipe
        </Button>
      </div>
      <Suspense fallback={<RecipesSkeleton />}>
        <RecipesContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
