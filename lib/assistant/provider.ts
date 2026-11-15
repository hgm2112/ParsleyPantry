import "server-only";
import { z } from "zod";
import {
  type InterpretRequest,
  type ProposedAction,
  proposedActionSchema,
} from "@/lib/assistant/schema";

export type ProviderResult = {
  actions: ProposedAction[];
  questions: string[];
  model?: string;
};

export type ProviderError = {
  code:
    | "not_configured"
    | "quota_exceeded"
    | "rate_limited"
    | "unauthorized"
    | "unavailable"
    | "invalid_response"
    | "unknown";
  message: string;
  retryable?: boolean;
  status?: number;
};

export type ProviderOutcome =
  | { ok: true; data: ProviderResult }
  | { ok: false; error: ProviderError };

export interface AssistantProvider {
  mode: "ai" | "no_ai";
  interpret(input: InterpretRequest): Promise<ProviderOutcome>;
}

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";

function getModel(): string {
  return process.env.ASSISTANT_GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
}

function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

const SYSTEM_PROMPT = `You are an assistant that interprets grocery/pantry/freezer/household commands for a home inventory app.
Return ONLY valid JSON matching this shape:
{
  "actions": [
    {
      "id": "a1",
      "intent": "add_grocery_item|add_inventory_item|consume_inventory|move_inventory|add_household_item|add_household_to_grocery|save_preference|clarify",
      "domain": "food|grocery|household",
      "itemText": "string",
      "resolvedItemId": null,
      "barcode": null,
      "brand": null,
      "packageSize": null,
      "quantity": null,
      "unit": null,
      "location": "pantry|fridge|freezer|null",
      "secondaryLocation": "pantry|fridge|freezer|null",
      "secondaryQuantity": null,
      "expirationDate": null,
      "notes": null,
      "confidence": 0.0,
      "needsClarification": false,
      "clarificationQuestion": null,
      "summary": "short human-readable summary"
    }
  ],
  "questions": ["optional follow-up questions"]
}
Rules:
- Propose actions only; never claim changes were made.
- Split multi-item/multi-action commands into separate actions.
- If information is missing or ambiguous (item, quantity, unit, location, food vs household, brand/size/UPC), set needsClarification true and ask a clear question; do not guess.
- Keep household supplies (toiletries, cleaning, paper goods etc.) in domain "household" / household intents, not food inventory.
- Use concise summaries. Output JSON only.`;

const aiOutputSchema = z.object({
  actions: z.array(proposedActionSchema).default([]),
  questions: z.array(z.string()).default([]),
});

function normalizeGeminiError(status: number, bodyText: string): ProviderError {
  const lower = bodyText.toLowerCase();
  if (status === 401 || status === 403) {
    return { code: "unauthorized", message: "Gemini API key is missing or not authorized.", status };
  }
  if (status === 429 || lower.includes("quota") || lower.includes("rate") || lower.includes("resource_exhausted")) {
    return {
      code: lower.includes("quota") ? "quota_exceeded" : "rate_limited",
      message: "Gemini is temporarily unavailable because the free quota or rate limit was reached. Try again later or use manual entry.",
      retryable: true,
      status,
    };
  }
  if (status >= 500) {
    return {
      code: "unavailable",
      message: "Gemini is temporarily unavailable. Try again later or use manual entry.",
      retryable: true,
      status,
    };
  }
  return { code: "unknown", message: "Gemini could not interpret that request.", retryable: false, status };
}

function extractJsonText(payload: any): string | null {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const texts = parts
    .map((p: any) => (typeof p?.text === "string" ? p.text : null))
    .filter(Boolean) as string[];
  if (texts.length === 0) return null;
  return texts.join("\n").trim();
}

export class GeminiProvider implements AssistantProvider {
  mode = "ai" as const;

  async interpret(input: InterpretRequest): Promise<ProviderOutcome> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return {
        ok: false,
        error: {
          code: "not_configured",
          message: "AI assistant is not configured (missing GEMINI_API_KEY).",
          retryable: false,
        },
      };
    }

    const model = getModel();
    const historyLines = (input.history ?? [])
      .map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.text}`)
      .join("\n");
    const userText = historyLines
      ? `Previous conversation (for context):\n${historyLines}\n\nCurrent message:\n${input.text}`
      : input.text;

    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    };

    let resp: Response;
    try {
      resp = await fetch(`${GEMINI_ENDPOINT}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });
    } catch {
      return {
        ok: false,
        error: { code: "unavailable", message: "Could not reach Gemini. Check your connection or try again later.", retryable: true },
      };
    }

    const text = await resp.text();
    if (!resp.ok) {
      return { ok: false, error: normalizeGeminiError(resp.status, text) };
    }

    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      return { ok: false, error: { code: "invalid_response", message: "Gemini returned an unreadable response.", retryable: true } };
    }

    const jsonText = extractJsonText(payload);
    if (!jsonText) {
      return { ok: false, error: { code: "invalid_response", message: "Gemini returned no interpretable content.", retryable: true } };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      const match = jsonText.match(/\{[\s\S]*\}/);
      if (!match) return { ok: false, error: { code: "invalid_response", message: "Gemini returned invalid JSON.", retryable: true } };
      try { parsed = JSON.parse(match[0]); } catch {
        return { ok: false, error: { code: "invalid_response", message: "Gemini returned invalid JSON.", retryable: true } };
      }
    }

    const validated = aiOutputSchema.safeParse(parsed);
    if (!validated.success) {
      return { ok: false, error: { code: "invalid_response", message: "Gemini returned an unexpected format.", retryable: true } };
    }

    const actions = validated.data.actions.map((a, i) => ({
      ...a,
      id: a.id || `a${i + 1}`,
    }));
    return { ok: true, data: { actions, questions: validated.data.questions ?? [], model } };
  }
}

