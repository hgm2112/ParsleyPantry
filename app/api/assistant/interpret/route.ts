import { NextResponse, type NextRequest } from "next/server";
import { requireDal } from "@/lib/auth";
import { checkRateLimit } from "@/lib/assistant/rate-limit";
import { getProvider, isAiAvailable } from "@/lib/assistant/provider";
import { groundActions } from "@/lib/assistant/grounding";
import { interpretRequestSchema, type InterpretResponse } from "@/lib/assistant/schema";

export const maxDuration = 30;

export async function POST(request: NextRequest): Promise<NextResponse<InterpretResponse>> {
  let dal;
  try {
    dal = await requireDal();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        mode: "no_ai",
        transcript: "",
        actions: [],
        questions: [],
        error: { code: "unauthorized", message: "You must be signed in." },
      },
      { status: 401 },
    );
  }

  const rl = checkRateLimit(`assistant:${dal.householdId}:${dal.user.id}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      {
        ok: false,
        mode: "no_ai",
        transcript: "",
        actions: [],
        questions: [],
        error: {
          code: "rate_limited",
          message: "Too many assistant requests. Please wait a moment and try again.",
          retryable: true,
        },
      },
      { status: 429, headers: rl.retryAfterSec ? { "Retry-After": String(rl.retryAfterSec) } : undefined },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        mode: "no_ai",
        transcript: "",
        actions: [],
        questions: [],
        error: { code: "invalid_request", message: "Request body must be valid JSON." },
      },
      { status: 400 },
    );
  }

  const parsed = interpretRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        mode: "no_ai",
        transcript: "",
        actions: [],
        questions: [],
        error: {
          code: "invalid_request",
          message: parsed.error.issues[0]?.message ?? "Invalid request.",
        },
      },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const provider = getProvider(input.preferNoAi);
  const outcome = await provider.interpret(input);

  if (!outcome.ok) {
    // If AI fails (quota/unavailable/etc.) fall back to no-AI parsing so the
    // assistant remains usable without Gemini.
    if (provider.mode === "ai") {
      const fallback = await getProvider(true).interpret(input);
      if (fallback.ok) {
        const grounded = await groundActions(dal.supabase, dal.householdId, fallback.data.actions);
        const questions = Array.from(
          new Set([
            ...(fallback.data.questions ?? []),
            ...grounded.flatMap((a) => (a.clarificationQuestion ? [a.clarificationQuestion] : [])),
          ]),
        );
        return NextResponse.json(
          {
            ok: true,
            mode: "no_ai",
            transcript: input.text,
            actions: grounded,
            questions,
            error: {
              code: outcome.error.code,
              message: `${outcome.error.message} Switched to no-AI mode for now.`,
              retryable: outcome.error.retryable,
            },
          },
          { status: 200 },
        );
      }
    }

    if (outcome.error.code === "not_configured") {
      const fallback = await getProvider(true).interpret(input);
      if (fallback.ok) {
        const grounded = await groundActions(dal.supabase, dal.householdId, fallback.data.actions);
        return NextResponse.json({
          ok: true,
          mode: "no_ai",
          transcript: input.text,
          actions: grounded,
          questions: Array.from(
            new Set([
              ...(fallback.data.questions ?? []),
              ...grounded.flatMap((a) => (a.clarificationQuestion ? [a.clarificationQuestion] : [])),
            ]),
          ),
          error: { code: "not_configured", message: outcome.error.message, retryable: false },
        });
      }
    }

    const status =
      outcome.error.code === "unauthorized" ? 502 :
      outcome.error.code === "quota_exceeded" || outcome.error.code === "rate_limited" ? 429 :
      outcome.error.code === "unavailable" || outcome.error.code === "invalid_response" ? 503 : 500;

    return NextResponse.json(
      {
        ok: false,
        mode: provider.mode,
        transcript: input.text,
        actions: [],
        questions: [],
        error: {
          code: outcome.error.code,
          message: outcome.error.message,
          retryable: outcome.error.retryable,
        },
      },
      { status },
    );
  }

  const grounded = await groundActions(dal.supabase, dal.householdId, outcome.data.actions);
  const questions = Array.from(
    new Set([
      ...(outcome.data.questions ?? []),
      ...grounded.flatMap((a) => (a.clarificationQuestion ? [a.clarificationQuestion] : [])),
    ]),
  );

  return NextResponse.json({
    ok: true,
    mode: provider.mode,
    transcript: input.text,
    actions: grounded,
    questions,
    error: null,
  });
}

// Small capability hint endpoint for UI (no secrets exposed)
export async function GET() {
  try {
    await requireDal();
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, aiAvailable: isAiAvailable() });
}
