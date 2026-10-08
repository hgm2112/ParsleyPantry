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
                "group flex h-36 flex-col overflow-hidden rounded-xl border p-3 text-left transition-shadow hover:shadow-sm",
                recipe
                  ? cn(tint.header, "hover:border-primary/50")
                  : "border-dashed bg-background",
              )}
            >
              {recipe ? (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-extrabold uppercase">
                      {label.weekday}
                    </span>
                    <span className="text-xs opacity-70">
                      {label.month} {label.dayOfMonth}
                    </span>
                  </div>

                  <span
                    className={cn(
                      "relative mx-auto mt-2 flex size-9 items-center justify-center rounded-full",
                      tint.dot,
                    )}
                    aria-hidden
                  >
                    <Image
                      src="/knifefork2.svg"
                      alt=""
                      width={792}
                      height={720}
                      unoptimized
                      className="h-6 w-6 select-none brightness-0 invert"
                    />
                    {meal?.made_at ? (
                      <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-2.5 w-2.5" aria-label="Made" />
                      </span>
                    ) : null}
                  </span>
                  <p className="mt-2 line-clamp-2 min-h-8 text-center text-xs font-extrabold leading-snug group-hover:text-primary">
                    {recipe.name}
                  </p>
                  {recipe.time > 0 ? (
                    <span className="mt-1 flex items-center justify-center gap-1 text-[9px] opacity-70">
                      <Clock className="h-3 w-3" />
                      {recipe.time} min
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-extrabold uppercase">
                      {label.weekday}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {label.month} {label.dayOfMonth}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-1 flex-col items-center justify-center gap-1 text-muted-foreground transition-colors group-hover:text-primary">
                    <Plus className="h-4 w-4" />
                    <span className="text-xs font-semibold">Plan a meal</span>
                  </div>
                </>
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
