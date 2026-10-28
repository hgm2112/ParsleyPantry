"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDal } from "@/lib/auth";
import { addManyGroceryItems } from "@/app/(app)/grocery/actions";
import { createRootLookup } from "@/lib/canonical";
import {
  addNeed,
  buildPantryPools,
  demandBasis,
  emptyDemand,
  emptyPool,
  needFromParts,
  pantryNeed,
  type PantryDemand,
  type PantryNeed,
  type PantryPool,
  type PantryPools,
  type SummaryItemRow,
} from "@/lib/meal-summary";
import { fromOunces, parseQuantityText, splitNameAndQuantity, toOunces } from "@/lib/stock";
import { isIsoDate } from "@/lib/plan";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const dayKeySchema = z.object({
  weekStart: z.string().refine(isIsoDate, "Bad week"),
  dayIndex: z.number().int().min(0).max(6),
});

/**
 * Confirming a meal as made: day key plus the ingredient indices (order of
 * the preview's recipe_ingredients sort_order) the user selected for pantry
 * deduction. Absent = every eligible ingredient (legacy default).
 */
const madeMealSchema = dayKeySchema.extend({
  selected: z.array(z.number().int().min(0).max(99)).optional(),
});

const setMealSchema = dayKeySchema.extend({
  recipeId: z.string().uuid().nullable(),
});

const mealKindSchema = z.enum(["eating_out", "meal_kit", "no_cook"]);

const noteSchema = dayKeySchema.extend({
  note: z.string().trim().max(500),
  /** null/undefined = no kind (recipe day or plain note). */
  kind: mealKindSchema.nullable().optional(),
});

type Dal = Awaited<ReturnType<typeof requireDal>>;

/** Releases a day's stock reservations back into the available pool. */
async function releaseDayHolds(dal: Dal, weekStart: string, dayIndex: number) {
  await dal.supabase
    .from("stock_holds")
    .delete()
    .eq("household_id", dal.householdId)
    .eq("week_start", weekStart)
    .eq("day_index", dayIndex);
}

export async function setMealDay(
  input: z.input<typeof setMealSchema>,
): Promise<ActionResult> {
  try {
    const parsed = setMealSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid day" };
    const dal = await requireDal();

    const { data: existingRow } = await dal.supabase
      .from("meal_plan_days")
      .select("recipe_id")
      .eq("household_id", dal.householdId)
      .eq("week_start", parsed.data.weekStart)
      .eq("day_index", parsed.data.dayIndex)
      .maybeSingle();
    const existing = (existingRow as { recipe_id: string | null } | null)
      ?.recipe_id ?? null;
    const changed = existing !== parsed.data.recipeId;

    if (changed) await releaseDayHolds(dal, parsed.data.weekStart, parsed.data.dayIndex);

    const { error } = await dal.supabase.from("meal_plan_days").upsert(
      {
        household_id: dal.householdId,
        week_start: parsed.data.weekStart,
        day_index: parsed.data.dayIndex,
        recipe_id: parsed.data.recipeId,
        // A recipe replaces any kind/custom meal on the day.
        ...(parsed.data.recipeId !== null
          ? {
              kind: null,
              custom_meal_id: null,
              custom_meal_name: null,
              custom_meal_classification: null,
            }
          : {}),
        // A new recipe on a made day is not made yet.
        ...(changed ? { made_at: null, shopped_at: null } : {}),
      },
      { onConflict: "household_id,week_start,day_index" },
    );
    if (error) return { ok: false, error: error.message };

    revalidatePath("/plan");
    revalidatePath("/home");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update plan",
    };
  }
}

export async function saveMealNote(
  input: z.input<typeof noteSchema>,
): Promise<ActionResult> {
  try {
    const parsed = noteSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid note" };
    const dal = await requireDal();
    const kind = parsed.data.kind ?? null;

    const { data: existingRow } = await dal.supabase
      .from("meal_plan_days")
      .select("recipe_id")
      .eq("household_id", dal.householdId)
      .eq("week_start", parsed.data.weekStart)
      .eq("day_index", parsed.data.dayIndex)
      .maybeSingle();
    const existingRecipeId =
      (existingRow as { recipe_id: string | null } | null)?.recipe_id ?? null;
    // A kind replaces the recipe: drop it and release its reservations.
    const replacesRecipe = kind !== null && existingRecipeId !== null;
    if (replacesRecipe) {
      await releaseDayHolds(dal, parsed.data.weekStart, parsed.data.dayIndex);
    }

    const { error } = await dal.supabase.from("meal_plan_days").upsert(
      {
        household_id: dal.householdId,
        week_start: parsed.data.weekStart,
        day_index: parsed.data.dayIndex,
        note: parsed.data.note || null,
        kind,
        custom_meal_id: null,
        custom_meal_name: null,
        custom_meal_classification: null,
        ...(replacesRecipe ? { recipe_id: null, made_at: null, shopped_at: null } : {}),
      },
      { onConflict: "household_id,week_start,day_index" },
    );
    if (error) return { ok: false, error: error.message };

    revalidatePath("/plan");
    revalidatePath("/home");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save note",
    };
  }
}

