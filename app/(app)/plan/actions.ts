"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDal } from "@/lib/auth";
import { addManyGroceryItems } from "@/app/(app)/grocery/actions";
import { createRootLookup } from "@/lib/canonical";
import {
  fromOunces,
  parseQuantityText,
  splitNameAndQuantity,
  toOunces,
} from "@/lib/stock";
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
        // A recipe replaces any kind on the day.
        ...(parsed.data.recipeId !== null ? { kind: null } : {}),
        // A new recipe on a made day is not made yet.
        ...(changed ? { made_at: null } : {}),
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
        ...(replacesRecipe ? { recipe_id: null, made_at: null } : {}),
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
 * Blind per-root stock pools shared by planner shopping and the
 * mark-as-made preview: quantities summed across EVERY batch of a canonical
 * group (mixed units collapse the common unit to null, exactly like the
 * recipe editor). Holds are summed raw and the caller's skip rule excludes
 * the days being recomputed, so stock is never double-allocated.
 */
function poolStockAndHolds(
  inventoryRows: InventoryRow[],
  holdsRows: HoldRow[],
  rootOf: (itemId: string) => string,
  skipHold: (row: HoldRow) => boolean,
): {
  stockByRoot: Map<string, number>;
  stockUnitByRoot: Map<string, string | null>;
  heldByRoot: Map<string, number>;
} {
  const stockByRoot = new Map<string, number>();
  const stockUnitByRoot = new Map<string, string | null>();
  const stockUnitSeen = new Set<string>();
  for (const row of inventoryRows) {
    const root = rootOf(row.item_id);
    stockByRoot.set(root, (stockByRoot.get(root) ?? 0) + row.quantity);
    if (!stockUnitSeen.has(root)) {
      stockUnitSeen.add(root);
      stockUnitByRoot.set(root, row.unit);
    } else if (stockUnitByRoot.get(root) !== row.unit) {
      stockUnitByRoot.set(root, null);
    }
  }
  const heldByRoot = new Map<string, number>();
  for (const row of holdsRows) {
    if (skipHold(row)) continue;
    const root = rootOf(row.item_id);
    heldByRoot.set(root, (heldByRoot.get(root) ?? 0) + row.quantity);
  }
  return { stockByRoot, stockUnitByRoot, heldByRoot };
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
    const planDays = ((dayRows ?? []) as {
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

    const { stockByRoot, stockUnitByRoot, heldByRoot } = poolStockAndHolds(
      (inventoryResult.data ?? []) as InventoryRow[],
      (holdsResult.data ?? []) as HoldRow[],
      rootOf,
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

        // Coverage uses proper units: the oz-family converts exactly;
        // cans/cups/counts compare as plain quantities over the blind
        // per-root pool.
        const needed = toOunces(parsed.quantity, parsed.unit) ?? parsed.quantity;
        let reservePool = 0;
        if (ingredientRoot) {
          const haveRaw = stockByRoot.get(ingredientRoot) ?? 0;
          const commonUnit = stockUnitByRoot.get(ingredientRoot) ?? null;
          const have = toOunces(haveRaw, commonUnit) ?? haveRaw;
          const held = heldByRoot.get(ingredientRoot) ?? 0;
          const available = Math.max(0, have - held);
          reservePool = Math.min(available, needed);
        }
        if (reservePool > 0 && ingredientRoot) {
          const holdQty =
            parsed.unit != null
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
          heldByRoot.set(
            ingredientRoot,
            (heldByRoot.get(ingredientRoot) ?? 0) + reservePool,
          );
          reserved += 1;
        }
        // One count per meal per ingredient, even if a recipe lists it twice.
        if (needed - reservePool > 0 && !countedThisMeal.has(groupKey)) {
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
  /** Recipe unit — display only; availability is quantity-based like the recipe editor. */
  unit: string | null;
  needed: number;
  available: number;
  take: number;
  shortfall: number;
  /** Take in pool space (oz for weight recipes, raw otherwise) — what FEFO deducts. */
  takePool: number;
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

  // Blind per-root pools shared with planner shopping (poolStockAndHolds):
  // one number per ingredient across every batch and unit.
  const { stockByRoot, stockUnitByRoot, heldByRoot } = poolStockAndHolds(
    (inventoryResult.data ?? []) as InventoryRow[],
    (holdsResult.data ?? []) as HoldRow[],
    rootOf,
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
    // Oz-family weights convert exactly; everything else (cups, cans,
    // counts) is a plain quantity — the same comparison the recipe editor
    // makes. "2 cans" counts against any stock this ingredient's canonical
    // root has, whatever unit it was stored in.
    const neededRaw = parsed.quantity;
    const needed = toOunces(neededRaw, parsed.unit) ?? neededRaw;
    const haveRaw = rootId ? (stockByRoot.get(rootId) ?? 0) : 0;
    const commonUnit = rootId ? (stockUnitByRoot.get(rootId) ?? null) : null;
    const have = toOunces(haveRaw, commonUnit) ?? haveRaw;
    const held = rootId ? (heldByRoot.get(rootId) ?? 0) : 0;
    const available = Math.max(0, have - held);
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
    // cover, FEFO across the whole canonical group with no unit filter —
    // quantities are compared as plain numbers (recipe editor semantics; the
    // recipe's unit text is informational). Weight-unit batches convert
    // per-batch so an oz batch covers the right share of an "N lb" need;
    // anything else decrements raw. Optional ingredients are displayed but
    // never consumed.
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
        const take = Math.min(
          row.quantity,
          ozPerUnit != null ? remaining / ozPerUnit : remaining,
        );
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
        remaining -= take * (ozPerUnit != null ? ozPerUnit : 1);
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
