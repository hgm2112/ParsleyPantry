"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Loader2,
  LogOut,
  RefreshCw,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ThemePicker } from "@/components/theme-switch";
import {
  joinHouseholdByCode,
  regenerateInviteCode,
  signOut,
  switchHousehold,
  updateDefaultLocation,
  updateDisplayName,
  updateHouseholdName,
} from "@/app/(app)/settings/actions";
import type { MembershipRow } from "@/app/(app)/settings/page";
import { LOCATIONS, type HouseholdRow, type HouseholdSettingsRow, type Location, type MemberRow, type ProfileRow } from "@/lib/types";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div>
        <h2 className="text-sm font-extrabold">{title}</h2>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

type Props = {
  household: HouseholdRow | null;
  members: MemberRow[];
  memberships: MembershipRow[];
  settings: HouseholdSettingsRow | null;
  profile: ProfileRow;
  currentUserId: string;
};

export function SettingsView({
  household,
  members,
  memberships,
  settings,
  profile,
  currentUserId,
}: Props) {
  const router = useRouter();
  const [householdName, setHouseholdName] = useState(household?.name ?? "");
  const [nameDirty, setNameDirty] = useState(false);
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [nameBusy, setNameBusy] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);

  const [membersList, setMembersList] = useState(members);

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  const others = memberships.filter(
    (entry) => entry.household_id !== household?.id,
  );

  useEffect(() => {
    setMembersList(members);
  }, [members]);

  useEffect(() => {
    if (!household?.id) return;

    supabaseRef.current ??= createClient();
    const supabase = supabaseRef.current;

    const fetchMembers = async () => {
      const { data: memberRows, error: membersError } = await supabase
        .from("household_members")
        .select("household_id, role, created_at, user_id")
        .eq("household_id", household.id)
        .order("created_at", { ascending: true });
      if (membersError) {
        console.error("members fetch error (client)", membersError);
        return;
      }
      if (!memberRows || memberRows.length === 0) {
        setMembersList([]);
        return;
      }
      const userIds = memberRows.map((m) => m.user_id);
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", userIds);
      if (profilesError) {
        console.error("profiles fetch error (client)", profilesError);
      }
      const merged = memberRows.map((m) => ({
        ...m,
        profiles: profilesData?.find((p) => p.id === m.user_id) ?? null,
      })) as unknown as MemberRow[];
      setMembersList(merged);
    };

    // Bootstrap immediately so client can populate even if server render gave []
    void fetchMembers();

    const channel = supabase
      .channel(`household-members-${household.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "household_members",
          filter: `household_id=eq.${household.id}`,
        },
        () => {
          void fetchMembers();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [household?.id]);

  async function saveHouseholdName() {
    const trimmed = householdName.trim();
    if (!trimmed || !household) {
      setNameDirty(false);
      return;
    }
    if (trimmed === household.name) {
      setNameDirty(false);
      return;
    }
    setNameBusy(true);
    const result = await updateHouseholdName(trimmed);
    setNameBusy(false);
    setNameDirty(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Household renamed");
    router.refresh();
  }

  async function saveDisplayName() {
    const trimmed = displayName.trim();
    if (!trimmed || trimmed === (profile.display_name ?? "")) return;
    setNameBusy(true);
    const result = await updateDisplayName(trimmed);
    setNameBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Name updated");
    router.refresh();
  }

  async function copyInvite() {
    if (!household) return;
    try {
      await navigator.clipboard.writeText(household.invite_code);
      toast.success("Invite code copied");
    } catch {
      toast.error(`Copy failed — code is ${household.invite_code}`);
    }
  }

  async function regenerate() {
    setRegenBusy(true);
    const result = await regenerateInviteCode();
    setRegenBusy(false);
    setRegenOpen(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("New invite code created — old code no longer works");
    router.refresh();
  }

  async function join(event: React.FormEvent) {
    event.preventDefault();
    setJoinBusy(true);
    const result = await joinHouseholdByCode(joinCode);
    setJoinBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setJoinCode("");
    toast.success(`Joined ${result.data.name}`);
    router.refresh();
  }

  async function switchTo(entry: MembershipRow) {
    const result = await switchHousehold(entry.household_id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Switched to ${entry.households?.name ?? "household"}`);
    router.refresh();
  }

  async function changeDefaultLocation(value: string) {
    const result = await updateDefaultLocation(value as Location);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Default location saved");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Section
        title="Household"
        description="Everyone in a household shares the same pantry, list, and plan."
      >
        <div className="space-y-2">
          <Label htmlFor="household-name">Name</Label>
          <div className="flex gap-2">
            <Input
              id="household-name"
              value={householdName}
              onChange={(event) => {
                setHouseholdName(event.target.value);
                setNameDirty(true);
              }}
              onBlur={() => void saveHouseholdName()}
            />
            {nameDirty ? (
              <Button
                variant="outline"
                onClick={() => void saveHouseholdName()}
                disabled={nameBusy}
                aria-label="Save household name"
              >
                {nameBusy ? <Loader2 className="animate-spin" /> : <Check />}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Invite code</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-sm tracking-widest">
              {household?.invite_code ?? "—"}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={() => void copyInvite()}
              aria-label="Copy invite code"
            >
              <Copy />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setRegenOpen(true)}
              disabled={regenBusy}
              aria-label="Generate a new invite code"
            >
              <RefreshCw />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            A new member signs up, then enters this code here to join your
            household.
          </p>
        </div>

        <form onSubmit={join} className="flex gap-2">
          <Input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
            placeholder="Join another household…"
            aria-label="Invite code"
          />
          <Button type="submit" variant="outline" disabled={joinBusy}>
            {joinBusy ? <Loader2 className="animate-spin" /> : <Users />}
            Join
          </Button>
        </form>

        {memberships.length > 1 || others.length > 0 ? (
          <div className="space-y-1.5">
            <Label>Your households</Label>
            <ul className="divide-y rounded-lg border">
              {memberships.map((entry) => {
                const isCurrent = entry.household_id === household?.id;
                return (
                  <li
                    key={entry.household_id}
                    className="flex items-center gap-2 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {entry.households?.name ?? "Household"}
                      {entry.role === "owner" ? (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          owner
                        </span>
                      ) : null}
                    </span>
                    {isCurrent ? (
                      <Badge variant="secondary">Current</Badge>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void switchTo(entry)}
                      >
                        Switch
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </Section>

      <Section title="Members" description="Who you share data with.">
        <ul className="divide-y rounded-lg border">
          {membersList.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-muted-foreground">No members yet.</li>
          ) : (
            membersList.map((member) => {
              const isSelf = member.user_id === currentUserId;
              const name =
                member.profiles?.display_name ||
                member.profiles?.email?.split("@")[0] ||
                "Member";
              return (
                <li key={member.user_id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {name}
                      {isSelf ? (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          you
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <Badge variant={member.role === "owner" ? "default" : "secondary"}>
                    {member.role}
                  </Badge>
                </li>
              );
            })
          )}
        </ul>
      </Section>

      <Section
        title="Preferences"
        description="Where new items and shop sessions start by default."
      >
        <div className="space-y-2">
          <Label>Default location</Label>
          <Select
            value={settings?.default_location ?? "pantry"}
            items={LOCATIONS.map((location) => ({
              value: location.value,
              label: location.label,
            }))}
            onValueChange={(value) => {
              if (value) void changeDefaultLocation(value);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCATIONS.map((location) => (
                <SelectItem key={location.value} value={location.value}>
                  {location.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Section>

      <Section
        title="Appearance"
        description="Light, dark, or follow your device. Saved on this device."
      >
        <ThemePicker />
      </Section>

      <Section
        title="Data"
        description="Coming from KitchenOwl? Bring your stuff over."
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href="/categories" />}>
            Manage categories
          </Button>
          <Button variant="outline" render={<Link href="/import" />}>
            Import from KitchenOwl
          </Button>
        </div>
      </Section>

      <Section
        title="Ingredient matching"
        description="Keep product names exactly as scanned while recipes match them as one generic ingredient."
      >
        <Button variant="outline" render={<Link href="/inventory/normalize" />}>
          Review ingredient matches
        </Button>
      </Section>

      <Section title="Account">
        <div className="space-y-2">
          <Label>Signed in as</Label>
          <Input value={profile.email ?? ""} readOnly disabled />
        </div>
        <div className="space-y-2">
          <Label htmlFor="display-name">Your name</Label>
          <div className="flex gap-2">
            <Input
              id="display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              onBlur={() => void saveDisplayName()}
            />
            <Button
              variant="outline"
              onClick={() => void saveDisplayName()}
              disabled={nameBusy}
              aria-label="Save your name"
            >
              {nameBusy ? <Loader2 className="animate-spin" /> : <Check />}
            </Button>
          </div>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="outline">
            <LogOut /> Sign out
          </Button>
        </form>
      </Section>

      <ConfirmDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        title="Generate a new invite code?"
        description="The current code stops working immediately. Anyone you shared it with can no longer join."
        confirmLabel="New code"
        destructive
        onConfirm={regenerate}
      />
    </div>
  );
}