export async function clearMealDay(
  input: z.input<typeof dayKeySchema>,
): Promise<ActionResult> {
  try {
    const parsed = dayKeySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid day" };
    const dal = await requireDal();

    await releaseDayHolds(dal, parsed.data.weekStart, parsed.data.dayIndex);

    const { error } = await dal.supabase
      .from("meal_plan_days")
      .delete()
      .eq("household_id", dal.householdId)
      .eq("week_start", parsed.data.weekStart)
      .eq("day_index", parsed.data.dayIndex);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/plan");
    revalidatePath("/home");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not clear day",
    };
  }
}



type ShopTarget = { weekStart: string; dayIndex: number };

type InventoryRow = { item_id: string; quantity: number; unit: string | null };
type HoldRow = {
  item_id: string;
  quantity: number;
  unit: string | null;
  week_start: string;
  day_index: number;
};

/**
 * Stock pools and holds shared by planner shopping and the mark-as-made
 * preview. Stock is pooled per canonical root with container sizes expanded
 * (see `buildPantryPools`); holds are pooled in the same two bases so a
 * reservation made from an "N lb" need subtracts pounds, not containers.
 * The caller's skip rule excludes the days being recomputed, so stock is
 * never double-allocated.
 */
function poolStockAndHolds(
  inventoryRows: InventoryRow[],
  holdsRows: HoldRow[],
  items: SummaryItemRow[],
  skipHold: (row: HoldRow) => boolean,
): {
  pools: PantryPools;
  heldByRoot: Map<string, PantryDemand>;
} {
  const pools = buildPantryPools(inventoryRows, items);
  const heldByRoot = new Map<string, PantryDemand>();
  for (const row of holdsRows) {
    if (skipHold(row)) continue;
    const root = pools.rootOf(row.item_id);
    const demand = heldByRoot.get(root) ?? emptyDemand();
    addNeed(demand, needFromParts(row.quantity, row.unit));
    heldByRoot.set(root, demand);
  }
  return { pools, heldByRoot };
}

/** Pool minus reservations, per basis, never negative. */
function availablePool(
  pools: PantryPools,
  heldByRoot: Map<string, PantryDemand>,
  rootId: string | null,
): PantryPool {
  if (!rootId) return emptyPool();
  const pool = pools.pools.get(rootId) ?? emptyPool();
  const held = heldByRoot.get(rootId);
  return {
    ounces: Math.max(0, pool.ounces - (held?.ounces ?? 0)),
    packages: Math.max(0, pool.packages - (held?.packages ?? 0)),
  };
}

/**
 * Reserves as much of `need` as the available pool can cover and reports the
 * reservation plus what is still missing — both in the need's own basis
 * (ounces for weights, container counts otherwise). The reservation is
 * recorded so later days and later ingredients see the reduced pool.
 */
function reserveFromPool(
  pools: PantryPools,
  heldByRoot: Map<string, PantryDemand>,
  rootId: string,
  need: PantryNeed,
): { reserved: number; shortfall: number; basis: "oz" | "count" } {
  const pool = availablePool(pools, heldByRoot, rootId);
  const demand = emptyDemand();
  addNeed(demand, need);
  const basis = demandBasis(demand);
  const wanted = basis === "oz" ? pool.ounces : pool.packages;
  const needed = basis === "oz" ? (need.ounces ?? 0) : need.packages;
  const reserved = Math.min(wanted, needed);
  // A weight need that finds no weight stock at all is "covered" by whatever
  // containers are on hand — nothing to reserve, nothing to buy.
  const shortfall =
    basis === "oz" && wanted <= 0 && pool.packages > 0
      ? 0
      : Math.max(0, needed - reserved);
  const hold = heldByRoot.get(rootId) ?? emptyDemand();
  if (basis === "oz") hold.ounces += reserved;
  else hold.packages += reserved;
  heldByRoot.set(rootId, hold);
  return { reserved, shortfall, basis };
}

/**
 * Pantry-first shopping: reserves what the target days' recipes can take from
 * current stock (holds per day+item, oldest days first). Coverage is
 * calculated with proper units (oz-family converts exactly; cans/cups/counts
 * compare as plain quantities) over blind per-root pools. The grocery list
 * gets ONE unitless line per uncovered ingredient whose quantity is the
 * NUMBER OF selected meals still needing it ("2 Ground Beef") — not a
 * combined weight. Made days are skipped; re-running wipes and recomputes
 * only the targeted days' holds — untargeted days keep theirs reserved so a
 * partial re-shop never double-dips the pantry.
 */
