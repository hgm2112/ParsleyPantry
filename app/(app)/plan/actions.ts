"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDal } from "@/lib/auth";
import { addManyGroceryItems } from "@/app/(app)/grocery/actions";
import { parseQuantityText } from "@/lib/stock";
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

export async function setMealDay(
  input: z.input<typeof setMealSchema>,
): Promise<ActionResult> {
  try {
    const parsed = setMealSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid day" };
    const { supabase, householdId } = await requireDal();

    const { error } = await supabase.from("meal_plan_days").upsert(
      {
        household_id: householdId,
        week_start: parsed.data.weekStart,
        day_index: parsed.data.dayIndex,
        recipe_id: parsed.data.recipeId,
      },
      { onConflict: "household_id,week_start,day_index" },
    );
    if (error) return { ok: false, error: error.message };

    revalidatePath("/plan");
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
    const { supabase, householdId } = await requireDal();

    const { error } = await supabase
      .from("meal_plan_days")
      .delete()
      .eq("household_id", householdId)
      .eq("week_start", parsed.data.weekStart)
      .eq("day_index", parsed.data.dayIndex);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/plan");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not clear day",
    };
  }
}

export async function planWeekToGrocery(
  weekStart: string,
): Promise<ActionResult<{ added: number; skipped: number }>> {
  try {
    if (!isIsoDate(weekStart)) return { ok: false, error: "Bad week" };
    const { supabase, householdId } = await requireDal();

    const weekEnd = addDays(weekStart, 6);
    const { data: days } = await supabase
      .from("meal_plan_days")
      .select("recipe_id")
      .eq("household_id", householdId)
      .gte("week_start", weekStart)
      .lte("week_start", weekEnd)
      .not("recipe_id", "is", null);

    const recipeIds = Array.from(
      new Set(
        ((days ?? []) as { recipe_id: string | null }[])
          .map((day) => day.recipe_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (recipeIds.length === 0) {
      return { ok: false, error: "No meals planned for this week yet" };
    }

    const { data: ingredients } = await supabase
      .from("recipe_ingredients")
      .select("name, item_id, quantity_text, optional, recipe_id")
      .eq("household_id", householdId)
      .in("recipe_id", recipeIds);

    const inputs = ((ingredients ?? []) as {
      name: string;
      item_id: string | null;
      quantity_text: string;
      optional: boolean;
    }[])
      .filter((ingredient) => !ingredient.optional)
      .map((ingredient) => {
        const parsed = parseQuantityText(ingredient.quantity_text);
        return {
          itemId: ingredient.item_id,
          name: ingredient.name,
          quantity: parsed.quantity,
          unit: parsed.unit,
          source: "planner" as const,
        };
      });

    if (inputs.length === 0) {
      return { ok: false, error: "Planned recipes have no ingredients yet" };
    }

    const result = await addManyGroceryItems(inputs);
    if (!result.ok) return result;
    return { ok: true, data: result.data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not plan shopping",
    };
  }
}