// --- No-AI fallback: simple, limited rule-based parsing (no external calls) ---

function parseQuantityToken(tok: string): number | null {
  const n = Number(tok);
  if (Number.isFinite(n) && n >= 0) return n;
  const words: Record<string, number> = {
    a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, dozen: 12, half: 0.5,
  };
  return words[tok.toLowerCase()] ?? null;
}

function guessDomainAndIntent(text: string): { intent: ProposedAction["intent"]; domain: ProposedAction["domain"] } {
  const t = text.toLowerCase();
  const householdHints = /(toothpaste|toilet paper|paper towel|soap|shampoo|detergent|trash bag|foil|wrap|sponge|cleaner|bleach|deodorant|tissue|napkin)/;
  if (householdHints.test(t) && /(add|bought|buy|need)/.test(t)) {
    return /(grocery|shopping list|list)/.test(t)
      ? { intent: "add_household_to_grocery", domain: "household" }
      : { intent: "add_household_item", domain: "household" };
  }
  if (/(shopping list|grocery list|to (my |the )?list|on the list)/.test(t) || (/^add\b/.test(t) && /list/.test(t))) {
    return { intent: "add_grocery_item", domain: "grocery" };
  }
  if (/(used|ate|consumed|finished|ran out of|threw out)/.test(t)) {
    return { intent: "consume_inventory", domain: "food" };
  }
  if (/(move|put|store).*(freezer|fridge|pantry)/.test(t) || /(freeze|froze)/.test(t)) {
    return { intent: "move_inventory", domain: "food" };
  }
  if (/(bought|buy|got|picked up|add).*(fridge|freezer|pantry)/.test(t)) {
    return { intent: "add_inventory_item", domain: "food" };
  }
  if (/^add\b/.test(t)) {
    return { intent: "add_grocery_item", domain: "grocery" };
  }
  return { intent: "clarify", domain: "food" };
}

export class NoAiProvider implements AssistantProvider {
  mode = "no_ai" as const;

  async interpret(input: InterpretRequest): Promise<ProviderOutcome> {
    const text = input.text.trim();
    const { intent, domain } = guessDomainAndIntent(text);

    const qtyMatch = text.match(/\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|a|an|half|dozen)\b/i);
    const quantity = qtyMatch ? parseQuantityToken(qtyMatch[1]) : null;

    let location: "pantry" | "fridge" | "freezer" | null = null;
    if (/\bfreezer\b/i.test(text)) location = "freezer";
    else if (/\bfridge\b|refrigerator\b/i.test(text)) location = "fridge";
    else if (/\bpantry\b/i.test(text)) location = "pantry";

    const needsClarification = intent === "clarify" || text.split(/\band\b|,|;/i).length > 2;
    const clarificationQuestion = needsClarification
      ? "I can handle simple commands without AI. Please specify the action (add to shopping list, add to pantry/fridge/freezer, or used), the item, and the quantity/location—or use the manual add/scan screens."
      : null;

    const cleanedItem = text
      .replace(/^(add|bought|buy|got|picked up|i used|used|put|move)\s+/i, "")
      .replace(/\b(to (my |the )?(shopping )?list|to the (fridge|freezer|pantry)|in the (fridge|freezer|pantry))\b/gi, "")
      .replace(/\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|a|an|half|dozen)\b/i, "")
      .replace(/\s+/g, " ")
      .trim() || text;

    const action: ProposedAction = {
      id: "a1",
      intent,
      domain,
      itemText: cleanedItem.slice(0, 200),
      resolvedItemId: null,
      barcode: null,
      brand: null,
      packageSize: null,
      quantity,
      unit: null,
      location,
      secondaryLocation: null,
      secondaryQuantity: null,
      expirationDate: null,
      notes: null,
      confidence: needsClarification ? 0.2 : 0.45,
      needsClarification,
      clarificationQuestion,
      summary: needsClarification ? "Needs clarification (no-AI mode)" : `Proposed: ${intent.replace(/_/g, " ")} — ${cleanedItem}`,
      allowCreateNew: false,
    };

    const questions = needsClarification && clarificationQuestion ? [clarificationQuestion] : [];
    return { ok: true, data: { actions: [action], questions, model: "no-ai" } };
  }
}

export function getProvider(preferNoAi?: boolean): AssistantProvider {
  if (preferNoAi || !isGeminiConfigured()) return new NoAiProvider();
  return new GeminiProvider();
}

export function isAiAvailable(): boolean {
  return isGeminiConfigured();
}
