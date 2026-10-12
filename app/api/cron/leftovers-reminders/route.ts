import type { NextRequest } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  composeReminder,
  isDue,
  localParts,
  parseLocalTime,
  reminderLocalDate,
} from "@/lib/reminder";

/** Hobby allows up to 60s; sending a handful of pushes is well under that. */
export const maxDuration = 60;

type ReminderSetting = {
  user_id: string;
  local_time: string;
  timezone: string;
  generic_message: boolean;
};

type Subscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type Summary = {
  dueUsers: number;
  sent: number;
  skippedNoLeftovers: number;
  alreadyClaimed: number;
  deactivated: number;
  transient: number;
  errors: number;
};

function shiftDate(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function resolveHouseholdId(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<string | null> {
  const { data: profile } = await admin
    .from("profiles")
    .select("current_household_id")
    .eq("id", userId)
    .maybeSingle();
  const current = profile?.current_household_id as string | null | undefined;
  if (current) return current;

  const { data: membership } = await admin
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return (membership?.household_id as string | undefined) ?? null;
}

function isTransient(status: number | undefined): boolean {
  return status === undefined || status === 429 || status >= 500;
}

/**
 * Daily leftovers reminder sender. Invoked by Vercel Cron (24 hourly band jobs
 * on the Hobby plan, one path) with `Authorization: Bearer $CRON_SECRET`.
 *
 * Per invocation, for every user with reminders enabled:
 *   due now in their local zone? → household has leftovers? → claim today's
 *   delivery row (unique per device+local day — retries/duplicate cron runs
 *   skip) → web-push. Transient failures release the claim for a later band;
 *   dead endpoints are deactivated instead.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const summary: Summary = {
    dueUsers: 0,
    sent: 0,
    skippedNoLeftovers: 0,
    alreadyClaimed: 0,
    deactivated: 0,
    transient: 0,
    errors: 0,
  };

  try {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject) {
      console.error(
        "leftovers-reminder: VAPID env vars missing (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)",
      );
      return Response.json({ error: "VAPID not configured", ...summary }, { status: 500 });
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);

    const admin = createAdminClient();

    const { data: settingRows, error: settingsError } = await admin
      .from("notification_settings")
      .select("user_id, local_time, timezone, generic_message")
      .eq("enabled", true)
      .not("timezone", "is", null);
    if (settingsError) {
      console.error("leftovers-reminder: settings query failed", settingsError);
      return Response.json({ error: "settings query failed", ...summary }, { status: 500 });
    }
    const settings = (settingRows ?? []) as ReminderSetting[];
    if (settings.length === 0) return Response.json(summary);

    const { data: subRows, error: subsError } = await admin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .eq("active", true)
      .in("user_id", settings.map((entry) => entry.user_id));
    if (subsError) {
      console.error("leftovers-reminder: subscriptions query failed", subsError);
      return Response.json({ error: "subscriptions query failed", ...summary }, { status: 500 });
    }
    const subsByUser = new Map<string, Subscription[]>();
    for (const sub of (subRows ?? []) as Subscription[]) {
      const list = subsByUser.get(sub.user_id) ?? [];
      list.push(sub);
      subsByUser.set(sub.user_id, list);
    }

    const now = new Date();

    for (const setting of settings) {
      const subs = subsByUser.get(setting.user_id);
      if (!subs || subs.length === 0) continue;

      const scheduled = parseLocalTime(setting.local_time);
      if (scheduled === null) continue;

      let parts: ReturnType<typeof localParts>;
      try {
        parts = localParts(now, setting.timezone);
      } catch {
        summary.errors++;
        console.error(
          `leftovers-reminder: bad timezone "${setting.timezone}" for user ${setting.user_id}`,
        );
        continue;
      }
      if (!isDue(parts.minutes, scheduled)) continue;
      summary.dueUsers++;

      const householdId = await resolveHouseholdId(admin, setting.user_id);
      const leftovers = householdId
        ? (
            (await admin
              .from("leftovers")
              .select("name")
              .eq("household_id", householdId)).data ?? []
          )
        : [];
      if (leftovers.length === 0) {
        // Not claimed — if items appear later inside the window, the next run sends.
        summary.skippedNoLeftovers++;
        continue;
      }

      const names = leftovers.map((row) => (row as { name: string }).name);
      const { title, body } = composeReminder(
        names,
        setting.generic_message,
      );
      const localDate = reminderLocalDate(
        parts.minutes,
        scheduled,
        parts.date,
        shiftDate(parts.date, -1),
      );

      for (const sub of subs) {
        // Claim first: unique (subscription_id, local_date) makes cron
        // retries and duplicate invocations exactly-once per device/day.
        const { data: claim, error: claimError } = await admin
          .from("leftover_reminder_deliveries")
          .insert({ subscription_id: sub.id, local_date: localDate })
          .select("id")
          .single();
        if (claimError) {
          if (claimError.code === "23505") {
            summary.alreadyClaimed++;
            continue;
          }
          summary.errors++;
          console.error("leftovers-reminder: claim failed", claimError);
          continue; // never send without a claim
        }

        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify({ title, body, url: "/home#leftovers" }),
            { TTL: 21600, urgency: "normal", topic: "leftovers-daily" },
          );
          summary.sent++;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410 || status === 400 || status === 413) {
            // Endpoint gone (e.g. iOS PWA deleted) or unusable — deactivate,
            // keep the claim so we never retry a dead subscription.
            const { error: deactivateError } = await admin
              .from("push_subscriptions")
              .update({ active: false, updated_at: new Date().toISOString() })
              .eq("id", sub.id);
            if (deactivateError) {
              summary.errors++;
              console.error("leftovers-reminder: deactivate failed", deactivateError);
            } else {
              summary.deactivated++;
            }
          } else if (status === 401 || status === 403) {
            // VAPID/auth misconfiguration affects every send — fail loudly.
            console.error("leftovers-reminder: push auth failure", status, error);
            return Response.json(
              { error: "push auth failure", ...summary },
              { status: 500 },
            );
          } else if (isTransient(status)) {
            // 429/5xx/network — release the claim so a later band job in the
            // due window can retry.
            const { error: releaseError } = await admin
              .from("leftover_reminder_deliveries")
              .delete()
              .eq("id", claim.id);
            if (releaseError) {
              summary.errors++;
              console.error("leftovers-reminder: claim release failed", releaseError);
            } else {
              summary.transient++;
            }
          } else {
            summary.errors++;
            console.error("leftovers-reminder: unexpected push failure", status, error);
          }
        }
      }
    }

    return Response.json(summary);
  } catch (error) {
    console.error("leftovers-reminder: fatal", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "fatal", ...summary },
      { status: 500 },
    );
  }
}
