"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  Check,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Utensils,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToday } from "@/lib/use-now";
import { addDays, dateLabel, dayIndexOf, mondayOf } from "@/lib/plan";
import { tintFor } from "@/lib/tints";
import { Button } from "@/components/ui/button";
import { DayDialog, type RecipeOption } from "@/components/plan/day-dialog";
import { MadeConfirmDialog } from "@/components/plan/made-confirm";
import type { HomeMeal } from "@/lib/types";

/** Round tinted icon used by the dinners widgets (today = ChefHat, made = check). */
function MealIcon({
  iso,
  today,
  meal,
  recipe,
  onMark,
  size = "lg",
}: {
  iso: string;
  today: string;
  meal: HomeMeal | null;
  recipe: { name: string } | null;
  onMark: (event: {
    stopPropagation: () => void;
    preventDefault: () => void;
  }) => void;
  size?: "lg" | "sm";
}) {
  const tint = tintFor(recipe?.name ?? "");
  const box = size === "lg" ? "size-12" : "size-9";
  const icon = size === "lg" ? "h-7 w-7" : "h-4 w-4";
  const image = size === "lg" ? "h-9" : "h-5";

  if (iso === today && !meal?.made_at) {
    return (
      <span
        role="button"
        tabIndex={0}
        aria-label="Mark today's dinner as made"
        onClick={onMark}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            onMark(event);
          }
        }}
        className={cn(
          "relative flex shrink-0 cursor-pointer items-center justify-center rounded-full transition-shadow hover:ring-2 hover:ring-white/80",
          box,
          tint.dot,
        )}
      >
        <ChefHat className={cn(icon, "text-white")} />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full",
        box,
        tint.dot,
      )}
      aria-hidden
    >
      {meal?.made_at ? (
        <Check className={cn(icon, "text-white")} aria-label="Made" />
      ) : (
        <Image
          src="/knifefork2.svg"
          alt=""
          width={792}
          height={720}
          unoptimized
          className={cn(image, "w-auto select-none brightness-0 invert")}
        />
      )}
    </span>
  );
}

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
  const [confirmOpen, setConfirmOpen] = useState(false);

  function stopAndMark(event: {
    stopPropagation: () => void;
    preventDefault: () => void;
  }) {
    event.stopPropagation();
    event.preventDefault();
    setConfirmOpen(true);
  }

  // Rolling 7-day window that always leads with today.
  const start = useMemo(() => addDays(today, offset * 7), [today, offset]);
  const dates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(start, index)),
    [start],
  );

  const rangeStart = dateLabel(dates[0]);
  const rangeEnd = dateLabel(dates[dates.length - 1]);

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
          <span className="min-w-44 whitespace-nowrap text-center text-sm font-semibold text-muted-foreground">
            {`${rangeStart.weekday} ${rangeStart.month} ${rangeStart.dayOfMonth} - ${rangeEnd.weekday} ${rangeEnd.month} ${rangeEnd.dayOfMonth}`}
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

                    <span className="mt-2 flex">
                      <MealIcon
                        iso={iso}
                        today={today}
                        meal={meal}
                        recipe={recipe}
                        onMark={stopAndMark}
                      />
                    </span>
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

      <MadeConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        weekStart={mondayOf(new Date(`${today}T00:00:00Z`))}
        dayIndex={dayIndexOf(today)}
        recipeName={byDate.get(today)?.recipe?.name ?? null}
      />
    </section>
  );
}

/** Mobile-only 4-day glance: today + next 3, plan-page rows, widget icons. */
export function CompactDinners({
  meals,
  recipes,
}: {
  meals: HomeMeal[];
  recipes: RecipeOption[];
}) {
  const today = useToday();
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function stopAndMark(event: {
    stopPropagation: () => void;
    preventDefault: () => void;
  }) {
    event.stopPropagation();
    event.preventDefault();
    setConfirmOpen(true);
  }

  const dates = useMemo(
    () => Array.from({ length: 4 }, (_, index) => addDays(today, index)),
    [today],
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
    <section className="rounded-2xl border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Utensils className="h-4 w-4 text-primary" />
        <h2 className="text-base font-extrabold">This Week&apos;s Dinners</h2>
      </div>

      <ul className="divide-y rounded-xl border bg-background">
        {dates.map((iso) => {
          const label = dateLabel(iso);
          const meal = byDate.get(iso) ?? null;
          const recipe = meal?.recipe ?? null;
          const note = meal?.note ?? null;

          return (
            <li key={iso}>
              <button
                type="button"
                onClick={() => setOpenDate(iso)}
                className="flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors hover:bg-accent/50"
              >
                <span className="flex w-10 shrink-0 flex-col items-center rounded-lg border py-0.5">
                  <span className="text-[9px] font-semibold uppercase text-muted-foreground">
                    {label.weekday}
                  </span>
                  <span className="text-xs font-extrabold tabular-nums leading-tight">
                    {label.dayOfMonth}
                  </span>
                </span>

                {recipe ? (
                  <MealIcon
                    iso={iso}
                    today={today}
                    meal={meal}
                    recipe={recipe}
                    onMark={stopAndMark}
                    size="sm"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed bg-muted/40 text-muted-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                )}

                <span className="min-w-0 flex-1">
                  {recipe ? (
                    <>
                      <span className="block truncate text-sm font-semibold">
                        {recipe.name}
                      </span>
                      {note ? (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {note}
                        </span>
                      ) : recipe.time > 0 ? (
                        <span className="block text-[11px] text-muted-foreground">
                          {recipe.time} min
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="block truncate text-sm text-muted-foreground">
                      {note ? note : "Plan a meal"}
                    </span>
                  )}
                </span>

                {meal?.made_at ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    Made ✓
                  </span>
                ) : null}
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {recipe || note ? "Edit" : "Add"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-1.5 flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs font-semibold"
          onClick={() => setOpenDate(firstUnplanned)}
        >
          <Plus className="h-3.5 w-3.5" /> Plan
        </Button>
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

      <MadeConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        weekStart={mondayOf(new Date(`${today}T00:00:00Z`))}
        dayIndex={dayIndexOf(today)}
        recipeName={byDate.get(today)?.recipe?.name ?? null}
      />
    </section>
  );
}
