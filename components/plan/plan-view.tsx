"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ListChecks,
  ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { dayLabel, addDays, dateLabel, mondayOf } from "@/lib/plan";
import { dayTitle, isPlanned, mealKindInfo, NOTE_TINT } from "@/lib/meal-kind";
import { customMealIcon, BUILTIN_OTHER_MEALS } from "@/lib/custom-meal-icons";
import { tintFor } from "@/lib/tints";
import { useToday } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import {
  planDaysToGrocery,
} from "@/app/(app)/plan/actions";
import type { RecipeCoverage, WeekSummary } from "@/lib/meal-summary";
import type { CustomMealRow, MealPlanDayRow } from "@/lib/types";
import { DayDialog, type RecipeOption } from "@/components/plan/day-dialog";
import { MealIcon } from "@/components/plan/meal-icon";
import { ShopDaysDialog } from "@/components/plan/shop-days-dialog";
import {
  WeekIngredientsDialog,
  type WeekIngredientGroup,
} from "@/components/plan/week-ingredients-dialog";
import { RecipeIngredientsDialog } from "@/components/plan/recipe-ingredients-dialog";

export type PlannedDay = {
  index: number;
  entry: MealPlanDayRow | null;
};

export type WeekPlan = {
  start: string;
  days: PlannedDay[];
  summary: WeekSummary;
};

type Props = {
  /** null = no ?week= param yet; the client redirects with its local Monday. */
  weekStart: string | null;
  weeks: WeekPlan[];
  recipes: RecipeOption[];
  customMeals?: CustomMealRow[];
  /** Per-recipe pantry coverage ("6/9") for planned recipe days. */
  coverageById: Record<string, RecipeCoverage>;
};

type ShopResult = Awaited<ReturnType<typeof planDaysToGrocery>>;

/**
 * Whether a planned day's shopping is already done: the durable record left by
 * the last "Shop …" run, or — for days that predate that column — the live
 * shopping list already covering everything the pantry can't.
 */
function dayOnList(
  entry: MealPlanDayRow | null,
  coverage: RecipeCoverage | null,
): boolean {
  if (!entry || entry.made_at) return false;
  if (entry.shopped_at) return true;
  return Boolean(
    coverage && coverage.shoppable > 0 && coverage.onList >= coverage.shoppable,
  );
}

/** "Oct 13 – Oct 19" */
function weekRangeLabel(start: string): string {
  const a = dateLabel(start);
  const b = dateLabel(addDays(start, 6));
  return `${a.month} ${a.dayOfMonth} – ${b.month} ${b.dayOfMonth}`;
}

