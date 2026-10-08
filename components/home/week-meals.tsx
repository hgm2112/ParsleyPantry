"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Plus,
  Utensils,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useToday } from "@/lib/use-now";
import { addDays, dateLabel, dayIndexOf, mondayOf, weekTitle } from "@/lib/plan";
import { tintFor } from "@/lib/tints";
import { markMealMade } from "@/app/(app)/plan/actions";
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
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [madeBusy, setMadeBusy] = useState(false);

  async function quickMarkMade() {
    setMadeBusy(true);
    const result = await markMealMade({
      weekStart: mondayOf(new Date(`${today}T00:00:00Z`)),
      dayIndex: dayIndexOf(today),
    });
    setMadeBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Marked as made — pantry updated");
    router.refresh();
  }

  function stopAndMark(event: {
    stopPropagation: () => void;
    preventDefault: () => void;
  }) {
    event.stopPropagation();
    event.preventDefault();
    if (!madeBusy) void quickMarkMade();
  }

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
    <section className="flex h-full flex-col rounded-2xl border bg-card p-4 shadow-sm">
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

      <div className="grid flex-1 auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
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
                "group flex h-full flex-col overflow-hidden rounded-xl border p-3 text-left transition-shadow hover:shadow-sm",
                recipe
                  ? cn(tint.header, "hover:border-primary/50")
                  : "border-dashed bg-background",
              )}
            >
              {recipe ? (
                <>
                  <div className="flex flex-col items-center">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-extrabold uppercase">
                        {label.weekday}
                      </span>
                      <span className="text-xs opacity-70">
                        {label.month} {label.dayOfMonth}
                      </span>
                    </div>

                    {iso === today && !meal?.made_at ? (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="Mark today's dinner as made"
                        aria-disabled={madeBusy}
                        onClick={stopAndMark}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            stopAndMark(event);
                          }
                        }}
                        className={cn(
                          "relative mt-2 flex size-12 cursor-pointer items-center justify-center rounded-full transition-shadow hover:ring-2 hover:ring-white/80",
                          tint.dot,
                        )}
                      >
                        {madeBusy ? (
                          <Loader2 className="h-6 w-6 animate-spin text-white" />
                        ) : (
                          <ChefHat className="h-7 w-7 text-white" />
                        )}
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "relative mt-2 flex size-12 items-center justify-center rounded-full",
                          tint.dot,
                        )}
                        aria-hidden
                      >
                        {meal?.made_at ? (
                          <Check className="h-7 w-7 text-white" aria-label="Made" />
                        ) : (
                          <Image
                            src="/knifefork2.svg"
                            alt=""
                            width={792}
                            height={720}
                            unoptimized
                            className="h-9 w-auto select-none brightness-0 invert"
                          />
                        )}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-4 text-center text-xs font-extrabold leading-snug group-hover:text-primary">
                    {recipe.name}
                  </p>
                  {recipe.time > 0 ? (
                    <span className="mt-auto flex items-center justify-center gap-1 pt-1 text-[9px] opacity-70">
                      <Clock className="h-3 w-3" />
                      {recipe.time} min
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="flex items-baseline justify-center gap-1.5">
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
