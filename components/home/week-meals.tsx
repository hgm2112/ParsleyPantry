"use client";

import Image from "next/image";
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
import { tintFor } from "@/lib/tints";
import { Button } from "@/components/ui/button";
import { DayDialog, type RecipeOption } from "@/components/plan/day-dialog";
import type { HomeMeal } from "@/lib/types";

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
        <h2 className="text-lg font-extrabold">This Week&apos;s Dinners</h2>
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
          const tint = tintFor(recipe?.name ?? "");

          return (
            <button
              key={iso}
              type="button"
              onClick={() => setOpenDate(iso)}
              className={cn(
                "group rounded-xl border p-3 text-left transition-shadow hover:shadow-sm",
                recipe
                  ? cn(tint.header, "hover:border-primary/50")
                  : "border-dashed bg-background",
              )}
            >
              {recipe ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-extrabold uppercase">
                      {label.weekday}
                    </span>
                    <span className="flex items-center gap-1 text-xs opacity-70">
                      {meal?.made_at ? (
                        <Check className="h-3.5 w-3.5" aria-label="Made" />
                      ) : null}
                      {label.month} {label.dayOfMonth}
                    </span>
                  </div>

                  <span
                    className={cn(
                      "mt-2 flex size-9 items-center justify-center rounded-full",
                      tint.dot,
                    )}
                    aria-hidden
                  >
                    <Image
                      src="/knifefork.svg"
                      alt=""
                      width={720}
                      height={720}
                      unoptimized
                      className="h-4 w-4 select-none brightness-0 invert"
                    />
                  </span>
                  <p className="mt-2 line-clamp-2 min-h-10 text-sm font-extrabold leading-snug group-hover:text-primary">
                    {recipe.name}
                  </p>
                  {recipe.time > 0 ? (
                    <span className="mt-1 inline-flex items-center gap-1 text-xs opacity-70">
                      <Clock className="h-3 w-3" />
                      {recipe.time} min
                    </span>
                  ) : null}
                </>
              ) : (
                <div className="flex h-full min-h-28 flex-col items-center justify-center gap-1 text-muted-foreground transition-colors group-hover:text-primary">
                  <div className="flex items-baseline justify-between self-stretch">
                    <span className="text-sm font-extrabold uppercase text-foreground">
                      {label.weekday}
                    </span>
                    <span className="text-xs">
                      {label.month} {label.dayOfMonth}
                    </span>
                  </div>
                  <Plus className="mt-4 h-4 w-4" />
                  <span className="text-xs font-semibold">Plan a meal</span>
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