async function shopDays(
  targets: ShopTarget[],
  emptyError: string,
): Promise<ActionResult<{ reserved: number; added: number; skipped: number }>> {
  try {
    if (targets.length === 0) return { ok: false, error: emptyError };
    const { supabase, householdId } = await requireDal();

    const targetKeys = new Set(
      targets.map((target) => `${target.weekStart}:${target.dayIndex}`),
    );
    const weekStarts = Array.from(new Set(targets.map((target) => target.weekStart)));

    const { data: dayRows } = await supabase
      .from("meal_plan_days")
      .select("week_start, day_index, recipe_id, made_at")
      .eq("household_id", householdId)
      .in("week_start", weekStarts)
      .not("recipe_id", "is", null);

    type PlannedTargetDay = {
      week_start: string;
      day_index: number;
      recipe_id: string;
      made_at: null;
    };
    let planDays = ((dayRows ?? []) as {
      week_start: string;
      day_index: number;
      recipe_id: string | null;
      made_at: string | null;
    }[])
      .filter(
        (day): day is PlannedTargetDay =>
          targetKeys.has(`${day.week_start}:${day.day_index}`) &&
          day.recipe_id !== null &&
          day.made_at === null,
      )
      .sort((a, b) =>
        a.week_start === b.week_start
          ? a.day_index - b.day_index
          : a.week_start.localeCompare(b.week_start),
      );
    if (planDays.length === 0) {
      return { ok: false, error: emptyError };
    }

    const recipeIds = Array.from(new Set(planDays.map((day) => day.recipe_id)));
    const { data: recipeTypeRows } = await supabase
      .from("recipes")
      .select("id, recipe_type")
      .eq("household_id", householdId)
      .in("id", recipeIds);
    const noCookRecipeIds = new Set(
      (recipeTypeRows ?? [])
        .filter(
          (row: { id: string; recipe_type: string }) =>
            row.recipe_type === "no_cook",
        )
        .map((row: { id: string }) => row.id),
    );
    planDays = planDays.filter((day) => !noCookRecipeIds.has(day.recipe_id));
    if (planDays.length === 0) {
      return { ok: false, error: "Planned recipes have no cooking days" };
    }
    const { data: ingredientRows } = await supabase
      .from("recipe_ingredients")
      .select("name, item_id, quantity_text, on_shopping_list, recipe_id")
      .eq("household_id", householdId)
      .in("recipe_id", recipeIds);

    const ingredientsByRecipe = new Map<
      string,
      { name: string; item_id: string | null; quantity_text: string }[]
    >();
    for (const row of (ingredientRows ?? []) as {
      name: string;
      item_id: string | null;
      quantity_text: string;
      on_shopping_list: boolean;
      recipe_id: string;
    }[]) {
      if (!row.on_shopping_list) continue;
      const list = ingredientsByRecipe.get(row.recipe_id) ?? [];
      list.push(row);
      ingredientsByRecipe.set(row.recipe_id, list);
    }
    if (ingredientsByRecipe.size === 0) {
      return { ok: false, error: "Planned recipes have no ingredients yet" };
    }

    const [inventoryResult, holdsResult, itemsResult] = await Promise.all([
      supabase
        .from("inventory")
        .select("item_id, quantity, unit")
        .eq("household_id", householdId),
      supabase
        .from("stock_holds")
        .select("item_id, quantity, unit, week_start, day_index")
        .eq("household_id", householdId),
      supabase
        .from("items")
        .select("id, name, canonical_item_id")
        .eq("household_id", householdId),
    ]);

    // Stock and holds are pooled by canonical identity: every product under
    // one generic ingredient shares the same reservation pool.
    const catalogRows = (itemsResult.data ?? []) as {
      id: string;
      name: string;
      canonical_item_id: string | null;
    }[];
    const rootOf = createRootLookup(catalogRows);
    const nameToRoot = new Map<string, string>();
    for (const row of catalogRows) {
      nameToRoot.set(row.name.trim().toLowerCase(), rootOf(row.id));
    }

    const { pools, heldByRoot } = poolStockAndHolds(
      (inventoryResult.data ?? []) as InventoryRow[],
      (holdsResult.data ?? []) as HoldRow[],
      catalogRows,
      // Targeted days are being recomputed below.
      (row) => targetKeys.has(`${row.week_start}:${row.day_index}`),
    );

    // Recompute the targeted days' holds from scratch.
    for (const weekStart of weekStarts) {
      const dayIndexes = targets
        .filter((target) => target.weekStart === weekStart)
        .map((target) => target.dayIndex);
      const { error: wipeError } = await supabase
        .from("stock_holds")
        .delete()
        .eq("household_id", householdId)
        .eq("week_start", weekStart)
        .in("day_index", dayIndexes);
      if (wipeError) return { ok: false, error: wipeError.message };
    }

    const newHolds: {
      household_id: string;
      item_id: string;
      quantity: number;
      unit: string | null;
      week_start: string;
      day_index: number;
    }[] = [];
    // Grocery lines are MEAL COUNTS, unitless: one line per canonical
    // ingredient (or unmatched name) whose quantity is how many selected
    // meals still need it after pantry coverage ("2 Ground Beef") — not a
    // combined weight.
    const uncoveredMeals = new Map<string, number>();
    const lineNames = new Map<string, string>();
    let reserved = 0;

    for (const day of planDays) {
      const countedThisMeal = new Set<string>();
      for (const ingredient of ingredientsByRecipe.get(day.recipe_id) ?? []) {
        const parsed = parseQuantityText(ingredient.quantity_text);
        const bareName = splitNameAndQuantity(ingredient.name).name
          .trim()
          .toLowerCase();
        const ingredientRoot = ingredient.item_id
          ? rootOf(ingredient.item_id)
          : (nameToRoot.get(bareName) ?? null);
        // Unmatched ingredients group (and dedupe) by bare recipe name.
        const groupKey = ingredientRoot ?? `name:${bareName}`;
        if (!lineNames.has(groupKey)) lineNames.set(groupKey, ingredient.name);

        // Coverage compares each need in its own basis: weights in ounces
        // (container sizes expanded), everything else in container counts.
        const need = pantryNeed(ingredient.quantity_text);
        const reservation = ingredientRoot
          ? reserveFromPool(pools, heldByRoot, ingredientRoot, need)
          : { reserved: 0, shortfall: need.ounces ?? need.packages, basis: "count" as const };
        const { reserved: reservePool, shortfall } = reservation;
        if (reservePool > 0 && ingredientRoot) {
          const holdQty =
            reservation.basis === "oz" && parsed.unit != null
              ? (fromOunces(reservePool, parsed.unit) ?? reservePool)
              : reservePool;
          newHolds.push({
            household_id: householdId,
            item_id: ingredientRoot,
            quantity: holdQty,
            unit: parsed.unit,
            week_start: day.week_start,
            day_index: day.day_index,
          });
          reserved += 1;
        }
        // One count per meal per ingredient, even if a recipe lists it twice.
        if (shortfall > 0 && !countedThisMeal.has(groupKey)) {
          countedThisMeal.add(groupKey);
          uncoveredMeals.set(groupKey, (uncoveredMeals.get(groupKey) ?? 0) + 1);
        }
      }
    }

    const groceryInputs = Array.from(uncoveredMeals.entries()).map(
      ([groupKey, mealCount]) => ({
        itemId: groupKey.startsWith("name:") ? null : groupKey,
        name: lineNames.get(groupKey) ?? groupKey,
        quantity: mealCount,
        unit: null,
        source: "planner" as const,
      }),
    );

    if (newHolds.length > 0) {
      const { error: holdError } = await supabase
        .from("stock_holds")
        .insert(newHolds);
      if (holdError) return { ok: false, error: holdError.message };
    }

    let added = 0;
    let skipped = 0;
    if (groceryInputs.length > 0) {
      const result = await addManyGroceryItems(groceryInputs);
      if (!result.ok) return result;
      added = result.data.added;
      skipped = result.data.skipped;
    }

    // Record the shop per day — the only durable trace that a day was shopped
    // (grocery lines dedupe, get checked off, and can come from any source).
    // Only targeted recipe days survive into planDays, so custom meals, eating
    // out and no-cook days are never marked.
    const shoppedAt = new Date().toISOString();
    for (const weekStart of weekStarts) {
      const dayIndexes = planDays
        .filter((day) => day.week_start === weekStart)
        .map((day) => day.day_index);
      if (dayIndexes.length === 0) continue;
      const { error: shoppedError } = await supabase
        .from("meal_plan_days")
        .update({ shopped_at: shoppedAt })
        .eq("household_id", householdId)
        .eq("week_start", weekStart)
        .in("day_index", dayIndexes);
      if (shoppedError) return { ok: false, error: shoppedError.message };
    }

    revalidatePath("/plan");
    revalidatePath("/inventory");
    revalidatePath("/home");
    return { ok: true, data: { reserved, added, skipped } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not plan shopping",
    };
  }
}

