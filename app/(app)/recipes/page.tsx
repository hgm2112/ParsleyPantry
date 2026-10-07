import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireDal } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RecipesView } from "@/components/recipes/recipes-view";
import type { RecipeRow } from "@/lib/types";

export const metadata = { title: "Recipes" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function RecipesSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-28 w-full rounded-xl" />
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

  const [recipesResult, ingredientsResult] = await Promise.all([
    supabase
      .from("recipes")
      .select("*")
      .eq("household_id", householdId)
      .order("name", { ascending: true }),
    supabase
      .from("recipe_ingredients")
      .select("recipe_id, optional, item_id")
      .eq("household_id", householdId),
  ]);

  const recipes = (recipesResult.data ?? []) as RecipeRow[];
  const counts: Record<string, number> = {};
  const itemIdsByRecipe: Record<string, string[]> = {};
  for (const row of (ingredientsResult.data ?? []) as {
    recipe_id: string;
    optional: boolean;
    item_id: string | null;
  }[]) {
    counts[row.recipe_id] = (counts[row.recipe_id] ?? 0) + 1;
    if (row.item_id) {
      const list = itemIdsByRecipe[row.recipe_id] ?? [];
      list.push(row.item_id);
      itemIdsByRecipe[row.recipe_id] = list;
    }
  }

  return (
    <RecipesView
      recipes={recipes}
      ingredientCounts={counts}
      itemIdsByRecipe={itemIdsByRecipe}
      onlyItemIds={onlyItemIds}
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
