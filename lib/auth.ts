import "server-only";
import type { User } from "@supabase/supabase-js";
import { io } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/types";

export type Dal = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User;
  householdId: string;
  profile: ProfileRow;
};

/**
 * Resolves the signed-in user and their current household.
 * Falls back to the first membership if current_household_id is unset.
 * Returns null when signed out (callers decide whether to redirect).
 */
export async function getDal(): Promise<Dal | null> {
  await io();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, email, display_name, current_household_id")
    .eq("id", user.id)
    .maybeSingle();

  const profile = data as ProfileRow | null;
  if (!profile) return null;

  let householdId = profile.current_household_id;

  if (!householdId) {
    const { data: membership } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const row = membership as { household_id: string } | null;
    if (row) {
      householdId = row.household_id;
      await supabase
        .from("profiles")
        .update({ current_household_id: householdId })
        .eq("id", user.id);
      profile.current_household_id = householdId;
    }
  }

  if (!householdId) return null;

  return { supabase, user, householdId, profile };
}

export async function requireDal(): Promise<Dal> {
  const dal = await getDal();
  if (!dal) redirect("/login");
  return dal;
}
