import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireDal } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RecipesView } from "@/components/recipes/recipes-view";
import { parseQuantityText, splitNameAndQuantity, toOunces } from "@/lib/stock";
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
      .select("recipe_id, optional, item_id, quantity_text, name")
      .eq("household_id", householdId),
    supabase
      .from("inventory")
      .select("item_id, quantity, unit")
      .eq("household_id", householdId),
    supabase
      .from("items")
      .select("id, name")
      .eq("household_id", householdId),
  ]);

  const recipes = (recipesResult.data ?? []) as RecipeRow[];
  const counts: Record<string, number> = {};
  const itemIdsByRecipe: Record<string, string[]> = {};
  const pantryStatus: Record<string, { covered: number; total: number }> = {};
  const inventoryData = (inventoryResult.data ?? []) as { item_id: string; quantity: number; unit: string | null }[];
  const stockByItem: Record<string, number> = {};
  const stockUnitByItem: Record<string, string | null> = {};
  for (const row of inventoryData) {
    stockByItem[row.item_id] = (stockByItem[row.item_id] ?? 0) + row.quantity;
    if (stockUnitByItem[row.item_id] == null) {
      stockUnitByItem[row.item_id] = row.unit;
    } else if (stockUnitByItem[row.item_id] !== row.unit) {
      stockUnitByItem[row.item_id] = null;
    }
  }

  const itemsData = (itemsResult.data ?? []) as { id: string; name: string }[];
  const nameToItemId: Record<string, string> = {};
  for (const it of itemsData) {
    const k = it.name.trim().toLowerCase();
    if (k) nameToItemId[k] = it.id;
  }
  for (const row of (ingredientsResult.data ?? []) as {
    recipe_id: string;
    optional: boolean;
    item_id: string | null;
    quantity_text: string;
    name: string;
  }[]) {
    counts[row.recipe_id] = (counts[row.recipe_id] ?? 0) + 1;
    let itemId = row.item_id;
    if (!itemId) {
      const { name: cleanName } = splitNameAndQuantity(row.name || "");
      const key = cleanName.trim().toLowerCase();
      itemId = nameToItemId[key] ?? null;
    }
    if (itemId) {
      const list = itemIdsByRecipe[row.recipe_id] ?? [];
      list.push(itemId);
      itemIdsByRecipe[row.recipe_id] = list;
      if (!pantryStatus[row.recipe_id]) {
        pantryStatus[row.recipe_id] = { covered: 0, total: 0 };
      }
      pantryStatus[row.recipe_id].total += 1;
      const p = parseQuantityText(row.quantity_text || "");
      const needed = toOunces(p.quantity, p.unit) ?? p.quantity;
      const haveRaw = stockByItem[itemId] || 0;
      const haveUnit = stockUnitByItem[itemId];
      const have = toOunces(haveRaw, haveUnit) ?? haveRaw;
      if (have >= needed) {
        pantryStatus[row.recipe_id].covered += 1;
      }
    }
  }

  return (
    <RecipesView
      recipes={recipes}
      ingredientCounts={counts}
      itemIdsByRecipe={itemIdsByRecipe}
      onlyItemIds={onlyItemIds}
      pantryStatus={pantryStatus}
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
