"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Flame, RotateCcw, ShoppingBasket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToday } from "@/lib/use-now";
import type { MealPlanDayRow } from "@/lib/types";
import {
  PERIODS,
  cookedBuckets,
  cookedDates,
  cookedOccurrences,
  cookingStreak,
  favoriteMeals,
  firstCookedByRecipe,
  isStatsPeriod,
  milestoneState,
  monthStart,
  mostActiveWeekday,
  newRecipesTried,
  noCookDates,
  pantrySnapshot,
  periodLabel,
  periodRange,
  planningStats,
  scheduledDate,
  type StatBucket,
  type StatsPeriod,
} from "@/lib/stats";

type Props = {
  meals: MealPlanDayRow[];
  recipes: { id: string; name: string }[];
  inventory: {
    item_id: string;
    quantity: number;
    unit: string | null;
    expiration_date: string | null;
  }[];
  items: { id: string; name: string; canonical_item_id: string | null }[];
  holds: {
    item_id: string;
    quantity: number;
    unit: string | null;
    week_start: string;
    day_index: number;
  }[];
  ingredientLines: {
    recipe_id: string;
    name: string;
    quantity_text: string;
    item_id: string | null;
  }[];
};

function fmtDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string | number;
  sub?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3 shadow-sm",
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums leading-none">
        {value}
      </p>
      {sub ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
      ) : null}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function BarChart({ buckets }: { buckets: StatBucket[] }) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div
        className="flex h-28 items-end gap-1"
        role="img"
        aria-label={`Meals cooked per period, total ${total}`}
      >
        {buckets.map((bucket, index) => (
          <div
            key={`${bucket.label}-${index}`}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
            title={`${bucket.label}: ${bucket.count}`}
          >
            <span className="text-[10px] font-bold tabular-nums text-muted-foreground">
              {bucket.count > 0 ? bucket.count : ""}
            </span>
            <div className="flex h-16 w-full items-end">
              <div
                className="w-full rounded-t bg-primary/80"
                style={{ height: `${Math.max(2, (bucket.count / max) * 100)}%` }}
              />
            </div>
            <span className="w-full truncate text-center text-[9px] text-muted-foreground">
              {bucket.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatsView({
  meals,
  recipes,
  inventory,
  items,
  holds,
  ingredientLines,
}: Props) {
  const today = useToday();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showAllFavorites, setShowAllFavorites] = useState(false);

  const periodParam = searchParams.get("period");
  const period: StatsPeriod =
    periodParam && isStatsPeriod(periodParam)
      ? (periodParam as StatsPeriod)
      : "all";

  const stats = useMemo(() => {
    const range = periodRange(period, today);
    const monthRange = { start: monthStart(today), end: today };

    const occurrences = cookedOccurrences(meals, range);
    const monthOccurrences = cookedOccurrences(meals, monthRange);
    const allTime = cookedOccurrences(meals, { start: null, end: today });
    const allDates = cookedDates(meals);
    const noCook = noCookDates(meals, range);
    const favorites = favoriteMeals(occurrences);
    const uniqueRecipes = new Set(
      occurrences.map((occ) => occ.recipeId).filter(Boolean),
    ).size;
    const buckets = cookedBuckets(occurrences, range, period);
    const activeDay = mostActiveWeekday(occurrences);
    const firstCooked = firstCookedByRecipe(meals);
    const newTried = newRecipesTried(firstCooked, range);
    const milestones = milestoneState(allTime.length);
    const planning = planningStats(meals, range, today);

    const periodDays =
      range.start === null
        ? Math.max(1, allTime.length > 0 ? daySpan(allTime[0].cookedOn, today) : 7)
        : daySpan(range.start, today) + 1;
    const weeksInPeriod = Math.max(1, periodDays / 7);
    const avgPerWeek = occurrences.length / weeksInPeriod;

    const recipeNames = new Map(recipes.map((recipe) => [recipe.id, recipe.name]));
    const itemNameById = new Map(items.map((item) => [item.id, item.name]));

    const upcomingRows = meals.filter(
      (meal) =>
        meal.recipe_id !== null &&
        meal.made_at === null &&
        meal.kind === null &&
        scheduledDate(meal) >= today,
    );
    const upcomingDayKeys = new Set(
      upcomingRows.map((meal) => `${meal.week_start}:${meal.day_index}`),
    );
    const upcomingRecipeIds = new Set(
      upcomingRows.map((meal) => meal.recipe_id as string),
    );
    const upcomingLines = ingredientLines
      .filter((line) => upcomingRecipeIds.has(line.recipe_id))
      .map((line) => ({
        name: line.name,
        quantityText: line.quantity_text,
        itemId: line.item_id,
      }));
    const snapshot = pantrySnapshot({
      inventory: inventory.map((row) => ({
        ...row,
        item_name: itemNameById.get(row.item_id) ?? "Item",
      })),
      holds,
      upcomingDayKeys,
      upcomingLines,
      items,
      today,
    });

    return {
      range,
      occurrences,
      monthCount: monthOccurrences.length,
      allTimeCount: allTime.length,
      streak: cookingStreak(allDates, today),
      noCookCount: noCook.size,
      favorites,
      uniqueRecipes,
      buckets,
      activeDay,
      newTried,
      newTriedNames: newTried
        .map((id) => recipeNames.get(id) ?? "Recipe")
        .slice(0, 6),
      milestones,
      planning,
      avgPerWeek,
      recipeNames,
      snapshot,
    };
  }, [meals, recipes, items, holds, ingredientLines, period, today]);

  function setPeriod(value: StatsPeriod) {
    router.replace(`/stats?period=${value}`, { scroll: false });
  }

  const favoriteLimit = showAllFavorites ? stats.favorites.length : 5;
  const coveragePct =
    stats.snapshot.coverage && stats.snapshot.coverage.total > 0
      ? Math.round(
          (stats.snapshot.coverage.covered / stats.snapshot.coverage.total) * 100,
        )
      : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold">Stats</h1>
          <p className="text-xs text-muted-foreground">
            Showing {periodLabel(period).toLowerCase()} · cooked meals use each
            confirmation date
          </p>
        </div>
        <div role="radiogroup" aria-label="Period" className="inline-flex overflow-hidden rounded-md border">
          {PERIODS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={period === value}
              onClick={() => setPeriod(value)}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold",
                period === value
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Meals cooked"
          value={stats.occurrences.length}
          sub={periodLabel(period)}
        />
        <StatCard
          label="Meals this month"
          value={stats.monthCount}
          sub="Current calendar month"
        />
        <StatCard
          label="Unique recipes"
          value={stats.uniqueRecipes}
          sub={periodLabel(period)}
        />
        <StatCard
          label="Cooking streak"
          value={stats.streak}
          sub={stats.streak === 1 ? "day in a row" : "days in a row"}
        />
        <StatCard
          label="No Cooking Days"
          value={stats.noCookCount}
          sub={`${periodLabel(period)} · planned non-cook days`}
          className="border-dashed bg-muted/30"
        />
      </div>

      {/* Favorites */}
      <Section title="Your Favorite Meals">
        {stats.favorites.length === 0 ? (
          <EmptyHint>
            Cook a meal and mark it made — favorites will build up here as
            meals are cooked.
          </EmptyHint>
        ) : (
          <ol className="divide-y rounded-xl border bg-card shadow-sm">
            {stats.favorites.slice(0, favoriteLimit).map((fav, index) => (
              <li key={fav.recipeId} className="flex items-center gap-3 px-3 py-2">
                <span className="w-5 shrink-0 text-center text-xs font-extrabold tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <Link
                  href={`/recipes/${fav.recipeId}`}
                  className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline"
                >
                  {stats.recipeNames.get(fav.recipeId) ?? "Recipe"}
                </Link>
                <span className="shrink-0 text-xs font-bold tabular-nums">
                  {fav.count}×
                </span>
                <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">
                  last {fmtDate(fav.lastCooked)}
                </span>
              </li>
            ))}
          </ol>
        )}
        {stats.favorites.length > 5 ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setShowAllFavorites((prev) => !prev)}
          >
            {showAllFavorites ? "Show top 5" : `Show all ${stats.favorites.length}`}
            <ChevronRight className={cn("h-3.5 w-3.5", showAllFavorites && "rotate-90")} />
          </Button>
        ) : null}
      </Section>

      {/* Cooking habits */}
      <Section title="Cooking Habits">
        {stats.occurrences.length === 0 ? (
          <EmptyHint>
            No cooked meals in this period yet — mark a planned meal as made
            and it will show up here.
          </EmptyHint>
        ) : (
          <div className="space-y-3">
            <BarChart buckets={stats.buckets} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="Avg per week"
                value={stats.avgPerWeek.toFixed(1)}
                sub={periodLabel(period)}
              />
              <StatCard
                label="Most active day"
                value={stats.activeDay?.label ?? "—"}
                sub={
                  stats.activeDay
                    ? `${stats.activeDay.count} cooked`
                    : "No data yet"
                }
              />
              <StatCard
                label="Different recipes"
                value={stats.uniqueRecipes}
                sub="Cooked this period"
              />
              <StatCard
                label="New recipes tried"
                value={stats.newTried.length}
                sub={
                  stats.newTriedNames.length > 0
                    ? stats.newTriedNames.join(", ")
                    : "First cooks in this period"
                }
              />
            </div>
            <div className="rounded-xl border bg-card p-3 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Milestones · {stats.allTimeCount} meals cooked all-time
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {stats.milestones.achieved.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    Your first milestone is 25 meals cooked.
                  </span>
                ) : (
                  stats.milestones.achieved.map((level) => (
                    <span
                      key={level}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary"
                    >
                      <Flame className="h-3 w-3" /> {level}
                    </span>
                  ))
                )}
                {stats.milestones.next !== null ? (
                  <span className="text-xs text-muted-foreground">
                    {stats.milestones.next - stats.allTimeCount} to your{" "}
                    {stats.milestones.next}-meal milestone
                  </span>
                ) : null}
              </div>
              {stats.milestones.next !== null ? (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.round(stats.milestones.progress * 100)}%`,
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        )}
      </Section>

      {/* Meal planning */}
      <Section title="Meal Planning">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Meals planned"
            value={stats.planning.planned}
            sub={periodLabel(period)}
          />
          <StatCard
            label="Completed"
            value={stats.planning.cooked}
            sub="Planned meals marked made"
          />
          <StatCard
            label="No Cooking"
            value={stats.planning.noCook}
            sub="Planned non-cook entries"
            className="border-dashed bg-muted/30"
          />
          <StatCard
            label="Weeks with plans"
            value={stats.planning.weeksWithPlans}
            sub={periodLabel(period)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {stats.planning.completionRate !== null ? (
            <>
              <span className="font-bold text-foreground">
                {Math.round(stats.planning.completionRate * 100)}%
              </span>{" "}
              of past home-cooking plans completed (
              {stats.planning.completedPast} of{" "}
              {stats.planning.completedPast + stats.planning.unresolvedPast}).
              Eating out ({stats.planning.eatingOut}) and meal kits (
              {stats.planning.mealKit}) aren&apos;t counted as misses.
            </>
          ) : (
            <>Not enough past home-cooking plans yet for a completion rate.</>
          )}
        </p>
        {stats.planning.mostPlanned.length > 0 ? (
          <ol className="divide-y rounded-xl border bg-card shadow-sm">
            {stats.planning.mostPlanned.slice(0, 5).map((entry, index) => (
              <li key={entry.recipeId} className="flex items-center gap-3 px-3 py-2">
                <span className="w-5 shrink-0 text-center text-xs font-extrabold tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <Link
                  href={`/recipes/${entry.recipeId}`}
                  className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline"
                >
                  {stats.recipeNames.get(entry.recipeId) ?? "Recipe"}
                </Link>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  planned {entry.planned}× · cooked {entry.cooked}×
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyHint>Plan a few meals to see your most-planned recipes.</EmptyHint>
        )}
      </Section>

      {/* Pantry insights */}
      <Section title="Pantry Insights">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            label="Expiring soon"
            value={stats.snapshot.expiringSoonCount}
            sub="Within 3 days"
          />
          <StatCard
            label="Expired"
            value={stats.snapshot.expiredCount}
            sub="Past expiration date"
          />
          <StatCard
            label="Planned demand covered"
            value={
              coveragePct !== null ? `${coveragePct}%` : "—"
            }
            sub={
              stats.snapshot.coverage
                ? `${stats.snapshot.coverage.covered} of ${stats.snapshot.coverage.total} upcoming ingredient lines on hand`
                : "No upcoming planned recipes"
            }
          />
        </div>
        {stats.snapshot.expiringSoonNames.length > 0 ||
        stats.snapshot.expiredNames.length > 0 ? (
          <div className="rounded-xl border bg-card p-3 text-xs shadow-sm">
            <p className="flex items-center gap-1.5 font-semibold">
              <ShoppingBasket className="h-3.5 w-3.5 text-muted-foreground" />
              Heads up
            </p>
            <p className="mt-1 text-muted-foreground">
              {stats.snapshot.expiredNames.length > 0
                ? `Expired: ${stats.snapshot.expiredNames.join(", ")}${
                    stats.snapshot.expiredCount > stats.snapshot.expiredNames.length
                      ? ` +${stats.snapshot.expiredCount - stats.snapshot.expiredNames.length} more`
                      : ""
                  }. `
                : ""}
              {stats.snapshot.expiringSoonNames.length > 0
                ? `Expiring soon: ${stats.snapshot.expiringSoonNames.join(", ")}${
                    stats.snapshot.expiringSoonCount >
                    stats.snapshot.expiringSoonNames.length
                      ? ` +${stats.snapshot.expiringSoonCount - stats.snapshot.expiringSoonNames.length} more`
                      : ""
                  }.`
                : ""}
            </p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Coverage uses your pantry&apos;s canonical ingredient pools with
              stock reserved for other planned days set aside.{" "}
              <RotateCcw className="inline h-3 w-3" /> Ingredient consumption
              isn&apos;t tracked yet, so usage stats aren&apos;t shown.
            </p>
          </div>
        ) : null}
        {coveragePct !== null ? (
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${coveragePct}%` }}
            />
          </div>
        ) : null}
      </Section>
    </div>
  );
}

/** Whole-day span between two local ISO dates, inclusive of neither end. */
function daySpan(start: string, end: string): number {
  const [ay, am, ad] = start.split("-").map(Number);
  const [by, bm, bd] = end.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
  );
}