/** Shops a whole week (all 7 days). Header button's "Shop this week". */
export async function planWeekToGrocery(
  weekStart: string,
): Promise<ActionResult<{ reserved: number; added: number; skipped: number }>> {
  if (!isIsoDate(weekStart)) return { ok: false, error: "Bad week" };
  return shopDays(
    Array.from({ length: 7 }, (_, dayIndex) => ({ weekStart, dayIndex })),
    "No meals left to shop for this week",
  );
}

const shopDaysSchema = z.array(dayKeySchema).min(1).max(14);

/**
 * Shops an arbitrary selection of planned days (≤14): this week, both weeks,
 * or a hand-picked subset — same pantry/dedupe semantics as the week action.
 */
export async function planDaysToGrocery(
  days: z.input<typeof shopDaysSchema>,
): Promise<ActionResult<{ reserved: number; added: number; skipped: number }>> {
  const parsed = shopDaysSchema.safeParse(days);
  if (!parsed.success) return { ok: false, error: "Invalid days" };
  const targets = new Map<string, ShopTarget>();
  for (const day of parsed.data) {
    targets.set(`${day.weekStart}:${day.dayIndex}`, day);
  }
  return shopDays(
    Array.from(targets.values()),
    "No meals left to shop for the selected days",
  );
}

