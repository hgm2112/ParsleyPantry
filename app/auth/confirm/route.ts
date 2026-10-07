import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles email templates that link with `{{ .TokenHash }}` instead of
 * `{{ .ConfirmationURL }}`:
 * {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}&next=/inventory
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type") ?? "signup";
  const next = searchParams.get("next") ?? "/home";
  const safeNext = next.startsWith("/") ? next : "/home";

  if (tokenHash) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: typeParam as
        | "signup"
        | "invite"
        | "magiclink"
        | "recovery"
        | "email_change",
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("That confirmation link was invalid or expired.")}`,
  );
}
