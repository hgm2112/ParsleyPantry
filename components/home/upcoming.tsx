"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CalendarClock, ChevronRight } from "lucide-react";
import { addDays, dayLabel, mondayOf } from "@/lib/plan";
import { useToday } from "@/lib/use-now";
import { daysUntil } from "@/lib/expiry";
import type { HomeMeal } from "@/components/home/week-meals";
import type { InventoryEntry } from "@/lib/types";

export function Upcoming({
  meals,
  pantry,
}: {
  meals: HomeMeal[];
  pantry: InventoryEntry[];
}) {
  const today = useToday();
  const weekStart = mondayOf(new Date(`${today}T00:00:00Z`));
  const todayIndex = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) /
      86_400_000,
  );

  const entries = useMemo(() => {
    const weekMeals = meals.filter(
      (meal) => meal.week_start >= weekStart && meal.week_start <= addDays(weekStart, 6),
    );
    const byDay = new Map(
      weekMeals.map((meal) => [meal.day_index, meal]),
    );

    const result: { label: string; text: string; href: string }[] = [];
    for (const offset of [0, 1]) {
      const index = todayIndex + offset;
      if (index < 0 || index > 6) continue;
      const meal = byDay.get(index) ?? null;
      const label =
        offset === 0
          ? "Today"
          : offset === 1
            ? "Tomorrow"
            : dayLabel(index, weekStart).weekday;
      result.push({
        label,
        text: meal?.recipe
          ? `${meal.recipe.name}${meal.recipe.tags[0] ? ` (${meal.recipe.tags[0]})` : ""}`
          : "Nothing planned",
        href: "/plan",
      });
    }

    const expiring = pantry.filter((row) => {
      const days = daysUntil(row.expiration_date);
      return days !== null && days >= 0 && days <= 3;
    });

    return { meals: result, expiring };
  }, [meals, pantry, weekStart, todayIndex]);

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">Upcoming</h2>
        <Link
          href="/calendar"
          className="ml-auto text-sm font-medium text-primary hover:underline"
        >
          View calendar →
        </Link>
      </div>

      <div className="space-y-3">
        {entries.meals.map((entry) => (
          <div key={entry.label}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {entry.label}
            </p>
            <Link
              href={entry.href}
              className="mt-0.5 flex items-center gap-1 text-sm hover:text-primary"
            >
              • {entry.text}
              <ChevronRight className="h-3 w-3 opacity-0 transition-opacity hover:opacity-100" />
            </Link>
          </div>
        ))}

        {entries.expiring.length > 0 ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Expiring soon
            </p>
            <ul className="mt-0.5 space-y-0.5">
              {entries.expiring.slice(0, 3).map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/inventory/${row.id}`}
                    className="block truncate text-sm hover:text-primary"
                  >
                    • {row.item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