type DayIngredientResolution = {
  error: string | null;
  recipeId: string | null;
  items: ResolvedIngredient[];
  groupByRoot: Map<string, string[]>;
};

type ResolvedIngredient = {
  name: string;
  quantityText: string;
  optional: boolean;
  /** Canonical root id; null = couldn't match the ingredient to the catalog. */
  rootId: string | null;
  /** Catalog name of the matched group (differs from the recipe name for branded items). */
  pantryName: string | null;
  /** Recipe unit — display only; availability is measured in the need's basis. */
  unit: string | null;
  needed: number;
  available: number;
  take: number;
  shortfall: number;
  /**
   * Take in pool space — ounces for weight needs, container counts for
   * everything else. This is the basis FEFO deducts in.
   */
  takePool: number;
  /** Which pool column `takePool` is measured in. */
  poolBasis: "oz" | "count";
};

/**
 * Recipe-driven pantry resolution for one planned day: loads EVERY saved
 * ingredient (shopping-list flag ignored) and pairs it with current stock via
 * the same matching as the recipe editor — item_id → canonical root, else
 * exact lowercase catalog-name match. Availability is quantity-based like the
 * editor: stock is pooled per canonical root across ALL batches and units
 * (oz-family weights still convert exactly; cups/cans/counts compare as plain
 * numbers). Unmatched names are reported, never dropped. Other days' active
 * holds reduce availability; this day's own holds don't (they exist for this
 * meal and are released on confirm). Read-only: opening the dialog never
 * reserves or deducts anything.
 */
