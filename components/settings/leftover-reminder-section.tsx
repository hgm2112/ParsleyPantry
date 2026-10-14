"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  getReminderConfigurationStatus,
  savePushSubscription,
  sendTestLeftoverReminder,
  updateLeftoverReminder,
} from "@/app/(app)/settings/actions";
import type { NotificationSettingsRow } from "@/lib/types";

type DeviceSupport =
  | "unknown"
  | "supported"
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

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index++) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

function timeValue(localTime: string): string {
  const [hours = "18", minutes = "00"] = localTime.split(":");
  return `${hours}:${minutes}`;
}

function safeErrorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/https?:\/\/[^\s]+/g, "[redacted]");
}

export function LeftoverReminderSection({
  settings,
  currentUserId,
  pushSubscriptionCount = 0,
}: {
  settings: NotificationSettingsRow | null;
  currentUserId?: string;
  pushSubscriptionCount?: number;
}) {
  const [enabled, setEnabled] = useState(settings?.enabled ?? false);
  const [time, setTime] = useState(timeValue(settings?.local_time ?? "18:00"));
  const [lastSavedTime, setLastSavedTime] = useState(time);
  const [generic, setGeneric] = useState(settings?.generic_message ?? false);
  const [saving, setSaving] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [support, setSupport] = useState<DeviceSupport>("unknown");
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof Notification === "undefined") return "default";
    return Notification.permission;
  });
  const [hasBrowserSubscription, setHasBrowserSubscription] = useState<
    boolean | null
  >(null);
  const [savedSubscriptionCount, setSavedSubscriptionCount] = useState(
    pushSubscriptionCount,
  );
  const [config, setConfig] = useState<{
    clientPublicKeyConfigured: boolean;
    vapidConfiguredOnServer: boolean;
    vapidSubjectValid: boolean;
    adminKeyValid: boolean;
    cronSecretConfigured: boolean;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setSupport(detectDeviceSupport());
    refreshDiagnostics();
  }, []);

  async function refreshDiagnostics() {
    setRefreshing(true);
    try {
      if ("serviceWorker" in navigator && "PushManager" in window) {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        setHasBrowserSubscription(Boolean(subscription));
      } else {
        setHasBrowserSubscription(false);
      }

      const browserClient = createBrowserSupabaseClient();
      const { data: userData } = await browserClient.auth.getUser();
      const userId = userData.user?.id ?? currentUserId;
      if (userId) {
        const { count } = await browserClient
          .from("push_subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("active", true);
        setSavedSubscriptionCount(count ?? 0);
      }

      const status = await getReminderConfigurationStatus();
      if (status.ok) setConfig(status.data);
    } finally {
      setRefreshing(false);
    }
  }

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
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        toast.error(
          nextPermission === "denied"
            ? "Notifications are blocked for this site. Allow them in the browser and OS settings, then try again."
            : "Notification permission was not granted.",
        );
        return;
      }
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        toast.error("This browser does not support web push.");
        return;
      }
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        toast.error(
          "This build does not expose NEXT_PUBLIC_VAPID_PUBLIC_KEY, so this device cannot subscribe.",
        );
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
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
      setHasBrowserSubscription(true);
      toast.success(
        "This device subscription was saved for your account. You can now send a test notification.",
      );
      await refreshDiagnostics();
    } catch (error) {
      const reason = safeErrorText(error);
      console.error("push subscribe failed", reason);
      toast.error(
        `Could not enable notifications on this device. ${reason || "Check that notifications are allowed and the browser supports web push."}`,
      );
    } finally {
      setDeviceBusy(false);
    }
  }

  async function sendTestNotification() {
    setTestBusy(true);
    try {
      const result = await sendTestLeftoverReminder();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Push accepted for delivery to ${result.data.accepted} of ${result.data.total} device(s). ` +
          "A successful server response is not proof that the operating system displayed it.",
      );
      await refreshDiagnostics();
    } finally {
      setTestBusy(false);
    }
  }

  const configReady =
    Boolean(config?.clientPublicKeyConfigured) &&
    Boolean(config?.vapidConfiguredOnServer) &&
    Boolean(config?.vapidSubjectValid) &&
    Boolean(config?.adminKeyValid) &&
    Boolean(config?.cronSecretConfigured);

  const supportMessage =
    support === "ios-standalone-only"
      ? "On iPhone/iPad, install this app to your Home Screen first, then return to Settings and enable this device."
      : support === "unsupported"
        ? "This browser does not support web push (PushManager or service workers are unavailable)."
        : null;

  let statusText = "Checking notification status...";
  if (support === "unsupported") {
    statusText =
      "Browser/PWA notifications are unsupported on this browser or app context.";
  } else if (support === "ios-standalone-only") {
    statusText =
      "Permission cannot be requested until Parsley Pantry is installed to the Home Screen.";
  } else if (permission === "denied") {
    statusText =
      "Permission denied. Enable notifications for this site in browser and OS settings, then retry.";
  } else if (permission !== "granted") {
    statusText = "Permission not requested. Use Enable on this device to request it.";
  } else if (!hasBrowserSubscription && savedSubscriptionCount === 0) {
    statusText =
      "Permission granted, but no push subscription exists on this browser.";
  } else if (hasBrowserSubscription && savedSubscriptionCount === 0) {
    statusText =
      "Push subscription created, but it was not saved successfully for the signed-in user.";
  } else if (!configReady) {
    statusText =
      "Subscription saved, but server-side configuration is incomplete.";
  } else if (hasBrowserSubscription) {
    statusText = "Notifications are configured and ready on this device.";
  } else {
    statusText =
      "Notifications are configured for at least one saved device, but this browser is not registered.";
  }

  const missingServerValues =
    config === null
      ? []
      : [
          !config.clientPublicKeyConfigured
            ? "NEXT_PUBLIC_VAPID_PUBLIC_KEY"
            : null,
          !config.vapidConfiguredOnServer
            ? "VAPID_PRIVATE_KEY and/or VAPID_SUBJECT"
            : null,
          !config.vapidSubjectValid ? "VAPID_SUBJECT mailto subject" : null,
          !config.adminKeyValid
            ? "SUPABASE_SERVICE_ROLE_KEY (must be a Supabase secret key or legacy service_role key)"
            : null,
          !config.cronSecretConfigured ? "CRON_SECRET" : null,
        ].filter((value): value is string => Boolean(value));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label htmlFor="reminder-enabled">Daily reminder</Label>
          <p className="text-xs text-muted-foreground">
            One notification a day, within about an hour of your chosen time.
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
          disabled={
            deviceBusy ||
            support === "unsupported" ||
            support === "ios-standalone-only" ||
            permission === "denied"
          }
        >
          {deviceBusy ? <Loader2 className="animate-spin" /> : <BellRing />}
          Enable on this device
        </Button>
        <Button
          variant="outline"
          onClick={() => void sendTestNotification()}
          disabled={
            testBusy ||
            support === "unsupported" ||
            support === "ios-standalone-only" ||
            permission !== "granted" ||
            savedSubscriptionCount === 0 ||
            !hasBrowserSubscription ||
            !configReady
          }
        >
          {testBusy ? <Loader2 className="animate-spin" /> : <Send />}
          Send test notification
        </Button>
        <p className="text-xs text-muted-foreground">
          Reminders are sent to each device you enable separately. Deleting the
          app or clearing site data stops that device&apos;s reminders.
        </p>
        <p className="text-xs text-muted-foreground">
          Status: {statusText}
          {refreshing ? " (refreshing)" : null}
        </p>
        {missingServerValues.length > 0 ? (
          <p className="text-xs text-destructive">
            Missing or invalid server configuration: {missingServerValues.join(", ")}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
