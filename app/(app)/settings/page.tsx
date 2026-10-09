import { Suspense } from "react";
import { requireDal } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsView } from "@/components/settings/settings-view";
import type {
  HouseholdRow,
  HouseholdSettingsRow,
  MemberRow,
} from "@/lib/types";

export const metadata = { title: "Settings" };

export type MembershipRow = {
  household_id: string;
  role: "owner" | "member";
  households: { id: string; name: string } | null;
};

function SettingsSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Skeleton className="h-8 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}

async function SettingsContent() {
  const { supabase, householdId, user, profile } = await requireDal();

  const [householdResult, membersResult, membershipsResult, settingsResult] =
    await Promise.all([
      supabase
        .from("households")
        .select("id, name, invite_code")
        .eq("id", householdId)
        .maybeSingle(),
      supabase
        .from("household_members")
        .select("household_id, role, created_at, user_id")
        .eq("household_id", householdId)
        .order("created_at", { ascending: true }),
      supabase
        .from("household_members")
        .select("household_id, role, households(id, name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("household_settings")
        .select("*")
        .eq("household_id", householdId)
        .maybeSingle(),
    ]);

  // Robust fetch: separate queries avoid PostgREST embed issues (no FK from user_id -> profiles.id)
  let members: MemberRow[] = [];
  if (membersResult.data && membersResult.data.length > 0) {
    const userIds = membersResult.data.map((m) => m.user_id);
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", userIds);
    if (profilesError) {
      console.error("profiles fetch error in settings", profilesError);
    }
    members = membersResult.data.map((m) => ({
      ...m,
      profiles: profilesData?.find((p) => p.id === m.user_id) ?? null,
    })) as unknown as MemberRow[];
  }
  if (membersResult.error) {
    console.error("members fetch error in settings", membersResult.error);
  }

  return (
    <SettingsView
      household={(householdResult.data ?? null) as HouseholdRow | null}
      members={members}
      memberships={
        (membershipsResult.data ?? []) as unknown as MembershipRow[]
      }
      settings={(settingsResult.data ?? null) as HouseholdSettingsRow | null}
      profile={profile}
      currentUserId={user.id}
    />
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-extrabold">Settings</h1>
        <p className="text-xs text-muted-foreground">
          Household, preferences, and data.
        </p>
      </div>
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}