export function PlanView({ weekStart, weeks, recipes, customMeals = [], coverageById }: Props) {
  const router = useRouter();
  const today = useToday();
  const [openDay, setOpenDay] = useState<{
    weekStart: string;
    dayIndex: number;
  } | null>(null);
  const [shopping, setShopping] = useState(false);
  const [shopDialogOpen, setShopDialogOpen] = useState(false);
  const [ingredientRecipeId, setIngredientRecipeId] = useState<string | null>(
    null,
  );
  const [viewWeekStart, setViewWeekStart] = useState<string | null>(null);

  useEffect(() => {
    if (weekStart === null) {
      router.replace(`/plan?week=${mondayOf(new Date())}`);
    }
  }, [weekStart, router]);

  async function runShop(action: () => Promise<ShopResult>): Promise<boolean> {
    setShopping(true);
    const result = await action();
    setShopping(false);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    const { reserved, added, skipped } = result.data;
    toast.success(
      `${reserved} reserved from pantry · ${added} added${skipped ? ` · ${skipped} already on the list` : ""}`,
    );
    return true;
  }

  async function shopSelectedDays(
    days: { weekStart: string; dayIndex: number }[],
  ): Promise<boolean> {
    // Close only after a successful shop so an error toast can be followed
    // by an in-dialog retry.
    const ok = await runShop(() => planDaysToGrocery(days));
    if (ok) setShopDialogOpen(false);
    return ok;
  }

  if (weekStart === null || weeks.length === 0) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-9 w-full" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 16 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const windowStart = dateLabel(weekStart);
  const windowEnd = dateLabel(addDays(weekStart, 13));
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const customMealById = new Map(customMeals.map((meal) => [meal.id, meal]));

  const openWeek = openDay
    ? (weeks.find((week) => week.start === openDay.weekStart) ?? null)
    : null;
  const openDayEntry =
    openWeek && openDay
      ? (openWeek.days.find((day) => day.index === openDay.dayIndex) ?? null)
      : null;

  const viewWeek =
    viewWeekStart !== null
      ? (weeks.find((week) => week.start === viewWeekStart) ?? null)
      : null;

  const shopWeekGroups = weeks.map((week, index) => ({
    title: `Week ${index + 1}`,
    rangeLabel: weekRangeLabel(week.start),
    days: week.days.map((day) => {
      const label = dayLabel(day.index, week.start);
      const recipe = day.entry?.recipe_id
        ? (recipeById.get(day.entry.recipe_id) ?? null)
        : null;
      const customMeal =
        day.entry?.custom_meal_id
          ? (customMealById.get(day.entry.custom_meal_id) ?? null)
          : customMeals.find((meal) => meal.name === day.entry?.custom_meal_name) ??
            BUILTIN_OTHER_MEALS.find(
              (meal) => meal.name === day.entry?.custom_meal_name,
            ) ??
            null;
      const title = dayTitle(day.entry, recipe?.name ?? customMeal?.name);
      const made = Boolean(day.entry?.made_at);
      const planned = isPlanned(day.entry);
      return {
        weekStart: week.start,
        dayIndex: day.index,
        dateLabel: `${label.weekday} ${label.month} ${label.dayOfMonth}`,
        mealLabel: made
          ? `${title ?? "Meal"} · Made ✓`
          : (title ?? "Nothing planned"),
        enabled: planned && !made,
        shopped: dayOnList(
          day.entry,
          day.entry?.recipe_id
            ? (coverageById[day.entry.recipe_id] ?? null)
            : null,
        ),
      };
    }),
  }));

  // Sum of the per-recipe card counts for each week (a shared ingredient
  // counts once per recipe, matching what the cards show).
  const weekCoverage = weeks.map((week) =>
    week.days.reduce(
      (acc, day) => {
        const recipeId = day.entry?.recipe_id;
        if (!recipeId || day.entry?.made_at) return acc;
        const coverage = coverageById[recipeId];
        if (!coverage) return acc;
        acc.total += coverage.total;
        acc.inPantry += coverage.inPantry;
        return acc;
      },
      { total: 0, inPantry: 0 },
    ),
  );

  const viewWeekIngredientGroups: WeekIngredientGroup[] = viewWeek
    ? viewWeek.days
        .map((day) => {
          const recipeId = day.entry?.recipe_id;
          if (!recipeId || day.entry?.made_at) return null;
          const coverage = coverageById[recipeId];
          if (!coverage || coverage.total === 0) return null;
          return {
            recipeId,
            recipeName: recipeById.get(recipeId)?.name ?? "Recipe",
            coverage,
          };
        })
        .filter((group): group is WeekIngredientGroup => group !== null)
    : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold">Meal plan</h1>
          <p className="text-xs text-muted-foreground">
            {`${windowStart.weekday} ${windowStart.month} ${windowStart.dayOfMonth} – ${windowEnd.weekday} ${windowEnd.month} ${windowEnd.dayOfMonth}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShopDialogOpen(true)}
            disabled={shopping}
          >
            <ListChecks />
            Select days to shop
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

      {weeks.map((week, weekIndex) => (
        <section
          key={week.start}
          className={weekIndex > 0 ? "border-t pt-4" : undefined}
        >
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-extrabold">
              Week {weekIndex + 1}
              <span className="ml-2 font-normal text-muted-foreground">
                {weekRangeLabel(week.start)}
              </span>
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {week.days.map((day) => (
              <DayCard
                key={`${week.start}:${day.index}`}
                weekStart={week.start}
                day={day}
                recipeById={recipeById}
                customMeals={customMeals}
                today={today}
                coverageById={coverageById}
                onViewIngredients={setIngredientRecipeId}
                onOpen={(openWeekStart, dayIndex) =>
                  setOpenDay({ weekStart: openWeekStart, dayIndex })
                }
              />
            ))}
            <IngredientsTile
              summary={week.summary}
              coverage={weekCoverage[weekIndex] ?? { total: 0, inPantry: 0 }}
              onView={() => setViewWeekStart(week.start)}
            />
          </div>
        </section>
      ))}

      {recipes.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No recipes yet —{" "}
          <Link href="/recipes/new" className="underline">
            new recipe
          </Link>
          , or tap any day to plan eating out / no cooking.
        </div>
      ) : null}

      {openWeek && openDay && openDayEntry ? (
        <DayDialog
          key={`${openDay.weekStart}:${openDay.dayIndex}`}
          weekStart={openDay.weekStart}
          day={openDayEntry}
          recipes={recipes}
          customMeals={customMeals}
          onDone={() => setOpenDay(null)}
        />
      ) : null}

      {shopDialogOpen ? (
        <ShopDaysDialog
          open
          onOpenChange={(next) => {
            if (!next) setShopDialogOpen(false);
          }}
          weeks={shopWeekGroups}
          onShop={shopSelectedDays}
        />
      ) : null}

      {ingredientRecipeId && coverageById[ingredientRecipeId] ? (
        <RecipeIngredientsDialog
          open
          onOpenChange={(next) => {
            if (!next) setIngredientRecipeId(null);
          }}
          recipeName={recipeById.get(ingredientRecipeId)?.name ?? "Recipe"}
          coverage={coverageById[ingredientRecipeId]}
        />
      ) : null}

      {viewWeek ? (
        <WeekIngredientsDialog
          open
          onOpenChange={(next) => {
            if (!next) setViewWeekStart(null);
          }}
          rangeLabel={`Week ${weeks.indexOf(viewWeek) + 1} · ${weekRangeLabel(viewWeek.start)}`}
          groups={viewWeekIngredientGroups}
        />
      ) : null}
    </div>
  );
}

function DayCard({
  weekStart,
  day,
  recipeById,
  customMeals,
  today,
  coverageById,
  onOpen,
  onViewIngredients,
}: {
  weekStart: string;
  day: PlannedDay;
  recipeById: Map<string, RecipeOption>;
  customMeals: CustomMealRow[];
  today: string;
  coverageById: Record<string, RecipeCoverage>;
  onOpen: (weekStart: string, dayIndex: number) => void;
  onViewIngredients: (recipeId: string) => void;
}) {
  const label = dayLabel(day.index, weekStart);
  const iso = addDays(weekStart, day.index);
  const recipe = day.entry?.recipe_id
    ? (recipeById.get(day.entry.recipe_id) ?? null)
    : null;
  const customMeal =
    day.entry?.custom_meal_id
      ? customMeals.find((meal) => meal.id === day.entry?.custom_meal_id) ?? null
      : customMeals.find((meal) => meal.name === day.entry?.custom_meal_name) ??
        BUILTIN_OTHER_MEALS.find(
          (meal) => meal.name === day.entry?.custom_meal_name,
        ) ??
        null;
  const customIcon = customMeal ? customMealIcon(customMeal.icon) : null;
  const kindInfo = mealKindInfo(day.entry?.kind);
  const title = dayTitle(day.entry, recipe?.name ?? customMeal?.name);
  const note = day.entry?.note ?? null;
  const planned = isPlanned(day.entry);
  const tint = recipe
    ? tintFor(recipe.name)
    : kindInfo
      ? kindInfo.tint
      : NOTE_TINT;

  const coverage = recipe ? (coverageById[recipe.id] ?? null) : null;
  const showCoverage = Boolean(coverage && coverage.total > 0);
  const showTime = Boolean(recipe && recipe.time > 0);
  // Shopped is durable history when stamped; otherwise inferred from the live
  // list so days shopped before the column existed still read correctly.
  const shopped = dayOnList(day.entry, coverage);

  return (
    <div
      className={cn(
        "relative flex h-full min-h-24 flex-col rounded-xl border p-3 text-left transition-shadow hover:shadow-sm",
        planned
          ? cn(tint.header, "hover:border-primary/50")
          : "border-dashed bg-background",
      )}
    >
      <span className="flex items-baseline gap-1.5">
        <span className="text-xs font-extrabold uppercase">{label.weekday}</span>
        <span className="text-[11px] opacity-40" aria-hidden>
          |
        </span>
        <span className="text-[11px] font-bold uppercase opacity-70">
          {label.month} {label.dayOfMonth}
        </span>
        {shopped ? (
          <span
            className="ml-auto flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary"
            title="Ingredients added to your shopping list"
          >
            <ShoppingCart className="h-2.5 w-2.5" aria-hidden />
            On list
          </span>
        ) : null}
      </span>

      {planned ? (
        <span className="mt-2 flex items-center gap-2.5">
          <MealIcon
            iso={iso}
            today={today}
            meal={day.entry}
            recipe={recipe ? { name: recipe.name } : null}
            customIcon={customIcon}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold leading-snug">
              {title}
            </span>
            {showTime || showCoverage ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {showTime ? `${recipe?.time} min` : null}
                {showCoverage ? (
                  <>
                    {showTime ? " · " : null}
                    <button
                      type="button"
                      className={cn(
                        "relative z-10 -mx-1 rounded px-1 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-70",
                        coverage && coverage.inPantry >= coverage.total
                          ? "font-bold text-emerald-600 dark:text-emerald-300"
                          : undefined,
                      )}
                      onClick={() =>
                        recipe ? onViewIngredients(recipe.id) : undefined
                      }
                      aria-label={`View ingredients: ${coverage?.inPantry} of ${coverage?.total} available`}
                    >
                      {coverage?.inPantry}/{coverage?.total}
                    </button>
                  </>
                ) : null}
              </span>
            ) : null}
          </span>
        </span>
      ) : (
        <span className="mt-2 text-sm font-extrabold text-muted-foreground">
          Plan a meal
        </span>
      )}

      {note && note !== title ? (
        <span className="mt-auto line-clamp-2 pt-1 text-[11px] opacity-70">
          {note}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => onOpen(weekStart, day.index)}
        aria-label={`Open ${title ?? "meal"} for ${label.weekday}`}
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      />
    </div>
  );
}

function IngredientsTile({
  summary,
  coverage,
  onView,
}: {
  summary: WeekSummary;
  coverage: { total: number; inPantry: number };
  onView: () => void;
}) {
  const showCoverage = coverage.total > 0;
  return (
    <div className="flex h-full min-h-24 flex-col rounded-xl border bg-card p-3 shadow-sm">
      <span className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
        Ingredients
      </span>
      {!showCoverage ? (
        <span className="mt-2 text-xs text-muted-foreground">
          Plan a recipe day to build this list.
        </span>
      ) : (
        <>
          <button
            type="button"
            onClick={onView}
            aria-label={`View ingredients: ${coverage.inPantry} of ${coverage.total} available`}
            className="mt-1 self-start rounded text-base font-extrabold tabular-nums transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-70"
          >
            Have {coverage.inPantry}/{coverage.total}
          </button>
          <span className="text-xs text-muted-foreground">
            {summary.onShoppingList} on the shopping list
          </span>
        </>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="mt-auto h-7 self-start px-2 text-xs"
        onClick={onView}
      >
        View list
      </Button>
    </div>
  );
}
