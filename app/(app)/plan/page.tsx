import { Suspense } from "react";
import { requireDal } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanView, type PlannedDay } from "@/components/plan/plan-view";
import { addDays, isIsoDate, mondayOf } from "@/lib/plan";
import type { MealPlanDayRow, RecipeRow } from "@/lib/types";

export const metadata = { title: "Meal plan" };

function PlanSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-64" />
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: 7 }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

async function PlanContent({ weekStart }: { weekStart: string }) {
  const { supabase, householdId } = await requireDal();
  const weekEnd = addDays(weekStart, 6);

  const [mealsResult, recipesResult] = await Promise.all([
    supabase
      .from("meal_plan_days")
      .select("*")
      .eq("household_id", householdId)
      .gte("week_start", weekStart)
      .lte("week_start", weekEnd),
    supabase
      .from("recipes")
      .select("id, name, time, tags")
      .eq("household_id", householdId)
      .order("name", { ascending: true }),
  ]);

  const meals = (mealsResult.data ?? []) as MealPlanDayRow[];
  const byDay = new Map<number, MealPlanDayRow>(
    meals.map((meal) => [meal.day_index, meal]),
  );

  const days: PlannedDay[] = Array.from({ length: 7 }, (_, index) => ({
    index,
    entry: byDay.get(index) ?? null,
  }));

  return (
    <PlanView
      weekStart={weekStart}
      days={days}
      recipes={(recipesResult.data ?? []) as Pick<
        RecipeRow,
        "id" | "name" | "time" | "tags"
      >[]}
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
    return <PlanView weekStart={null} days={[]} recipes={[]} />;
  }
  const weekStart = mondayOf(new Date(`${raw}T00:00:00Z`));
  return <PlanContent weekStart={weekStart} />;
}
