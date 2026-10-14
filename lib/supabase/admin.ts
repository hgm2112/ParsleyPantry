import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for the cron sender only. Bypasses RLS by design —
 * never import this from a client component or a user-facing server action.
 * The key lives exclusively in the SUPABASE_SERVICE_ROLE_KEY env var.
 */
/**
 * Checks whether a Supabase key is a JWT whose `role` claim is `service_role`.
 * Never logs or returns the key or its payload.
 */
export function isServiceRoleKey(serviceKey?: string): boolean {
  if (!serviceKey) return false;
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
  if (!isServiceRoleKey(serviceKey)) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not a service-role key — the reminder cron cannot run.",
    );
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
