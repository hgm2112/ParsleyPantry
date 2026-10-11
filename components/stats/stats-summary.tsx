"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronRight, Flame } from "lucide-react";
import {
  cookedDates,
  cookedOccurrences,
  cookingStreak,
  monthStart,
  noCookDates,
} from "@/lib/stats";
import { useToday } from "@/lib/use-now";
import type { MealPlanDayRow } from "@/lib/types";

/** Compact "Your Stats" card for the Home right-hand stack. */
export function StatsSummary({ meals }: { meals: MealPlanDayRow[] }) {
  const today = useToday();

  const stats = useMemo(() => {
    const allTime = cookedOccurrences(meals, { start: null, end: today });
    const monthStartIso = monthStart(today);
    const monthCount = cookedOccurrences(meals, {
      start: monthStartIso,
      end: today,
    }).length;
    const streak = cookingStreak(cookedDates(meals), today);
    const noCookDays = noCookDates(meals, { start: null, end: today }).size;
    return { total: allTime.length, monthCount, streak, noCookDays };
  }, [meals, today]);

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold">Your Stats</h2>
        <Link
          href="/stats"
          className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary hover:underline"
        >
          View All Stats <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <div>
          <p className="text-lg font-extrabold tabular-nums leading-none">
            {stats.total}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">Cooked</p>
        </div>
        <div>
          <p className="text-lg font-extrabold tabular-nums leading-none">
            {stats.monthCount}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">This month</p>
        </div>
        <div>
          <p className="inline-flex items-center gap-0.5 text-lg font-extrabold tabular-nums leading-none">
            {stats.streak}
            <Flame className="h-3.5 w-3.5 text-primary" />
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">Day streak</p>
        </div>
        <div>
          <p className="text-lg font-extrabold tabular-nums leading-none">
            {stats.noCookDays}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">No-cook</p>
        </div>
      </div>
    </section>
  );
}
