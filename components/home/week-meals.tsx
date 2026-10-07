"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Utensils,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToday } from "@/lib/use-now";
import { addDays, dateLabel, dayIndexOf, mondayOf, weekTitle } from "@/lib/plan";
import { foodEmoji, tileGradient } from "@/lib/tiles";
import { Button } from "@/components/ui/button";
import { DayDialog, type RecipeOption } from "@/components/plan/day-dialog";
import type { HomeMeal } from "@/lib/types";

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

export function WeekMeals({
  meals,
  recipes,
}: {
  meals: HomeMeal[];
  recipes: RecipeOption[];
}) {
  const today = useToday();
  const [offset, setOffset] = useState(0);
  const [openDate, setOpenDate] = useState<string | null>(null);

  // Rolling 7-day window that always leads with today.
  const start = useMemo(() => addDays(today, offset * 7), [today, offset]);
  const dates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(start, index)),
    [start],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, HomeMeal>();
    for (const meal of meals) {
      map.set(addDays(meal.week_start, meal.day_index), meal);
    }
    return map;
  }, [meals]);

  const firstUnplanned = dates.find((iso) => !byDate.get(iso)?.recipe) ?? today;

  const openMeal = openDate ? (byDate.get(openDate) ?? null) : null;

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Utensils className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-extrabold">This Week&apos;s Meals</h2>
        <div className="mx-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous 7 days"
            onClick={() => setOffset((value) => value - 1)}
            className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-36 text-center text-sm font-semibold text-muted-foreground">
            {weekTitle(start)}
          </span>
          <button
            type="button"
            aria-label="Next 7 days"
            onClick={() => setOffset((value) => value + 1)}
            className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <Button size="sm" onClick={() => setOpenDate(firstUnplanned)}>
          <Plus className="h-4 w-4" /> Add Meal
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {dates.map((iso) => {
          const label = dateLabel(iso);
          const meal = byDate.get(iso) ?? null;
          const recipe = meal?.recipe ?? null;
          const type = recipe ? mealType(recipe.tags) : null;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => setOpenDate(iso)}
              className={cn(
                "group rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary/50 hover:shadow-sm",
                iso === today && "border-primary bg-primary/5",
              )}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-extrabold">{label.weekday}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {meal?.made_at ? (
                    <Check className="h-3.5 w-3.5 text-primary" aria-label="Made" />
                  ) : null}
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
                  <p className="mt-2 line-clamp-2 text-center text-sm font-semibold leading-snug group-hover:text-primary">
                    {recipe.name}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
                    {recipe.time > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {recipe.time} min
                      </span>
                    ) : null}
                    {type ? (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
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
                  <span className="text-xs font-semibold">Plan</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {openDate ? (
        <DayDialog
          key={openDate}
          weekStart={mondayOf(new Date(`${openDate}T00:00:00Z`))}
          day={{ index: dayIndexOf(openDate), entry: openMeal }}
          recipes={recipes}
          onDone={() => setOpenDate(null)}
        />
      ) : null}
    </section>
  );
}
