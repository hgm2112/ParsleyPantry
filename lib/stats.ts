import { addDays, mondayOf } from "@/lib/plan";
import { isPlanned } from "@/lib/meal-kind";
import {
  buildPantryPools,
  resolveLine,
  type PantryPools,
  type SummaryIngredient,
  type SummaryInventoryRow,
  type SummaryItemRow,
} from "@/lib/meal-summary";
import { stockPoolKey, toOunces } from "@/lib/stock";
import type { MealPlanDayRow } from "@/lib/types";

export type StatsPeriod = "all" | "year" | "90" | "30";

export const PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "year", label: "This year" },
  { value: "90", label: "Last 90 days" },
  { value: "30", label: "Last 30 days" },
];

export function periodLabel(period: StatsPeriod): string {
  return PERIODS.find((entry) => entry.value === period)?.label ?? "All time";
}

export function isStatsPeriod(value: string | null | undefined): boolean {
  return value === "all" || value === "year" || value === "90" || value === "30";
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local calendar date (YYYY-MM-DD) of a JS Date — never UTC-shifted. */
export function localIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local calendar date of a stored timestamptz (completion timestamps). */
export function localDateOfTimestamp(value: string): string {
  return localIso(new Date(value));
}

/** Scheduled calendar date of a meal_plan_day row. */
export function scheduledDate(row: Pick<MealPlanDayRow, "week_start" | "day_index">): string {
  return addDays(row.week_start, row.day_index);
}

/** Inclusive date range: start null = all time; end = today (local). */
export type DateRange = { start: string | null; end: string };

export function periodRange(period: StatsPeriod, today: string): DateRange {
  if (period === "all") return { start: null, end: today };
  if (period === "year") return { start: `${today.slice(0, 4)}-01-01`, end: today };
  const days = period === "90" ? 89 : 29;
  return { start: addDays(today, -days), end: today };
}

function inRange(iso: string, range: DateRange): boolean {
  if (range.start !== null && iso < range.start) return false;
  return iso <= range.end;
}

export type CookedOccurrence = {
  weekStart: string;
  dayIndex: number;
  recipeId: string | null;
  cookedOn: string;
};

/**
 * Completed home-cooked occurrences: made_at set AND no non-cooking kind.
 * Filtered by the LOCAL date of the completion timestamp.
 */
export function cookedOccurrences(
  meals: MealPlanDayRow[],
  range: DateRange,
): CookedOccurrence[] {
  const out: CookedOccurrence[] = [];
  for (const row of meals) {
    if (!row.made_at || row.kind !== null) continue;
    const cookedOn = localDateOfTimestamp(row.made_at);
    if (!inRange(cookedOn, range)) continue;
    out.push({
      weekStart: row.week_start,
      dayIndex: row.day_index,
      recipeId: row.recipe_id,
      cookedOn,
    });
  }
  return out;
}

/** All-time set of local dates with at least one cooked occurrence. */
export function cookedDates(meals: MealPlanDayRow[]): Set<string> {
  const dates = new Set<string>();
  for (const row of meals) {
    if (!row.made_at || row.kind !== null) continue;
    dates.add(localDateOfTimestamp(row.made_at));
  }
  return dates;
}

/**
 * Consecutive local dates ending today (or yesterday, if today isn't cooked
 * yet) with ≥1 home-cooked meal. No-cooking entries never extend a streak.
 */
export function cookingStreak(allCookedDates: Set<string>, today: string): number {
  let cursor = allCookedDates.has(today) ? today : addDays(today, -1);
  if (!allCookedDates.has(cursor)) return 0;
  let streak = 0;
  while (allCookedDates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Distinct scheduled dates explicitly marked No Cooking in range. */
export function noCookDates(meals: MealPlanDayRow[], range: DateRange): Set<string> {
  const dates = new Set<string>();
  for (const row of meals) {
    if (row.kind !== "no_cook") continue;
    const iso = scheduledDate(row);
    if (inRange(iso, range)) dates.add(iso);
  }
  return dates;
}

export type FavoriteMeal = {
  recipeId: string;
  count: number;
  lastCooked: string;
};

/** Cooked occurrences per recipe, ranked by count then recency. */
export function favoriteMeals(occurrences: CookedOccurrence[]): FavoriteMeal[] {
  const byRecipe = new Map<string, FavoriteMeal>();
  for (const occ of occurrences) {
    if (!occ.recipeId) continue;
    const entry = byRecipe.get(occ.recipeId) ?? {
      recipeId: occ.recipeId,
      count: 0,
      lastCooked: occ.cookedOn,
    };
    entry.count += 1;
    if (occ.cookedOn > entry.lastCooked) entry.lastCooked = occ.cookedOn;
    byRecipe.set(occ.recipeId, entry);
  }
  return Array.from(byRecipe.values()).sort(
    (a, b) => b.count - a.count || b.lastCooked.localeCompare(a.lastCooked),
  );
}

function monthLabel(yearMonth: string, withYear: boolean): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const label = new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "short",
  });
  return withYear ? `${label} '${String(year).slice(2)}` : label;
}