async function resolveDayIngredients(
  supabase: Dal["supabase"],
  householdId: string,
  weekStart: string,
  dayIndex: number,
): Promise<DayIngredientResolution> {
  const empty: DayIngredientResolution = {
    error: null,
    recipeId: null,
    items: [],
    groupByRoot: new Map(),
  };

  const { data: dayRow, error: dayError } = await supabase
    .from("meal_plan_days")
    .select("recipe_id")
    .eq("household_id", householdId)
    .eq("week_start", weekStart)
    .eq("day_index", dayIndex)
    .maybeSingle();
  if (dayError) return { ...empty, error: dayError.message };
  const recipeId =
    (dayRow as { recipe_id: string | null } | null)?.recipe_id ?? null;
  if (!recipeId) return empty;

  const { data: recipeTypeRow } = await supabase
    .from("recipes")
    .select("recipe_type")
    .eq("household_id", householdId)
    .eq("id", recipeId)
    .maybeSingle();
  if (
    (recipeTypeRow as { recipe_type: string | null } | null)?.recipe_type === "no_cook"
  ) {
    return { ...empty, recipeId };
  }

  const [ingredientsResult, inventoryResult, holdsResult, itemsResult] =
    await Promise.all([
      supabase
        .from("recipe_ingredients")
        .select("name, item_id, quantity_text, optional, sort_order")
        .eq("household_id", householdId)
        .eq("recipe_id", recipeId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("inventory")
        .select("item_id, quantity, unit")
        .eq("household_id", householdId),
      supabase
        .from("stock_holds")
        .select("item_id, quantity, unit, week_start, day_index")
        .eq("household_id", householdId),
      supabase
        .from("items")
        .select("id, name, canonical_item_id")
        .eq("household_id", householdId),
    ]);
  if (ingredientsResult.error) {
    return { ...empty, recipeId, error: ingredientsResult.error.message };
  }

  const catalogRows = (itemsResult.data ?? []) as {
    id: string;
    name: string;
    canonical_item_id: string | null;
  }[];
  const rootOf = createRootLookup(catalogRows);
  const nameToRoot = new Map<string, string>();
  const nameById = new Map<string, string>();
  const groupByRoot = new Map<string, string[]>();
  for (const row of catalogRows) {
    const root = rootOf(row.id);
    nameToRoot.set(row.name.trim().toLowerCase(), root);
    nameById.set(row.id, row.name);
    const group = groupByRoot.get(root) ?? [];
    group.push(row.id);
    groupByRoot.set(root, group);
  }

  // Stock pools shared with planner shopping (poolStockAndHolds): weights in
  // ounces with container sizes expanded, everything else in container counts.
  const { pools, heldByRoot } = poolStockAndHolds(
    (inventoryResult.data ?? []) as InventoryRow[],
    (holdsResult.data ?? []) as HoldRow[],
    catalogRows,
    // This day's own holds exist for this meal — they don't reduce it.
    (row) => row.week_start === weekStart && row.day_index === dayIndex,
  );

  const round3 = (value: number) => Math.round(value * 1000) / 1000;

  const items: ResolvedIngredient[] = [];
  for (const row of (ingredientsResult.data ?? []) as {
    name: string;
    item_id: string | null;
    quantity_text: string;
    optional: boolean;
    sort_order: number;
  }[]) {
    const parsed = parseQuantityText(row.quantity_text);
    const rootId = row.item_id
      ? rootOf(row.item_id)
      : (nameToRoot.get(
          splitNameAndQuantity(row.name).name.trim().toLowerCase(),
        ) ?? null);
    // The need's own basis decides the comparison: "1 lb" against ounces in
    // stock, "2 cans" (or a bare "1") against container counts.
    const need = pantryNeed(row.quantity_text);
    const pool = availablePool(pools, heldByRoot, rootId);
    const basis = need.ounces != null ? "oz" : "count";
    const needed = basis === "oz" ? (need.ounces ?? 0) : need.packages;
    const available = basis === "oz" ? pool.ounces : pool.packages;
    const takePool = Math.min(available, needed);
    const shortfall = Math.max(0, needed - takePool);
    // Report in the recipe's own unit so the dialog reads "1 lb"/"2 cans".
    const toRecipe = (value: number) =>
      parsed.unit ? (fromOunces(value, parsed.unit) ?? value) : value;
    items.push({
      name: row.name,
      quantityText: row.quantity_text,
      optional: row.optional === true,
      rootId,
      pantryName: rootId ? (nameById.get(rootId) ?? null) : null,
      unit: parsed.unit,
      needed: round3(toRecipe(needed)),
      available: round3(toRecipe(available)),
      take: round3(toRecipe(takePool)),
      shortfall: round3(toRecipe(shortfall)),
      takePool: round3(takePool),
      poolBasis: basis,
    });
  }
  return { error: null, recipeId, items, groupByRoot };
}

/**
 * Confirms a meal was cooked: consumes what the day's RECIPE can take from
 * inventory (FEFO across the whole canonical group — batches of any unit,
 * weight chunks convert per-batch, never below zero), then releases the day's
 * stock holds — but only for the ingredient indices the user selected
 * (`selected`, in preview order; absent = every eligible one). Idempotent —
 * an already-made day returns success without deducting again. Shortfalls
 * never block recording.
 */
export async function markMealMade(
  input: z.input<typeof madeMealSchema>,
): Promise<ActionResult> {
  try {
    const parsed = madeMealSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid day" };
    // Indices are a filter only — every quantity is recomputed server-side.
    const wanted =
      parsed.data.selected == null
        ? null
        : new Set<number>(parsed.data.selected);
    const { supabase, householdId } = await requireDal();

    // Server-side double-submit guard: a retry after success must not
    // deduct a second time.
    const { data: existingRow } = await supabase
      .from("meal_plan_days")
      .select("made_at")
      .eq("household_id", householdId)
      .eq("week_start", parsed.data.weekStart)
      .eq("day_index", parsed.data.dayIndex)
      .maybeSingle();
    if ((existingRow as { made_at: string | null } | null)?.made_at) {
      return { ok: true, data: null };
    }

    const { error: markError } = await supabase
      .from("meal_plan_days")
      .update({ made_at: new Date().toISOString() })
      .eq("household_id", householdId)
      .eq("week_start", parsed.data.weekStart)
      .eq("day_index", parsed.data.dayIndex);
    if (markError) return { ok: false, error: markError.message };

    const resolved = await resolveDayIngredients(
      supabase,
      householdId,
      parsed.data.weekStart,
      parsed.data.dayIndex,
    );

    // Deduct only what the user selected AND the pantry can legitimately
    // cover, FEFO across the whole canonical group. The need's basis decides
    // how a batch is consumed: a weight need converts per batch (so a "6 oz"
    // can gives up exactly 6 oz), while a container need eats one container
    // per unit ("2 cans" takes two batches). Optional ingredients are
    // displayed but never consumed.
    for (const [index, ingredient] of resolved.items.entries()) {
      if (wanted && !wanted.has(index)) continue;
      if (!ingredient.rootId || ingredient.takePool <= 0) continue;
      if (ingredient.optional) continue;
      const groupIds =
        resolved.groupByRoot.get(ingredient.rootId) ?? [ingredient.rootId];
      const { data: rows, error: rowsError } = await supabase
        .from("inventory")
        .select("id, quantity, unit")
        .in("item_id", groupIds)
        .order("expiration_date", { ascending: true, nullsFirst: false });
      if (rowsError) return { ok: false, error: rowsError.message };

      let remaining = ingredient.takePool;
      for (const row of (rows ?? []) as {
        id: string;
        quantity: number;
        unit: string | null;
      }[]) {
        if (remaining <= 0) break;
        const ozPerUnit = toOunces(1, row.unit);
        let take: number;
        if (ingredient.poolBasis === "oz") {
          // Weight needs only consume weight batches.
          if (ozPerUnit == null) continue;
          take = Math.min(row.quantity, remaining / ozPerUnit);
        } else {
          take = Math.min(row.quantity, remaining);
        }
        if (take <= 0) continue;
        const nextQuantity = Math.round((row.quantity - take) * 1000) / 1000;
        if (nextQuantity <= 0) {
          // Empty batches are removed, not kept as 0-qty rows.
          const { error: deleteError } = await supabase
            .from("inventory")
            .delete()
            .eq("id", row.id);
          if (deleteError) return { ok: false, error: deleteError.message };
        } else {
          const { error: updateError } = await supabase
            .from("inventory")
            .update({ quantity: nextQuantity })
            .eq("id", row.id);
          if (updateError) return { ok: false, error: updateError.message };
        }
        remaining -=
          ingredient.poolBasis === "oz" ? take * (ozPerUnit ?? 0) : take;
      }
    }

    const { error: releaseError } = await supabase
      .from("stock_holds")
      .delete()
      .eq("household_id", householdId)
      .eq("week_start", parsed.data.weekStart)
      .eq("day_index", parsed.data.dayIndex);
    if (releaseError) return { ok: false, error: releaseError.message };

    revalidatePath("/plan");
    revalidatePath("/inventory");
    revalidatePath("/home");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not mark as made",
    };
  }
}

