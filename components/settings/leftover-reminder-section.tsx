"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  savePushSubscription,
  updateLeftoverReminder,
} from "@/app/(app)/settings/actions";
import type { NotificationSettingsRow } from "@/lib/types";

type DeviceSupport =
  | "unknown"
  | "supported"
  /** Web Push on iOS/iPadOS 16.4+ only works in an installed Home Screen app. */
  | "ios-standalone-only"
  | "unsupported";

function detectDeviceSupport(): DeviceSupport {
  if (typeof window === "undefined") return "unknown";
  const isIos =
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(("ontouchend" in document) && navigator.userAgent.includes("Mac"));
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true);
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return isIos ? "ios-standalone-only" : "unsupported";
  }
  if (isIos && !isStandalone) return "ios-standalone-only";
  return "supported";
}

/** Minutes-since-midnight <-> "HH:MM" helpers for the PostgREST `time` value. */
function timeValue(localTime: string): string {
  const [hours = "18", minutes = "00"] = localTime.split(":");
  return `${hours}:${minutes}`;
}

export function LeftoverReminderSection({
  settings,
}: {
  settings: NotificationSettingsRow | null;
}) {
  const [enabled, setEnabled] = useState(settings?.enabled ?? false);
  const [time, setTime] = useState(timeValue(settings?.local_time ?? "18:00"));
  const [lastSavedTime, setLastSavedTime] = useState(time);
  const [generic, setGeneric] = useState(settings?.generic_message ?? false);
  const [saving, setSaving] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [support, setSupport] = useState<DeviceSupport>("unknown");

  useEffect(() => {
    setSupport(detectDeviceSupport());
  }, []);

  async function persist(patch: {
    enabled?: boolean;
    localTime?: string;
    genericMessage?: boolean;
  }) {
    setSaving(true);
    const result = await updateLeftoverReminder({
      ...patch,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (patch.localTime) setLastSavedTime(patch.localTime);
  }

  async function enableOnThisDevice() {
    setDeviceBusy(true);
    try {
      // iOS requires a user gesture for permission; never call this on mount.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error(
          permission === "denied"
            ? "Notifications are blocked for this site. Allow them in your browser settings, then try again."
            : "Notification permission was not granted.",
        );
        return;
      }
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        toast.error("This browser does not support web push.");
        return;
      }
      // Register here too: the app only auto-registers in production, but the
      // user may be enabling while on a preview/dev deploy.
      const registration = await navigator.serviceWorker.register("/sw.js", {
        updateViaCache: "none",
      });
      await navigator.serviceWorker.ready;
      const subscription =
        await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        toast.error("Could not read this device's push subscription.");
        return;
      }
      const result = await savePushSubscription({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("This device will get the daily reminder.");
    } catch (error) {
      console.error("push subscribe failed", error);
      toast.error("Could not enable notifications on this device.");
    } finally {
      setDeviceBusy(false);
    }
  }

  const supportMessage =
    support === "ios-standalone-only"
      ? "On iPhone/iPad, install this app to your Home Screen first — then come back and tap Enable on this device."
      : support === "unsupported"
        ? "This browser does not support web push."
        : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label htmlFor="reminder-enabled">Daily reminder</Label>
          <p className="text-xs text-muted-foreground">
            One notification a day about the items on your leftovers list.
          </p>
        </div>
        <Switch
          id="reminder-enabled"
          checked={enabled}
          disabled={saving}
          onCheckedChange={(checked) => {
            const next = checked === true;
            setEnabled(next);
            void persist({ enabled: next });
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label htmlFor="reminder-time">Reminder time</Label>
          <p className="text-xs text-muted-foreground">
            Your device&apos;s time zone is used.
          </p>
        </div>
        <Input
          id="reminder-time"
          type="time"
          className="w-28"
          value={time}
          disabled={saving}
          onChange={(event) => setTime(event.target.value)}
          onBlur={() => {
            if (time && time !== lastSavedTime) {
              void persist({ localTime: time });
            }
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label htmlFor="reminder-generic">Hide item names</Label>
          <p className="text-xs text-muted-foreground">
            The notification says &quot;leftovers&quot; without listing what
            they are.
          </p>
        </div>
        <Switch
          id="reminder-generic"
          checked={generic}
          disabled={saving}
          onCheckedChange={(checked) => {
            const next = checked === true;
            setGeneric(next);
            void persist({ genericMessage: next });
          }}
        />
      </div>

      <div className="space-y-2">
        {supportMessage ? (
          <p className="text-xs text-muted-foreground">{supportMessage}</p>
        ) : null}
        <Button
          variant="outline"
          onClick={() => void enableOnThisDevice()}
          disabled={deviceBusy || support === "unsupported" || support === "ios-standalone-only"}
        >
          {deviceBusy ? (
            <Loader2 className="animate-spin" />
          ) : (
            <BellRing />
          )}
          Enable on this device
        </Button>
        <p className="text-xs text-muted-foreground">
          Reminders are sent to each device you enable separately. Deleting the
          app or clearing site data stops that device&apos;s reminders.
        </p>
      </div>
    </div>
  );
}
