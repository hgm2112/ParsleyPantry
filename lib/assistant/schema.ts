import { z } from "zod";

export const assistantDomainSchema = z.enum(["food", "grocery", "household"]);
export type AssistantDomain = z.infer<typeof assistantDomainSchema>;

export const assistantIntentSchema = z.enum([
  "add_grocery_item",
  "add_inventory_item",
  "consume_inventory",
  "move_inventory",
  "add_household_item",
  "add_household_to_grocery",
  "save_preference",
  "clarify",
]);
export type AssistantIntent = z.infer<typeof assistantIntentSchema>;

export const assistantLocationSchema = z.enum(["pantry", "fridge", "freezer"]);

export const proposedActionSchema = z.object({
  id: z.string().min(1).max(120),
  intent: assistantIntentSchema,
  domain: assistantDomainSchema,
  /** Free-text item name as understood from the user. */
  itemText: z.string().trim().min(1).max(200),
  /** Resolved catalog/inventory/household item id when confidently matched (optional). */
  resolvedItemId: z.string().uuid().nullable().optional(),
  /** e.g. food item barcode/UPC when known. */
  barcode: z.string().trim().max(64).nullable().optional(),
  brand: z.string().trim().max(120).nullable().optional(),
  packageSize: z.string().trim().max(120).nullable().optional(),
  quantity: z.number().finite().nullable().optional(),
  unit: z.string().trim().max(32).nullable().optional(),
  /** Destination or affected location for inventory actions. */
  location: assistantLocationSchema.nullable().optional(),
  /** Secondary location for moves/splits (e.g. "1 lb freezer, 1 lb fridge"). */
  secondaryLocation: assistantLocationSchema.nullable().optional(),
  secondaryQuantity: z.number().finite().nullable().optional(),
  expirationDate: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  needsClarification: z.boolean().default(false),
  clarificationQuestion: z.string().trim().max(300).nullable().optional(),
  /** Human-readable summary for review UI. */
  summary: z.string().trim().max(300).nullable().optional(),
  /**
   * User explicitly confirmed creating a new catalog/household item when no
   * existing match should be used (organization safeguard).
   */
  allowCreateNew: z.boolean().optional().default(false),
});
export type ProposedAction = z.infer<typeof proposedActionSchema>;

export const interpretRequestSchema = z.object({
  /** User message/transcript to interpret (AI mode) or parse (no-AI fallback). */
  text: z.string().trim().min(1).max(4000),
  /** Optional recent turns for follow-ups/corrections; keep minimal. */
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().trim().min(1).max(2000),
      }),
    )
    .max(10)
    .optional()
    .default([]),
  /** Client/session correlation id (for idempotency/logging later). */
  sessionId: z.string().trim().max(120).optional(),
  /** Force no-AI parsing even if Gemini is configured. */
  preferNoAi: z.boolean().optional().default(false),
});
export type InterpretRequest = z.infer<typeof interpretRequestSchema>;

export const interpretResponseSchema = z.object({
  ok: z.boolean(),
  mode: z.enum(["ai", "no_ai"]),
  transcript: z.string(),
  actions: z.array(proposedActionSchema),
  questions: z.array(z.string()),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      retryable: z.boolean().optional(),
    })
    .nullable()
    .optional(),
});
export type InterpretResponse = z.infer<typeof interpretResponseSchema>;

export const ASSISTANT_INTENTS = assistantIntentSchema.options;
