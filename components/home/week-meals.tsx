"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Utensils,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToday } from "@/lib/use-now";
import { addDays, dayLabel, mondayOf, weekTitle } from "@/lib/plan";
import { foodEmoji, tileGradient } from "@/lib/tiles";
import { Button } from "@/components/ui/button";
import type { MealPlanDayRow } from "@/lib/types";

export type HomeMeal = MealPlanDayRow & {
  recipe: { id: string; name: string; time: number; tags: string[] } | null;
};

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "dessert"];

function mealType(tags: string[]): string | null {
  for (const tag of tags) {
    const lowered = tag.toLowerCase();
    if (MEAL_TYPES.includes(lowered)) {
      return lowered[0].toUpperCase() + lowered.slice(1);
    }
  }
  return null;
}

const TYPE_CHIP: Record<string, string> = {
  Breakfast: "bg-amber-100 text-amber-800",
  Lunch: "bg-emerald-100 text-emerald-800",
  Dinner: "bg-violet-100 text-violet-800",
  Snack: "bg-sky-100 text-sky-800",
  Dessert: "bg-rose-100 text-rose-800",
};

export function WeekMeals({ meals }: { meals: HomeMeal[] }) {
  const today = useToday();
  const [offset, setOffset] = useState(0);

  const weekStart = useMemo(() => {
    const base = mondayOf(new Date(`${today}T00:00:00Z`));
    return offset === 0 ? base : addDays(base, offset * 7);
  }, [today, offset]);

  const weekEnd = addDays(weekStart, 6);
  const weekMeals = meals.filter(
    (meal) => meal.week_start >= weekStart && meal.week_start <= weekEnd,
  );
  const byDay = new Map<number, HomeMeal>(
    weekMeals.map((meal) => [meal.day_index, meal]),
  );

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Utensils className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">This Week&apos;s Meals</h2>
        <div className="mx-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => setOffset((value) => value - 1)}
            className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-36 text-center text-sm font-medium text-muted-foreground">
            {weekTitle(weekStart)}
          </span>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => setOffset((value) => value + 1)}
            className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <Button render={<Link href="/plan" />} size="sm">
          <Plus className="h-4 w-4" /> Add Meal
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }, (_, index) => {
          const label = dayLabel(index, weekStart);
          const meal = byDay.get(index) ?? null;
          const recipe = meal?.recipe ?? null;
          const type = recipe ? mealType(recipe.tags) : null;

          return (
            <Link
              key={index}
              href="/plan"
              className="group rounded-xl border bg-background p-3 transition-colors hover:border-primary/50 hover:shadow-sm"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold">{label.weekday}</span>
                <span className="text-xs text-muted-foreground">
                  {label.month} {label.dayOfMonth}
                </span>
              </div>

              {recipe ? (
                <>
                  <div
                    className={cn(
                      "mt-2 flex h-20 items-center justify-center rounded-lg bg-gradient-to-br text-4xl",
                      tileGradient(recipe.name),
                    )}
                  >
                    <span aria-hidden>{foodEmoji(recipe.name, recipe.tags)}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
                    {recipe.name}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {recipe.time > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {recipe.time} min
                      </span>
                    ) : null}
                    {type ? (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          TYPE_CHIP[type] ?? "bg-muted text-muted-foreground",
                        )}
                      >
                        {type}
                      </span>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="mt-2 flex h-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground transition-colors group-hover:border-primary/50 group-hover:text-primary">
                  <Plus className="h-4 w-4" />
                  <span className="text-xs font-medium">Plan</span>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
