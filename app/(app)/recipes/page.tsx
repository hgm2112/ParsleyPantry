import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireDal } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RecipesView } from "@/components/recipes/recipes-view";
import type { RecipeRow } from "@/lib/types";

export const metadata = { title: "Recipes" };

function RecipesSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  );
}

async function RecipesContent() {
  const { supabase, householdId } = await requireDal();

  const [recipesResult, ingredientsResult] = await Promise.all([
    supabase
      .from("recipes")
      .select("*")
      .eq("household_id", householdId)
      .order("name", { ascending: true }),
    supabase
      .from("recipe_ingredients")
      .select("recipe_id, optional")
      .eq("household_id", householdId),
  ]);

  const recipes = (recipesResult.data ?? []) as RecipeRow[];
  const counts = new Map<string, number>();
  for (const row of (ingredientsResult.data ?? []) as {
    recipe_id: string;
    optional: boolean;
  }[]) {
    counts.set(row.recipe_id, (counts.get(row.recipe_id) ?? 0) + 1);
  }

  return (
    <RecipesView
      recipes={recipes}
      ingredientCounts={Object.fromEntries(counts)}
    />
  );
}

export default function RecipesPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Recipes</h1>
          <p className="text-xs text-muted-foreground">
            Push ingredients to the grocery list in one tap.
          </p>
        </div>
        <Button size="sm" render={<Link href="/recipes/new" />}>
          <Plus /> New recipe
        </Button>
      </div>
      <Suspense fallback={<RecipesSkeleton />}>
        <RecipesContent />
      </Suspense>
    </div>
  );
}
