"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDal } from "@/lib/auth";
import { addManyGroceryItems } from "@/app/(app)/grocery/actions";
import { fromOunces, parseQuantityText, stockPoolKey, toOunces } from "@/lib/stock";
import { addDays, isIsoDate } from "@/lib/plan";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const dayKeySchema = z.object({
  weekStart: z.string().refine(isIsoDate, "Bad week"),
  dayIndex: z.number().int().min(0).max(6),
});

const setMealSchema = dayKeySchema.extend({
  recipeId: z.string().uuid().nullable(),
});

const noteSchema = dayKeySchema.extend({
  note: z.string().trim().max(500),
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
    const { supabase, householdId } = await requireDal();

    const { error } = await supabase.from("meal_plan_days").upsert(
      {
        household_id: householdId,
        week_start: parsed.data.weekStart,
        day_index: parsed.data.dayIndex,
        note: parsed.data.note || null,
      },
      { onConflict: "household_id,week_start,day_index" },
    );
    if (error) return { ok: false, error: error.message };

    revalidatePath("/plan");
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



/**
 * Pantry-first shopping: reserves what the week's recipes can take from
 * current stock (holds per day+item, oldest days first) and sends only the
 * shortfall to the grocery list. Made days are skipped; re-running wipes and
 * recomputes the week's holds.
 */
export async function planWeekToGrocery(
  weekStart: string,
): Promise<ActionResult<{ reserved: number; added: number; skipped: number }>> {
  try {
    if (!isIsoDate(weekStart)) return { ok: false, error: "Bad week" };
    const { supabase, householdId } = await requireDal();

    const weekEnd = addDays(weekStart, 6);
    const { data: dayRows } = await supabase
      .from("meal_plan_days")
      .select("day_index, recipe_id, made_at")
      .eq("household_id", householdId)
      .gte("week_start", weekStart)
      .lte("week_start", weekEnd)
      .not("recipe_id", "is", null);

    const planDays = ((dayRows ?? []) as {
      day_index: number;
      recipe_id: string | null;
      made_at: string | null;
    }[])
      .filter(
        (day): day is { day_index: number; recipe_id: string; made_at: null } =>
          day.recipe_id !== null && day.made_at === null,
      )
      .sort((a, b) => a.day_index - b.day_index);
    if (planDays.length === 0) {
      return { ok: false, error: "No meals left to shop for this week" };
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

    const [inventoryResult, holdsResult] = await Promise.all([
      supabase
        .from("inventory")
        .select("item_id, quantity, unit")
        .eq("household_id", householdId),
      supabase
        .from("stock_holds")
        .select("item_id, quantity, unit, week_start")
        .eq("household_id", householdId),
    ]);

    const stock = new Map<string, number>();
    for (const row of (inventoryResult.data ?? []) as {
      item_id: string;
      quantity: number;
      unit: string | null;
    }[]) {
      const oz = toOunces(row.quantity, row.unit);
      const q = oz != null ? oz : row.quantity;
      const u = oz != null ? "oz" : row.unit;
      const key = stockPoolKey(row.item_id, u);
      stock.set(key, (stock.get(key) ?? 0) + q);
    }
    const held = new Map<string, number>();
    for (const row of (holdsResult.data ?? []) as {
      item_id: string;
      quantity: number;
      unit: string | null;
      week_start: string;
    }[]) {
      if (row.week_start === weekStart) continue; // being recomputed below
      const oz = toOunces(row.quantity, row.unit);
      const q = oz != null ? oz : row.quantity;
      const u = oz != null ? "oz" : row.unit;
      const key = stockPoolKey(row.item_id, u);
      held.set(key, (held.get(key) ?? 0) + q);
    }

    // Recompute this week's holds from scratch.
    const { error: wipeError } = await supabase
      .from("stock_holds")
      .delete()
      .eq("household_id", householdId)
      .eq("week_start", weekStart);
    if (wipeError) return { ok: false, error: wipeError.message };

    const newHolds: {
      household_id: string;
      item_id: string;
      quantity: number;
      unit: string | null;
      week_start: string;
      day_index: number;
    }[] = [];
    const groceryInputs: {
      itemId: string | null;
      name: string;
      quantity: number;
      unit: string | null;
      source: "planner";
    }[] = [];
    let reserved = 0;

    for (const day of planDays) {
      for (const ingredient of ingredientsByRecipe.get(day.recipe_id) ?? []) {
        const parsed = parseQuantityText(ingredient.quantity_text);
        if (!ingredient.item_id) {
          groceryInputs.push({
            itemId: null,
            name: ingredient.name,
            quantity: parsed.quantity,
            unit: parsed.unit,
            source: "planner",
          });
          continue;
        }
        const oz = toOunces(parsed.quantity, parsed.unit);
        const q = oz != null ? oz : parsed.quantity;
        const u = oz != null ? "oz" : parsed.unit;
        const key = stockPoolKey(ingredient.item_id, u);
        const available = (stock.get(key) ?? 0) - (held.get(key) ?? 0);
        const reserve = Math.max(0, Math.min(available, q));
        if (reserve > 0) {
          const holdQty = oz != null ? (fromOunces(reserve, parsed.unit) ?? reserve) : reserve;
          newHolds.push({
            household_id: householdId,
            item_id: ingredient.item_id,
            quantity: holdQty,
            unit: parsed.unit,
            week_start: weekStart,
            day_index: day.day_index,
          });
          held.set(key, (held.get(key) ?? 0) + reserve);
          reserved += 1;
        }
        const shortfall = q - reserve;
        if (shortfall > 0) {
          const shortQty = oz != null ? (fromOunces(shortfall, parsed.unit) ?? shortfall) : shortfall;
          groceryInputs.push({
            itemId: ingredient.item_id,
            name: ingredient.name,
            quantity: shortQty,
            unit: parsed.unit,
            source: "planner",
          });
        }
      }
    }

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

/**
 * Confirms a meal was cooked: consumes the day's holds from inventory
 * (FEFO — earliest expiration first, never below zero) and releases them.
 */
export async function markMealMade(
  input: z.input<typeof dayKeySchema>,
): Promise<ActionResult> {
  try {
    const parsed = dayKeySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid day" };
    const { supabase, householdId } = await requireDal();

    const { error: markError } = await supabase
      .from("meal_plan_days")
      .update({ made_at: new Date().toISOString() })
      .eq("household_id", householdId)
      .eq("week_start", parsed.data.weekStart)
      .eq("day_index", parsed.data.dayIndex);
    if (markError) return { ok: false, error: markError.message };

    const { data: holds } = await supabase
      .from("stock_holds")
      .select("item_id, quantity, unit")
      .eq("household_id", householdId)
      .eq("week_start", parsed.data.weekStart)
      .eq("day_index", parsed.data.dayIndex);

    for (const hold of (holds ?? []) as {
      item_id: string;
      quantity: number;
      unit: string | null;
    }[]) {
      const rowQuery = supabase
        .from("inventory")
        .select("id, quantity")
        .eq("household_id", householdId)
        .eq("item_id", hold.item_id)
        .order("expiration_date", { ascending: true, nullsFirst: false });
      const { data: rows, error: rowsError } =
        hold.unit === null
          ? await rowQuery.is("unit", null)
          : await rowQuery.eq("unit", hold.unit);
      if (rowsError) return { ok: false, error: rowsError.message };

      let remaining = hold.quantity;
      for (const row of (rows ?? []) as { id: string; quantity: number }[]) {
        if (remaining <= 0) break;
        const take = Math.min(row.quantity, remaining);
        if (take <= 0) continue;
        const { error: updateError } = await supabase
          .from("inventory")
          .update({ quantity: row.quantity - take })
          .eq("id", row.id);
        if (updateError) return { ok: false, error: updateError.message };
        remaining -= take;
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
 * Reads the day's reserved holds so the confirm dialog can show exactly what
 * markMealMade will take from the pantry (empty list = nothing reserved).
 */
export async function previewMealMade(
  input: z.input<typeof dayKeySchema>,
): Promise<
  ActionResult<{ items: { name: string; quantity: number; unit: string | null }[] }>
> {
  try {
    const parsed = dayKeySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid day" };
    const { supabase, householdId } = await requireDal();

    const { data, error } = await supabase
      .from("stock_holds")
      .select("quantity, unit, item:items(name)")
      .eq("household_id", householdId)
      .eq("week_start", parsed.data.weekStart)
      .eq("day_index", parsed.data.dayIndex)
      .order("created_at", { ascending: true });
    if (error) return { ok: false, error: error.message };

    const items = (
      (data ?? []) as unknown as {
        quantity: number;
        unit: string | null;
        item: { name: string } | null;
      }[]
    )
      .filter((row) => row.item !== null)
      .map((row) => ({
        name: (row.item as { name: string }).name,
        quantity: row.quantity,
        unit: row.unit,
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
