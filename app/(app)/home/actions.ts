"use server";

import { revalidatePath } from "next/cache";
import { requireDal } from "@/lib/auth";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Adds a named leftover to the household list. Names are free text; the only
 * guard against accidental double-submits is the widget's in-flight busy
 * flag — the same name can be saved intentionally (no unique constraint).
 */
export async function addLeftover(
  rawName: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const name = rawName.trim();
    if (!name) return { ok: false, error: "Leftover needs a name" };
    if (name.length > 160) return { ok: false, error: "Name is too long" };
    const { supabase, householdId } = await requireDal();

    const { data, error } = await supabase
      .from("leftovers")
      .insert({ household_id: householdId, name })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, error: "Couldn't save the leftover — try again." };
    }

    revalidatePath("/home");
    return { ok: true, data: { id: data.id as string } };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Couldn't save the leftover",
    };
  }
}

/**
 * Permanently deletes one leftover row — no archive, no undo. Household
 * scoping on top of RLS ensures only the caller's own record is removed;
 * a row already gone (double tap, another device) still counts as success.
 */
export async function deleteLeftover(id: string): Promise<ActionResult> {
  try {
    if (!UUID_RE.test(id)) return { ok: false, error: "Invalid leftover" };
    const { supabase, householdId } = await requireDal();

    const { error } = await supabase
      .from("leftovers")
      .delete()
      .eq("id", id)
      .eq("household_id", householdId);
    if (error) {
      return { ok: false, error: "Couldn't remove the leftover — try again." };
    }

    revalidatePath("/home");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Couldn't remove the leftover",
    };
  }
}