/**
 * Undoes "Mark as made": clears the completion timestamp. Pantry stock
 * consumed by the original confirmation is NOT restored (consumption isn't
 * logged); the day returns to planned.
 */
export async function unmarkMealMade(
  input: z.input<typeof dayKeySchema>,
): Promise<ActionResult> {
  try {
    const parsed = dayKeySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid day" };
    const { supabase, householdId } = await requireDal();

    const { error } = await supabase
      .from("meal_plan_days")
      .update({ made_at: null })
      .eq("household_id", householdId)
      .eq("week_start", parsed.data.weekStart)
      .eq("day_index", parsed.data.dayIndex);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/plan");
    revalidatePath("/home");
    revalidatePath("/stats");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not update the meal",
    };
  }
}

/**
 * Recipe-driven preview for the confirm dialog: every saved ingredient with
 * its pantry match and how much of it the pantry can cover. Read-only —
 * nothing is reserved or deducted until markMealMade confirms. Independent of
 * "Shop this week": no holds or grocery rows are read or written here.
 */
export async function previewMealMade(
  input: z.input<typeof dayKeySchema>,
): Promise<
  ActionResult<{
    items: {
      name: string;
      quantityText: string;
      optional: boolean;
      pantryName: string | null;
      matched: boolean;
      unit: string | null;
      needed: number;
      available: number;
      take: number;
      shortfall: number;
    }[];
  }>
> {
  try {
    const parsed = dayKeySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid day" };
    const { supabase, householdId } = await requireDal();

    const resolved = await resolveDayIngredients(
      supabase,
      householdId,
      parsed.data.weekStart,
      parsed.data.dayIndex,
    );
    if (resolved.error) return { ok: false, error: resolved.error };

    const items = resolved.items.map((ingredient) => ({
      name: ingredient.name,
      quantityText: ingredient.quantityText,
      optional: ingredient.optional,
      pantryName:
        ingredient.pantryName &&
        ingredient.pantryName.trim().toLowerCase() !==
          ingredient.name.trim().toLowerCase()
          ? ingredient.pantryName
          : null,
      matched: ingredient.rootId !== null,
      unit: ingredient.unit,
      needed: ingredient.needed,
      available: ingredient.available,
      take: ingredient.take,
      shortfall: ingredient.shortfall,
    }));
    return { ok: true, data: { items } };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not load the pantry impact",
    };
  }
}

const customMealIconIds = [
  "utensils",
  "pizza",
  "refrigerator",
  "sandwich",
  "package",
  "salad",
  "coffee",
  "house",
  "apple",
  "beef",
  "fish",
  "cake",
  "wine",
] as const;

