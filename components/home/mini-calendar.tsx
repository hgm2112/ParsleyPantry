"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToday } from "@/lib/use-now";
import { addDays } from "@/lib/plan";
import type { HomeMeal } from "@/components/home/week-meals";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function MiniCalendar({ meals }: { meals: HomeMeal[] }) {
  const today = useToday();

  const [cursor, setCursor] = useState(() => {
    const [year, month] = today.split("-").map(Number);
    return { year: year ?? 2026, month: (month ?? 1) - 1 };
  });

  /** Exact ISO dates with a planned recipe. */
  const plannedDates = useMemo(() => {
    const dates = new Set<string>();
    for (const meal of meals) {
      if (meal.recipe_id) dates.add(addDays(meal.week_start, meal.day_index));
    }
    return dates;
  }, [meals]);

  const days = useMemo(() => {
    const first = new Date(Date.UTC(cursor.year, cursor.month, 1));
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
        inMonth: date.getUTCMonth() === cursor.month,
        isToday: iso === today,
        hasMeal: plannedDates.has(iso),
      };
    });
  }, [cursor, plannedDates, today]);

  function stepMonth(delta: number) {
    setCursor((current) => {
      const date = new Date(Date.UTC(current.year, current.month + delta, 1));
      return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
    });
  }

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-bold">Calendar</h2>
        <Link
          href="/calendar"
          className="ml-auto text-sm font-medium text-primary hover:underline"
        >
          View full calendar →
        </Link>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => stepMonth(-1)}
          className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">
          {monthLabel(cursor.year, cursor.month)}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => stepMonth(1)}
          className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((weekday) => (
          <span
            key={weekday}
            className="py-1 text-[10px] font-semibold uppercase text-muted-foreground"
          >
            {weekday.slice(0, 1)}
          </span>
        ))}
        {days.map((day) => (
          <Link
            key={day.iso}
            href="/plan"
            className={cn(
              "relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors",
              day.inMonth ? "text-foreground" : "text-muted-foreground/50",
              day.isToday && "bg-primary font-semibold text-primary-foreground",
              !day.isToday && "hover:bg-accent",
            )}
          >
            {day.day}
            {day.hasMeal && !day.isToday ? (
              <span className="absolute bottom-0.5 size-1 rounded-full bg-primary" />
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}
