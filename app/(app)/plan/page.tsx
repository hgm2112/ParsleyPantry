import { Suspense } from "react";
import { requireDal } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PlanView,
  type PlannedDay,
  type WeekPlan,
} from "@/components/plan/plan-view";
import { addDays, isIsoDate, mondayOf } from "@/lib/plan";
import {
  buildRecipeCoverage,
  buildWeekSummary,
  emptyWeekSummary,
  type RecipeCoverage,
  type WeekSummary,
} from "@/lib/meal-summary";
import type { MealPlanDayRow, RecipeRow } from "@/lib/types";

export const metadata = { title: "Meal plan" };

function PlanSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-64" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-5 w-40" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 16 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

async function PlanContent({ weekStart }: { weekStart: string }) {
  const { supabase, householdId } = await requireDal();
  const week2Start = addDays(weekStart, 7);

  const [mealsResult, recipesResult] = await Promise.all([
    supabase
      .from("meal_plan_days")
      .select("*")
      .eq("household_id", householdId)
      .in("week_start", [weekStart, week2Start]),
    supabase
      .from("recipes")
      .select("id, name, time, tags, recipe_ingredients(id)")
      .eq("household_id", householdId)
      .order("name", { ascending: true }),
  ]);

  const meals = (mealsResult.data ?? []) as MealPlanDayRow[];

  const buildDays = (start: string): PlannedDay[] => {
    const byDay = new Map<number, MealPlanDayRow>(
      meals
        .filter((meal) => meal.week_start === start)
        .map((meal) => [meal.day_index, meal]),
    );
    return Array.from({ length: 7 }, (_, index) => ({
      index,
      entry: byDay.get(index) ?? null,
    }));
  };
  const week1Days = buildDays(weekStart);
  const week2Days = buildDays(week2Start);

  const recipes = (
    (recipesResult.data ?? []) as (Pick<
      RecipeRow,
      "id" | "name" | "time" | "tags"
    > & { recipe_ingredients: { id: string }[] })[]
  ).map(({ recipe_ingredients, ...recipe }) => ({
    ...recipe,
    hasIngredients: recipe_ingredients.length > 0,
  }));

  // Ingredient coverage per week: planned, un-made recipes only (matches shop).
  const weekDayLists = [week1Days, week2Days];
  const recipeIdsByWeek = weekDayLists.map(
    (days) =>
      new Set(
        days
          .map((day) =>
            day.entry?.recipe_id && !day.entry.made_at
              ? day.entry.recipe_id
              : null,
          )
          .filter((id): id is string => id !== null),
      ),
  );
  const allRecipeIds = Array.from(
    new Set(recipeIdsByWeek.flatMap((set) => Array.from(set))),
  );

  const summaries: Record<string, WeekSummary> = {
    [weekStart]: emptyWeekSummary(),
    [week2Start]: emptyWeekSummary(),
  };
  let coverageById: Record<string, RecipeCoverage> = {};
  if (allRecipeIds.length > 0) {
    const [ingredientsResult, inventoryResult, itemsResult] = await Promise.all([
      supabase
        .from("recipe_ingredients")
        .select("recipe_id, name, quantity_text, item_id")
        .eq("household_id", householdId)
        .eq("on_shopping_list", true)
        .in("recipe_id", allRecipeIds),
      supabase
        .from("inventory")
        .select("item_id, quantity, unit")
        .eq("household_id", householdId),
      supabase
        .from("items")
        .select("id, name, canonical_item_id")
        .eq("household_id", householdId),
    ]);

    const ingredientRows = (ingredientsResult.data ?? []) as {
      recipe_id: string;
      name: string;
      quantity_text: string;
      item_id: string | null;
    }[];
    const inventory = (inventoryResult.data ?? []) as {
      item_id: string;
      quantity: number;
      unit: string | null;
    }[];
    const items = (itemsResult.data ?? []) as {
      id: string;
      name: string;
      canonical_item_id: string | null;
    }[];

    for (let index = 0; index < 2; index += 1) {
      const start = index === 0 ? weekStart : week2Start;
      const ids = recipeIdsByWeek[index];
      const lines = ingredientRows
        .filter((row) => ids.has(row.recipe_id))
        .map((row) => ({
          name: row.name,
          quantityText: row.quantity_text,
          itemId: row.item_id,
        }));
      summaries[start] = buildWeekSummary(lines, inventory, items);
    }

    coverageById = Object.fromEntries(
      buildRecipeCoverage(
        ingredientRows.map((row) => ({
          recipeId: row.recipe_id,
          name: row.name,
          quantityText: row.quantity_text,
          itemId: row.item_id,
        })),
        inventory,
        items,
      ),
    );
  }

  const weeks: WeekPlan[] = [
    { start: weekStart, days: week1Days, summary: summaries[weekStart] },
    { start: week2Start, days: week2Days, summary: summaries[week2Start] },
  ];

  return (
    <PlanView
      weekStart={weekStart}
      weeks={weeks}
      recipes={recipes}
      coverageById={coverageById}
    />
  );
}

export default function PlanPage({
  searchParams,
}: PageProps<"/plan">) {
  return (
    <Suspense fallback={<PlanSkeleton />}>
      <PlanWrapper searchParams={searchParams} />
    </Suspense>
  );
}

async function PlanWrapper({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = typeof params.week === "string" ? params.week : "";
  if (!isIsoDate(raw)) {
    // No ?week= yet: the client redirects with its local Monday so the
    // server never reads wall-clock time during prerender.
    return (
      <PlanView weekStart={null} weeks={[]} recipes={[]} coverageById={{}} />
    );
  }
  const weekStart = mondayOf(new Date(`${raw}T00:00:00Z`));
  return <PlanContent weekStart={weekStart} />;
}
