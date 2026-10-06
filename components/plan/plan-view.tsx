"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { dayLabel, addDays, mondayOf, weekTitle } from "@/lib/plan";
import { planWeekToGrocery } from "@/app/(app)/plan/actions";
import type { MealPlanDayRow } from "@/lib/types";
import { DaySheet } from "@/components/plan/day-sheet";

export type PlannedDay = {
  index: number;
  entry: MealPlanDayRow | null;
};

type Props = {
  /** null = no ?week= param yet; the client redirects with its local Monday. */
  weekStart: string | null;
  days: PlannedDay[];
  recipes: { id: string; name: string; time: number; tags: string[] }[];
};

export function PlanView({ weekStart, days, recipes }: Props) {
  const router = useRouter();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [shopping, setShopping] = useState(false);

  useEffect(() => {
    if (weekStart === null) {
      router.replace(`/plan?week=${mondayOf(new Date())}`);
    }
  }, [weekStart, router]);

  async function sendWeekToGrocery() {
    if (!weekStart) return;
    setShopping(true);
    const result = await planWeekToGrocery(weekStart);
    setShopping(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const { added, skipped } = result.data;
    toast.success(
      `${added} ingredient${added === 1 ? "" : "s"} added${skipped ? ` · ${skipped} already on the list` : ""}`,
    );
  }

  const openDay = openIndex !== null ? days[openIndex] : null;

  if (weekStart === null) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Meal plan</h1>
          <p className="text-xs text-muted-foreground">
            {weekTitle(weekStart)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void sendWeekToGrocery()}
            disabled={shopping}
          >
            {shopping ? <Loader2 className="animate-spin" /> : <ShoppingCart />}
            Shop this week
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border px-1 py-1">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href={`/plan?week=${addDays(weekStart, -7)}`} />}
          aria-label="Previous week"
        >
          <ChevronLeft />
        </Button>
        <Button variant="ghost" size="sm" render={<Link href="/plan" />}>
          This week
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href={`/plan?week=${addDays(weekStart, 7)}`} />}
          aria-label="Next week"
        >
          <ChevronRight />
        </Button>
      </div>

      <ul className="divide-y rounded-xl border bg-background">
        {days.map((day) => {
          const label = dayLabel(day.index, weekStart);
          const recipe = day.entry?.recipe_id
            ? recipes.find((entry) => entry.id === day.entry?.recipe_id)
            : null;
          const note = day.entry?.note ?? null;

          return (
            <li key={day.index}>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-accent/50"
                onClick={() => setOpenIndex(day.index)}
              >
                <span className="flex w-12 shrink-0 flex-col items-center rounded-lg border py-1">
                  <span className="text-[10px] font-medium uppercase text-muted-foreground">
                    {label.weekday}
                  </span>
                  <span className="text-sm font-semibold tabular-nums leading-tight">
                    {label.dayOfMonth}
                  </span>
                </span>

                <span className="min-w-0 flex-1">
                  {recipe ? (
                    <>
                      <span className="block truncate text-sm font-medium">
                        {recipe.name}
                      </span>
                      {recipe.time > 0 ? (
                        <span className="text-xs text-muted-foreground">
                          {recipe.time} min
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="block text-sm text-muted-foreground">
                      {note ? note : "Plan a meal"}
                    </span>
                  )}
                  {recipe && note ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {note}
                    </span>
                  ) : null}
                </span>

                <span className="text-xs text-muted-foreground">
                  {recipe || note ? "Edit" : "Add"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {recipes.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Create a recipe first —{" "}
          <Link href="/recipes/new" className="underline">
            new recipe
          </Link>
          .
        </div>
      ) : null}

      {openDay ? (
        <DaySheet
          key={openDay.index}
          weekStart={weekStart}
          day={openDay}
          recipes={recipes}
          onDone={() => setOpenIndex(null)}
        />
      ) : null}
    </div>
  );
}
