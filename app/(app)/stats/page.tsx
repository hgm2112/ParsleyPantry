import { Suspense } from "react";
import { requireDal } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { StatsView } from "@/components/stats/stats-view";
import type { MealPlanDayRow } from "@/lib/types";

export const metadata = { title: "Stats" };

function StatsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-8 w-72 rounded-md" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-56 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  );
}

async function StatsContent() {
  const { supabase, householdId } = await requireDal();

  const [mealsResult, recipesResult, inventoryResult, itemsResult, holdsResult] =
    await Promise.all([
      supabase
        .from("meal_plan_days")
        .select("*")
        .eq("household_id", householdId)
        .order("week_start", { ascending: true })
        .order("day_index", { ascending: true }),
      supabase
        .from("recipes")
        .select("id, name")
        .eq("household_id", householdId)
        .order("name", { ascending: true }),
      supabase
        .from("inventory")
        .select("item_id, quantity, unit, expiration_date")
        .eq("household_id", householdId)
        .gt("quantity", 0),
      supabase
        .from("items")
        .select("id, name, canonical_item_id")
        .eq("household_id", householdId),
      supabase
        .from("stock_holds")
        .select("item_id, quantity, unit, week_start, day_index")
        .eq("household_id", householdId),
    ]);

  const meals = (mealsResult.data ?? []) as MealPlanDayRow[];
  const recipes = (recipesResult.data ?? []) as { id: string; name: string }[];
  const inventory = (inventoryResult.data ?? []) as {
    item_id: string;
    quantity: number;
    unit: string | null;
    expiration_date: string | null;
  }[];
  const items = (itemsResult.data ?? []) as {
    id: string;
    name: string;
    canonical_item_id: string | null;
  }[];
  const holds = (holdsResult.data ?? []) as {
    item_id: string;
    quantity: number;
    unit: string | null;
    week_start: string;
    day_index: number;
  }[];

  // Ingredient lines for every planned, un-made recipe day — the client
  // filters to upcoming days once it knows today's local date.
  const pendingRecipeIds = Array.from(
    new Set(
      meals
        .filter((meal) => meal.recipe_id !== null && meal.made_at === null)
        .map((meal) => meal.recipe_id as string),
    ),
  );
  let ingredientLines: {
    recipe_id: string;
    name: string;
    quantity_text: string;
    item_id: string | null;
  }[] = [];
  if (pendingRecipeIds.length > 0) {
    const linesResult = await supabase
      .from("recipe_ingredients")
      .select("recipe_id, name, quantity_text, item_id")
      .eq("household_id", householdId)
      .eq("on_shopping_list", true)
      .in("recipe_id", pendingRecipeIds);
    ingredientLines = (linesResult.data ?? []) as typeof ingredientLines;
  }

  return (
    <StatsView
      meals={meals}
      recipes={recipes}
      inventory={inventory}
      items={items}
      holds={holds}
      ingredientLines={ingredientLines}
    />
  );
}

export default function StatsPage() {
  return (
    <Suspense fallback={<StatsSkeleton />}>
      <StatsContent />
    </Suspense>
  );
}