const customMealIconSchema = z.enum(customMealIconIds);
const customMealClassificationSchema = z.enum(["cooking", "no_cook"]);

const customMealSchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: customMealIconSchema,
  classification: customMealClassificationSchema,
});

const saveCustomMealSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(80),
  icon: customMealIconSchema,
  classification: customMealClassificationSchema,
});

const deleteCustomMealSchema = z.object({
  id: z.string().uuid(),
});

const setCustomMealDaySchema = z.object({
  weekStart: z.string().refine(isIsoDate, "Bad week"),
  dayIndex: z.number().int().min(0).max(6),
  customMealId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(80),
  classification: customMealClassificationSchema,
  note: z.string().trim().max(500).optional().nullable(),
});

export async function saveCustomMeal(
  input: z.input<typeof saveCustomMealSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = saveCustomMealSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid custom meal" };
    const dal = await requireDal();

    if (parsed.data.id) {
      const { data: existing } = await dal.supabase
        .from("custom_meals")
        .select("id")
        .eq("household_id", dal.householdId)
        .eq("id", parsed.data.id)
        .maybeSingle();
      if (!existing) return { ok: false, error: "Custom meal not found" };
      const { error } = await dal.supabase
        .from("custom_meals")
        .update({
          name: parsed.data.name,
          icon: parsed.data.icon,
          classification: parsed.data.classification,
          updated_at: new Date().toISOString(),
        })
        .eq("household_id", dal.householdId)
        .eq("id", parsed.data.id);
      if (error) return { ok: false, error: error.message };
      revalidatePath("/plan");
      return { ok: true, data: { id: parsed.data.id } };
    }

    const { data, error } = await dal.supabase
      .from("custom_meals")
      .insert({
        household_id: dal.householdId,
        name: parsed.data.name,
        icon: parsed.data.icon,
        classification: parsed.data.classification,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Could not create custom meal" };
    revalidatePath("/plan");
    return { ok: true, data: { id: (data as { id: string }).id } };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not save custom meal",
    };
  }
}

export async function deleteCustomMeal(
  input: z.input<typeof deleteCustomMealSchema>,
): Promise<ActionResult> {
  try {
    const parsed = deleteCustomMealSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid custom meal" };
    const dal = await requireDal();
    const { error } = await dal.supabase
      .from("custom_meals")
      .delete()
      .eq("household_id", dal.householdId)
      .eq("id", parsed.data.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/plan");
    revalidatePath("/home");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not delete custom meal",
    };
  }
}

export async function setCustomMealDay(
  input: z.input<typeof setCustomMealDaySchema>,
): Promise<ActionResult<{ name: string }>> {
  try {
    const parsed = setCustomMealDaySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid day" };
    const dal = await requireDal();

    const customMealId = parsed.data.customMealId ?? null;
    let name = parsed.data.name;
    let classification = parsed.data.classification;

    if (customMealId) {
      const { data } = await dal.supabase
        .from("custom_meals")
        .select("id, name, classification")
        .eq("household_id", dal.householdId)
        .eq("id", customMealId)
        .maybeSingle();
      const row = data as
        | { id: string; name: string; classification: string }
        | null;
      if (!row) return { ok: false, error: "Custom meal not found" };
      name = row.name;
      classification =
        row.classification === "cooking" || row.classification === "no_cook"
          ? row.classification
          : parsed.data.classification;
    }

    const { data: existingRow } = await dal.supabase
      .from("meal_plan_days")
      .select("recipe_id")
      .eq("household_id", dal.householdId)
      .eq("week_start", parsed.data.weekStart)
      .eq("day_index", parsed.data.dayIndex)
      .maybeSingle();
    const existing =
      (existingRow as { recipe_id: string | null } | null)?.recipe_id ?? null;

    if (existing !== null) {
      await releaseDayHolds(dal, parsed.data.weekStart, parsed.data.dayIndex);
    }

    const { error } = await dal.supabase.from("meal_plan_days").upsert(
      {
        household_id: dal.householdId,
        week_start: parsed.data.weekStart,
        day_index: parsed.data.dayIndex,
        recipe_id: null,
        kind: null,
        note: parsed.data.note || null,
        custom_meal_id: customMealId,
        custom_meal_name: name,
        custom_meal_classification: classification,
        made_at: null,
        // A replaced meal has nothing left to shop for.
        shopped_at: null,
      },
      { onConflict: "household_id,week_start,day_index" },
    );
    if (error) return { ok: false, error: error.message };

    // The above conflict key is intentionally corrected below at runtime.
    revalidatePath("/plan");
    revalidatePath("/home");
    return { ok: true, data: { name } };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not save custom meal day",
    };
  }
}