/** Monday (YYYY-MM-DD) of the week containing the given local date. */
function mondayIso(iso: string): string {
  return mondayOf(new Date(`${iso}T00:00:00Z`));
}

function weekLabel(mondayIso: string): string {
  const date = new Date(`${mondayIso}T00:00:00Z`);
  const month = date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${month} ${date.getUTCDate()}`;
}

export type StatBucket = { label: string; count: number };

/** Meals cooked per week (30/90-day) or per month (year/all-time). */
export function cookedBuckets(
  occurrences: CookedOccurrence[],
  range: DateRange,
  period: StatsPeriod,
): StatBucket[] {
  const weekly = period === "30" || period === "90";
  const withYear = period === "all";

  if (weekly) {
    const start = mondayIso(range.start ?? range.end);
    const end = mondayIso(range.end);
    const buckets: StatBucket[] = [];
    const index = new Map<string, number>();
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 7)) {
      index.set(cursor, buckets.length);
      buckets.push({ label: weekLabel(cursor), count: 0 });
    }
    for (const occ of occurrences) {
      const slot = index.get(mondayIso(occ.cookedOn));
      if (slot !== undefined) buckets[slot].count += 1;
    }
    return buckets;
  }

  const endKey = range.end.slice(0, 7);
  const firstOccurrence = occurrences.reduce<string | null>(
    (min, occ) => (min === null || occ.cookedOn < min ? occ.cookedOn : min),
    null,
  );
  const startKey = (range.start ?? firstOccurrence ?? range.end).slice(0, 7);
  const buckets: StatBucket[] = [];
  const index = new Map<string, number>();
  let [year, month] = startKey.split("-").map(Number);
  for (;;) {
    const key = `${year}-${pad(month)}`;
    index.set(key, buckets.length);
    buckets.push({ label: monthLabel(key, withYear), count: 0 });
    if (key === endKey) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (buckets.length > 120) break; // safety cap for far-future clocks
  }
  for (const occ of occurrences) {
    const slot = index.get(occ.cookedOn.slice(0, 7));
    if (slot !== undefined) buckets[slot].count += 1;
  }
  return buckets;
}

export type WeekdayStat = { label: string; count: number };

/** Most active weekday (Mon-first) from cooked local dates. */
export function mostActiveWeekday(occurrences: CookedOccurrence[]): WeekdayStat | null {
  const counts = new Array<number>(7).fill(0);
  for (const occ of occurrences) {
    const [year, month, day] = occ.cookedOn.split("-").map(Number);
    const jsDay = new Date(year, month - 1, day).getDay();
    counts[(jsDay + 6) % 7] += 1;
  }
  let best = 0;
  for (let index = 1; index < 7; index += 1) {
    if (counts[index] > counts[best]) best = index;
  }
  if (counts[best] === 0) return null;
  return { label: WEEKDAYS[best], count: counts[best] };
}

/** Earliest-ever cooked local date per recipe (full history). */
export function firstCookedByRecipe(meals: MealPlanDayRow[]): Map<string, string> {
  const first = new Map<string, string>();
  for (const row of meals) {
    if (!row.made_at || row.kind !== null || !row.recipe_id) continue;
    const cookedOn = localDateOfTimestamp(row.made_at);
    const current = first.get(row.recipe_id);
    if (!current || cookedOn < current) first.set(row.recipe_id, cookedOn);
  }
  return first;
}

/** Recipes whose FIRST ever cooked occurrence falls inside the range. */
export function newRecipesTried(
  firstCooked: Map<string, string>,
  range: DateRange,
): string[] {
  const out: string[] = [];
  for (const [recipeId, first] of firstCooked) {
    if (inRange(first, range)) out.push(recipeId);
  }
  return out;
}

export function milestoneState(allTimeCooked: number): {
  achieved: number[];
  next: number | null;
  progress: number;
} {
  const levels = [25, 50, 100, 250, 500];
  const achieved = levels.filter((level) => allTimeCooked >= level);
  const next = levels.find((level) => level > allTimeCooked) ?? null;
  const previous = achieved[achieved.length - 1] ?? 0;
  const progress =
    next !== null
      ? Math.min(1, (allTimeCooked - previous) / (next - previous))
      : 1;
  return { achieved, next, progress };
}

export type PlannedRecipeStat = {
  recipeId: string;
  planned: number;
  cooked: number;
};

export type PlanningStats = {
  planned: number;
  cooked: number;
  noCook: number;
  eatingOut: number;
  mealKit: number;
  /** Past-due home-cooking plans (kind-less) that were completed. */
  completedPast: number;
  /** Past-due home-cooking plans with no recorded outcome. */
  unresolvedPast: number;
  /** completedPast / (completedPast + unresolvedPast); null when no denominator. */
  completionRate: number | null;
  weeksWithPlans: number;
  mostPlanned: PlannedRecipeStat[];
};

/** Planned-vs-cooked stats by SCHEDULED date in range. */
export function planningStats(
  meals: MealPlanDayRow[],
  range: DateRange,
  today: string,
): PlanningStats {
  let planned = 0;
  let cooked = 0;
  let noCook = 0;
  let eatingOut = 0;
  let mealKit = 0;
  let completedPast = 0;
  let unresolvedPast = 0;
  const weeks = new Set<string>();
  const byRecipe = new Map<string, PlannedRecipeStat>();

  for (const row of meals) {
    if (!isPlanned(row)) continue;
    const iso = scheduledDate(row);
    if (!inRange(iso, range)) continue;
    planned += 1;
    weeks.add(row.week_start);

    if (row.kind === "no_cook") noCook += 1;
    else if (row.kind === "eating_out") eatingOut += 1;
    else if (row.kind === "meal_kit") mealKit += 1;
    else {
      // Home-cooking intent (recipe day or plain note).
      if (row.made_at) {
        cooked += 1;
        if (iso < today) completedPast += 1;
      } else if (iso < today) {
        unresolvedPast += 1;
      }
    }

    if (row.recipe_id) {
      const entry = byRecipe.get(row.recipe_id) ?? {
        recipeId: row.recipe_id,
        planned: 0,
        cooked: 0,
      };
      entry.planned += 1;
      if (row.made_at && row.kind === null) entry.cooked += 1;
      byRecipe.set(row.recipe_id, entry);
    }
  }

  const denominator = completedPast + unresolvedPast;
  return {
    planned,
    cooked,
    noCook,
    eatingOut,
    mealKit,
    completedPast,
    unresolvedPast,
    completionRate: denominator > 0 ? completedPast / denominator : null,
    weeksWithPlans: weeks.size,
    mostPlanned: Array.from(byRecipe.values()).sort(
      (a, b) => b.planned - a.planned || b.cooked - a.cooked,
    ),
  };
}

export type PantryHold = {
  item_id: string;
  quantity: number;
  unit: string | null;
  week_start: string;
  day_index: number;
};

export type PantrySnapshot = {
  expiredCount: number;
  expiringSoonCount: number;
  expiredNames: string[];
  expiringSoonNames: string[];
  /** Covered lines / total upcoming planned ingredient lines; null = no demand. */
  coverage: { covered: number; total: number } | null;
};

function subtractPool(
  stock: Map<string, number>,
  pools: PantryPools,
  row: { item_id: string; quantity: number; unit: string | null },
) {
  const oz = toOunces(row.quantity, row.unit);
  const q = oz != null ? oz : row.quantity;
  const u = oz != null ? "oz" : row.unit;
  const key = stockPoolKey(pools.rootOf(row.item_id), u);
  stock.set(key, (stock.get(key) ?? 0) - q);
}

/**
 * Current pantry snapshot (not period-filtered): expiry counts via the app's
 * daysUntil rules, plus canonical coverage of upcoming planned ingredient
 * demand with holds on other days subtracted (reservations respected).
 */
export function pantrySnapshot(input: {
  inventory: (SummaryInventoryRow & {
    expiration_date: string | null;
    item_name: string;
  })[];
  holds: PantryHold[];
  upcomingDayKeys: Set<string>;
  upcomingLines: SummaryIngredient[];
  items: SummaryItemRow[];
  today: string;
}): PantrySnapshot {
  let expiredCount = 0;
  let expiringSoonCount = 0;
  const expiredNames: string[] = [];
  const expiringSoonNames: string[] = [];

  for (const row of input.inventory) {
    if (!row.expiration_date) continue;
    const days = daysBetween(input.today, row.expiration_date);
    if (days < 0) {
      expiredCount += 1;
      if (expiredNames.length < 8) expiredNames.push(row.item_name);
    } else if (days <= 3) {
      expiringSoonCount += 1;
      if (expiringSoonNames.length < 8) expiringSoonNames.push(row.item_name);
    }
  }

  let coverage: PantrySnapshot["coverage"] = null;
  if (input.upcomingLines.length > 0) {
    const pools = buildPantryPools(input.inventory, input.items);
    const stock = new Map(pools.stock);
    for (const hold of input.holds) {
      if (input.upcomingDayKeys.has(`${hold.week_start}:${hold.day_index}`)) {
        continue; // reserved for the demand set itself
      }
      subtractPool(stock, pools, hold);
    }

    const needByPool = new Map<string, number>();
    const resolvedByPool = new Map<string, boolean>();
    let covered = 0;
    for (const line of input.upcomingLines) {
      const { poolKey, quantity, resolved } = resolveLine(line, pools);
      needByPool.set(poolKey, (needByPool.get(poolKey) ?? 0) + quantity);
      resolvedByPool.set(poolKey, resolved);
    }
    for (const line of input.upcomingLines) {
      const { poolKey } = resolveLine(line, pools);
      const resolved = resolvedByPool.get(poolKey) ?? false;
      const have = resolved ? (stock.get(poolKey) ?? 0) : 0;
      const need = needByPool.get(poolKey) ?? 0;
      if (resolved && have >= need - 1e-6) covered += 1;
    }
    coverage = { covered, total: input.upcomingLines.length };
  }

  return { expiredCount, expiringSoonCount, expiredNames, expiringSoonNames, coverage };
}

/** Whole-day difference b - a (local calendar dates, no timezones). */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ms =
    Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86_400_000);
}

/** Start of the current local calendar month. */
export function monthStart(today: string): string {
  return `${today.slice(0, 7)}-01`;
}
