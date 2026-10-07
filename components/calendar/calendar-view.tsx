"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { addDays, mondayOf } from "@/lib/plan";
import { useToday } from "@/lib/use-now";
import { foodEmoji, tileGradient } from "@/lib/tiles";
import type { MealPlanDayRow } from "@/lib/types";

export type CalendarMeal = MealPlanDayRow & {
  recipe: { id: string; name: string; time: number; tags: string[] } | null;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year ?? 2026, (monthNumber ?? 1) - 1, 1))
    .toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2026, (monthNumber ?? 1) - 1 + delta, 1));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function CalendarView({
  month,
  meals,
}: {
  month: string | null;
  meals: CalendarMeal[];
}) {
  const router = useRouter();
  const today = useToday();

  const effectiveMonth = month ?? today.slice(0, 7);

  useEffect(() => {
    if (month === null) {
      router.replace(`/calendar?month=${today.slice(0, 7)}`);
    }
  }, [month, today, router]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarMeal[]>();
    for (const meal of meals) {
      if (!meal.recipe) continue;
      const date = addDays(meal.week_start, meal.day_index);
      const list = map.get(date) ?? [];
      list.push(meal);
      map.set(date, list);
    }
    return map;
  }, [meals]);

  const days = useMemo(() => {
    const [year, monthNumber] = effectiveMonth.split("-").map(Number);
    const first = new Date(Date.UTC(year ?? 2026, (monthNumber ?? 1) - 1, 1));
    const startOffset = (first.getUTCDay() + 6) % 7;
    const gridStart = new Date(first);
    gridStart.setUTCDate(1 - startOffset);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setUTCDate(gridStart.getUTCDate() + index);
      const iso = date.toISOString().slice(0, 10);
      return {
        iso,
        day: date.getUTCDate(),
        inMonth: date.getUTCMonth() === first.getUTCMonth(),
        isToday: iso === today,
        meals: byDate.get(iso) ?? [],
      };
    });
  }, [effectiveMonth, byDate, today]);

  const todayWeek = mondayOf(new Date(`${today}T00:00:00Z`));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <CalendarDays className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Calendar</h1>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() =>
              router.push(
                `/calendar?month=${shiftMonth(effectiveMonth, -1)}`,
              )
            }
            className="rounded-full border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-40 text-center font-bold">
            {monthLabel(effectiveMonth)}
          </span>
          <button
            type="button"
            aria-label="Next month"
            onClick={() =>
              router.push(`/calendar?month=${shiftMonth(effectiveMonth, 1)}`)
            }
            className="rounded-full border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <Link
            href={`/calendar?month=${today.slice(0, 7)}`}
            className="rounded-full border px-3 py-1.5 text-sm font-medium text-primary hover:bg-accent"
          >
            Today
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card p-3 shadow-sm">
        <div className="grid min-w-[640px] grid-cols-7 gap-2">
          {WEEKDAYS.map((weekday) => (
            <div
              key={weekday}
              className="pb-1 text-center text-xs font-bold uppercase tracking-wide text-muted-foreground"
            >
              {weekday}
            </div>
          ))}

          {days.map((day) => {
            const weekStart = mondayOf(new Date(`${day.iso}T00:00:00Z`));
            return (
              <Link
                key={day.iso}
                href={`/plan?week=${weekStart}`}
                className={cn(
                  "flex min-h-28 flex-col rounded-xl border p-2 text-left transition-colors hover:border-primary/50 hover:bg-accent/40",
                  !day.inMonth && "bg-muted/30 opacity-60",
                  day.isToday && "border-primary bg-primary/5",
                  weekStart === todayWeek && day.inMonth && !day.isToday
                    ? "bg-emerald-50/50"
                    : "",
                )}
              >
                <span
                  className={cn(
                    "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                    day.isToday &&
                      "bg-primary font-bold text-primary-foreground",
                  )}
                >
                  {day.day}
                </span>

                <div className="space-y-1 overflow-hidden">
                  {day.meals.slice(0, 3).map((meal) => (
                    <span
                      key={`${meal.week_start}-${meal.day_index}`}
                      className={cn(
                        "flex items-center gap-1 truncate rounded-md bg-gradient-to-r px-1.5 py-0.5 text-[11px] font-medium text-foreground",
                        tileGradient(meal.recipe?.name ?? ""),
                      )}
                      title={meal.recipe?.name}
                    >
                      <span aria-hidden>
                        {foodEmoji(meal.recipe?.name ?? "", meal.recipe?.tags ?? [])}
                      </span>
                      <span className="truncate">{meal.recipe?.name}</span>
                    </span>
                  ))}
                  {day.meals.length > 3 ? (
                    <span className="block px-1.5 text-[11px] text-muted-foreground">
                      +{day.meals.length - 3} more
                    </span>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Click any day to open the meal plan for that week.
      </p>
    </div>
  );
}
