"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireDal } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LOCATIONS, type Location } from "@/lib/types";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const nameSchema = z.string().trim().min(1).max(80);

export async function updateHouseholdName(name: string): Promise<ActionResult> {
  try {
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) return { ok: false, error: "Name is required" };
    const { supabase, householdId } = await requireDal();
    const { error } = await supabase
      .from("households")
      .update({ name: parsed.data })
      .eq("id", householdId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not rename household",
    };
  }
}

export async function updateDisplayName(name: string): Promise<ActionResult> {
  try {
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) return { ok: false, error: "Name is required" };
    const { supabase, user } = await requireDal();
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: parsed.data })
      .eq("id", user.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/settings");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update profile",
    };
  }
}

export async function updateDefaultLocation(
  location: Location,
): Promise<ActionResult> {
  try {
    if (!LOCATIONS.some((entry) => entry.value === location)) {
      return { ok: false, error: "Unknown location" };
    }
    const { supabase, householdId } = await requireDal();
    const { error } = await supabase
      .from("household_settings")
      .upsert(
        { household_id: householdId, default_location: location },
        { onConflict: "household_id" },
      );
    if (error) return { ok: false, error: error.message };
    revalidatePath("/settings");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save preference",
    };
  }
}

export async function regenerateInviteCode(): Promise<ActionResult<string>> {
  try {
    const { supabase, householdId } = await requireDal();
    const code = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
    const { error } = await supabase
      .from("households")
      .update({ invite_code: code })
      .eq("id", householdId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/settings");
    return { ok: true, data: code };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not regenerate code",
    };
  }
}

export async function joinHouseholdByCode(
  code: string,
): Promise<ActionResult<{ name: string }>> {
  try {
    const trimmed = code.trim();
    if (!trimmed) return { ok: false, error: "Enter an invite code" };
    const { supabase } = await requireDal();
    const { data, error } = await supabase.rpc("join_household", {
      p_code: trimmed,
    });
    if (error) {
      return {
        ok: false,
        error: error.message.includes("invalid invite code")
          ? "That invite code doesn't match any household"
          : error.message,
      };
    }
    const householdId = data as string;
    const { data: household } = await supabase
      .from("households")
      .select("name")
      .eq("id", householdId)
      .maybeSingle();

    revalidatePath("/", "layout");
    return {
      ok: true,
      data: { name: (household as { name: string } | null)?.name ?? "household" },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not join household",
    };
  }
}

export async function switchHousehold(householdId: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireDal();
    const { error } = await supabase.rpc("set_current_household", {
      p_household: householdId,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not switch household",
    };
  }
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
