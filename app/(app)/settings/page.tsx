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
        .select("role, created_at, user_id, profiles(display_name, email)")
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

  return (
    <SettingsView
      household={(householdResult.data ?? null) as HouseholdRow | null}
      members={(membersResult.data ?? []) as unknown as MemberRow[]}
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
        <h1 className="text-lg font-bold">Settings</h1>
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
