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

// ---------------------------------------------------------------------------
// Daily leftovers reminder — per-user notification preferences + the device's
// push subscription. Permission is requested only from the settings button
// (never here); this just persists what the user chose.
// ---------------------------------------------------------------------------

const reminderPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    localTime: z
      .string()
      .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time")
      .optional(),
    timezone: z.string().min(1).max(64).optional(),
    genericMessage: z.boolean().optional(),
  })
  .refine(
    (patch) =>
      Object.keys(patch).some(
        (key) => patch[key as keyof typeof patch] !== undefined,
      ),
    { message: "Nothing to update" },
  );

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().startsWith("https://").max(2048),
  p256dh: z.string().regex(/^[A-Za-z0-9_-]+$/, "Invalid key").min(16).max(512),
  auth: z.string().regex(/^[A-Za-z0-9_-]+$/, "Invalid key").min(16).max(512),
});

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Partial update of the signed-in user's reminder preferences (upsert by user_id). */
export async function updateLeftoverReminder(
  rawPatch: z.input<typeof reminderPatchSchema>,
): Promise<ActionResult> {
  try {
    const parsed = reminderPatchSchema.safeParse(rawPatch);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
    }
    const patch = parsed.data;
    if (patch.timezone && !isValidTimeZone(patch.timezone)) {
      return { ok: false, error: "Unknown time zone" };
    }
    const { supabase, user } = await requireDal();

    const { data: current } = await supabase
      .from("notification_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    const existing = current as
      | {
          enabled: boolean;
          local_time: string;
          timezone: string | null;
          generic_message: boolean;
        }
      | null;

    const { error } = await supabase.from("notification_settings").upsert(
      {
        user_id: user.id,
        enabled: patch.enabled ?? existing?.enabled ?? false,
        local_time:
          patch.localTime ?? existing?.local_time ?? "18:00:00",
        timezone: patch.timezone ?? existing?.timezone ?? null,
        generic_message:
          patch.genericMessage ?? existing?.generic_message ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) return { ok: false, error: error.message };

    revalidatePath("/settings");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not save reminder",
    };
  }
}

/**
 * Registers (or replaces) this device's push subscription under the signed-in
 * user. Upserting on endpoint makes a re-subscribe with rotated keys replace
 * the stored row instead of duplicating it.
 */
export async function savePushSubscription(
  rawSubscription: z.input<typeof pushSubscriptionSchema>,
): Promise<ActionResult> {
  try {
    const parsed = pushSubscriptionSchema.safeParse(rawSubscription);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid subscription" };
    }
    const { supabase, user } = await requireDal();

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.p256dh,
        auth: parsed.data.auth,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    if (error) return { ok: false, error: error.message };

    revalidatePath("/settings");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not save this device",
    };
  }
}
