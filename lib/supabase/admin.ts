import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for the cron sender only. Bypasses RLS by design —
 * never import this from a client component or a user-facing server action.
 * The key lives exclusively in the SUPABASE_SERVICE_ROLE_KEY env var.
 */
/**
 * Checks whether a Supabase key is a current-format secret key (`sb_secret_…`)
 * or a legacy JWT whose `role` claim is `service_role`. Never logs or returns
 * the key or its payload.
 */
export function isAdminServiceKey(serviceKey?: string): boolean {
  if (!serviceKey) return false;
  if (
    serviceKey.startsWith("sb_secret_") &&
    serviceKey.length > "sb_secret_".length &&
    !/\s/.test(serviceKey)
  ) {
    return true;
  }
  const segments = serviceKey.split(".");
  if (segments.length !== 3) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(segments[1], "base64url").toString("utf8"),
    ) as { role?: string };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — the reminder cron cannot run.",
    );
  }
  if (!isAdminServiceKey(serviceKey)) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not a valid secret key or legacy service_role key — the reminder cron cannot run.",
    );
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
