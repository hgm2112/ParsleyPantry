"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDal } from "@/lib/auth";
import { addGroceryItem } from "@/app/(app)/grocery/actions";
import { addToInventory, consumeFromItem } from "@/app/(app)/inventory/actions";
import {
  addHouseholdItemToGrocery,
  createHouseholdItem,
} from "@/app/(app)/household/actions";

const executeActionSchema = z.object({
  id: z.string().min(1).max(120),
  intent: z.enum([
    "add_grocery_item",
    "add_inventory_item",
    "consume_inventory",
    "move_inventory",
    "add_household_item",
    "add_household_to_grocery",
    "save_preference",
    "clarify",
  ]),
  domain: z.enum(["food", "grocery", "household"]),
  itemText: z.string().trim().min(1).max(200),
  resolvedItemId: z.string().uuid().nullable().optional(),
  barcode: z.string().trim().max(64).nullable().optional(),
  brand: z.string().trim().max(120).nullable().optional(),
  packageSize: z.string().trim().max(120).nullable().optional(),
  quantity: z.number().finite().nullable().optional(),
  unit: z.string().trim().max(32).nullable().optional(),
  location: z.enum(["pantry", "fridge", "freezer"]).nullable().optional(),
  secondaryLocation: z.enum(["pantry", "fridge", "freezer"]).nullable().optional(),
  secondaryQuantity: z.number().finite().nullable().optional(),
  expirationDate: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  needsClarification: z.boolean().optional(),
  clarificationQuestion: z.string().trim().max(300).nullable().optional(),
  summary: z.string().trim().max(300).nullable().optional(),
  savePreference: z.boolean().optional(),
  allowCreateNew: z.boolean().optional().default(false),
});

const executeSchema = z.object({
  actions: z.array(executeActionSchema).min(1).max(20),
  /** Client-generated idempotency key per submission. */
  executionKey: z.string().trim().min(1).max(120),
});

export type ExecuteAssistantActionInput = z.input<typeof executeActionSchema>;
export type ExecuteAssistantActionsInput = z.input<typeof executeSchema>;

export type ExecuteActionResult = {
  id: string;
  ok: boolean;
  message: string;
  details?: unknown;
};

// Best-effort in-memory idempotency (per server instance). Prevents accidental
// double-submits/retries in common cases; DB-backed log can be added later.
const executedKeys = new Map<string, number>();
function claimExecutionKey(key: string): boolean {
  const now = Date.now();
  const ttlMs = 5 * 60_000;
  const prev = executedKeys.get(key);
  if (prev && now - prev < ttlMs) return false;
  executedKeys.set(key, now);
  if (executedKeys.size > 5000) {
    for (const [k, t] of executedKeys) if (now - t >= ttlMs) executedKeys.delete(k);
  }
  return true;
}

async function maybeSavePreference(
  supabase: Awaited<ReturnType<typeof requireDal>>["supabase"],
  householdId: string,
  userId: string,
  action: z.infer<typeof executeActionSchema>,
  resolved: { domain: "food" | "household"; preferredItemId?: string | null; preferredHouseholdItemId?: string | null },
) {
  const term = action.itemText.trim().toLowerCase();
  if (!term) return;
  const preferredItemId = resolved.domain === "food" ? (resolved.preferredItemId ?? null) : null;
  const preferredHouseholdItemId = resolved.domain === "household" ? (resolved.preferredHouseholdItemId ?? null) : null;
  const hasTarget = Boolean(preferredItemId || preferredHouseholdItemId || action.barcode);
  // Learn preference when the user confirmed a specific resolved item/barcode
  // (and didn't force-create a brand-new unmatched entry), so repeats map to it.
  const shouldSave = action.savePreference || (hasTarget && !action.allowCreateNew);
  if (!shouldSave) return;
  try {
    // Best-effort: remove older preference rows for same scope/term to keep the
    // latest confirmed choice primary (ignore errors).
    let del = supabase
      .from("product_preferences")
      .delete()
      .eq("household_id", householdId)
      .eq("domain", resolved.domain)
      .ilike("term", term);
    del = action.savePreference ? del.eq("user_id", userId) : del; // learned can be household-wide
    await del;
  } catch {}
  try {
    await supabase.from("product_preferences").insert({
      household_id: householdId,
      user_id: userId,
      domain: resolved.domain,
      term,
      preferred_item_id: preferredItemId,
      preferred_household_item_id: preferredHouseholdItemId,
      preferred_barcode: action.barcode ?? null,
      brand: action.brand ?? null,
      package_size: action.packageSize ?? null,
      source: action.savePreference ? "manual" : "learned",
      use_count: 1,
      last_used_at: new Date().toISOString(),
      created_by: userId,
    });
  } catch {
    // table may not exist in some envs or insert may conflict; non-fatal
  }
}

export async function executeAssistantActions(
  rawInput: ExecuteAssistantActionsInput,
): Promise<{ ok: boolean; results: ExecuteActionResult[]; error?: string }> {
  const parsed = executeSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, results: [], error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }
  const input = parsed.data;

  let dal: Awaited<ReturnType<typeof requireDal>>;
  try {
    dal = await requireDal();
  } catch {
    return { ok: false, results: [], error: "You must be signed in." };
  }

  if (!claimExecutionKey(`${dal.householdId}:${dal.user.id}:${input.executionKey}`)) {
    return {
      ok: true,
      results: input.actions.map((a) => ({ id: a.id, ok: true, message: "Already submitted (duplicate prevented)." })),
    };
  }

  const results: ExecuteActionResult[] = [];

  for (const action of input.actions) {
    try {
      if (action.intent === "clarify" || action.needsClarification) {
        results.push({ id: action.id, ok: false, message: "This needs clarification before it can be saved." });
        continue;
      }

      if (action.intent === "add_grocery_item") {
        const res = await addGroceryItem({
          name: action.itemText,
          itemId: action.resolvedItemId ?? null,
          quantity: action.quantity ?? 1,
          unit: action.unit ?? null,
          source: "manual",
        });
        if (!res.ok) results.push({ id: action.id, ok: false, message: res.error });
        else {
          await maybeSavePreference(dal.supabase, dal.householdId, dal.user.id, action, { domain: "food", preferredItemId: action.resolvedItemId ?? null });
          results.push({ id: action.id, ok: true, message: res.data.created ? `Added "${res.data.name}" to shopping list.` : `"${res.data.name}" is already on your shopping list.` });
        }
        continue;
      }

      if (action.intent === "add_inventory_item") {
        // Safeguard: do not create a new catalog/inventory item from voice without
        // an explicit user choice. If no existing item is matched, require
        // allowCreateNew (and prefer adding details/UPC via normal add/scan flow).
        if (!action.resolvedItemId && !action.allowCreateNew) {
          let existing: { id: string } | null = null;
          if (action.barcode) {
            const { data } = await dal.supabase
              .from("items")
              .select("id")
              .eq("household_id", dal.householdId)
              .eq("barcode", action.barcode)
              .maybeSingle();
            existing = (data as { id: string } | null) ?? null;
          }
          if (!existing) {
            const { data } = await dal.supabase
              .from("items")
              .select("id")
              .eq("household_id", dal.householdId)
              .ilike("name", action.itemText.trim())
              .limit(1)
              .maybeSingle();
            existing = (data as { id: string } | null) ?? null;
          }
          if (!existing) {
            results.push({
              id: action.id,
              ok: false,
              message: "To keep things organized, I won’t create a new inventory item unless you explicitly choose to. Pick an existing match or choose “Create new item” (adding a UPC/brand/size helps keep it organized).",
            });
            continue;
          }
          action.resolvedItemId = existing.id;
        }

        const res = await addToInventory({
          itemId: action.resolvedItemId ?? null,
          name: action.itemText,
          location: action.location ?? "pantry",
          quantity: action.quantity ?? 1,
          unit: action.unit ?? null,
          expirationDate: action.expirationDate && /^\d{4}-\d{2}-\d{2}$/.test(action.expirationDate) ? action.expirationDate : null,
          notes: action.notes ?? null,
          brand: action.brand ?? null,
          barcode: action.barcode ?? null,
          source: "assistant",
        });
        if (!res.ok) results.push({ id: action.id, ok: false, message: res.error });
        else {
          await maybeSavePreference(dal.supabase, dal.householdId, dal.user.id, action, { domain: "food", preferredItemId: res.data.inventory.item_id ?? action.resolvedItemId ?? null });
          results.push({ id: action.id, ok: true, message: `Added ${action.quantity ?? 1} ${action.unit ?? ""} ${action.itemText} to ${action.location ?? "pantry"}.`.replace(/\s+/g, " ").trim() });
        }
        continue;
      }

      if (action.intent === "consume_inventory") {
        if (!action.resolvedItemId) {
          results.push({ id: action.id, ok: false, message: "I need a matched pantry item to record what was used. Please match it or use the inventory screen." });
          continue;
        }
        const res = await consumeFromItem({
          itemId: action.resolvedItemId,
          amount: action.quantity ?? 1,
          location: action.location ?? undefined,
          addToGrocery: false,
        });
        if (!res.ok) results.push({ id: action.id, ok: false, message: res.error });
        else results.push({ id: action.id, ok: true, message: `Recorded ${action.quantity ?? 1} used from ${action.itemText}.`, details: { remaining: res.data.remaining } });
        continue;
      }

      if (action.intent === "add_household_item") {
        // Safeguard: do not create a new household item without explicit choice.
        if (!action.resolvedItemId && !action.allowCreateNew) {
          let existing: { id: string } | null = null;
          if (action.barcode) {
            const { data } = await dal.supabase
              .from("household_items")
              .select("id")
              .eq("household_id", dal.householdId)
              .eq("barcode", action.barcode)
              .maybeSingle();
            existing = (data as { id: string } | null) ?? null;
          }
          if (!existing) {
            const { data } = await dal.supabase
              .from("household_items")
              .select("id")
              .eq("household_id", dal.householdId)
              .ilike("name", action.itemText.trim())
              .limit(1)
              .maybeSingle();
            existing = (data as { id: string } | null) ?? null;
          }
          if (!existing) {
            results.push({
              id: action.id,
              ok: false,
              message: "To keep things organized, I won’t create a new household item unless you explicitly choose to. Pick an existing match or choose “Create new item”.",
            });
            continue;
          }
          action.resolvedItemId = existing.id;
        }

        // If matched to an existing household item, adjust quantity instead of creating.
        if (action.resolvedItemId) {
          const { data: existingItem } = await dal.supabase
            .from("household_items")
            .select("id, name, quantity")
            .eq("household_id", dal.householdId)
            .eq("id", action.resolvedItemId)
            .maybeSingle();
          if (existingItem) {
            const nextQty = ((existingItem as any).quantity ?? 0) + (action.quantity ?? 1);
            const { error: updErr } = await dal.supabase
              .from("household_items")
              .update({ quantity: nextQty, notes: action.notes ?? undefined })
              .eq("household_id", dal.householdId)
              .eq("id", action.resolvedItemId);
            if (updErr) results.push({ id: action.id, ok: false, message: updErr.message });
            else {
              await maybeSavePreference(dal.supabase, dal.householdId, dal.user.id, action, { domain: "household", preferredHouseholdItemId: action.resolvedItemId });
              results.push({ id: action.id, ok: true, message: `Updated "${(existingItem as any).name}" in household supplies.` });
            }
            continue;
          }
        }

        const res = await createHouseholdItem({
          name: action.itemText,
          quantity: action.quantity ?? 1,
          unit: action.unit ?? null,
          notes: action.notes ?? null,
          barcode: action.barcode ?? null,
        });
        if (!res.ok) results.push({ id: action.id, ok: false, message: res.error });
        else {
          await maybeSavePreference(dal.supabase, dal.householdId, dal.user.id, action, { domain: "household", preferredHouseholdItemId: res.data.item.id });
          results.push({ id: action.id, ok: true, message: `Added "${res.data.item.name}" to household supplies.` });
        }
        continue;
      }

      if (action.intent === "add_household_to_grocery") {
        if (!action.resolvedItemId) {
          results.push({ id: action.id, ok: false, message: "Please match this to a household item first, or add it from the Household or Grocery screen." });
          continue;
        }
        const res = await addHouseholdItemToGrocery(action.resolvedItemId);
        if (!res.ok) results.push({ id: action.id, ok: false, message: res.error });
        else {
          await maybeSavePreference(dal.supabase, dal.householdId, dal.user.id, action, { domain: "household", preferredHouseholdItemId: action.resolvedItemId });
          results.push({ id: action.id, ok: true, message: res.data.created ? `Added "${res.data.name}" to shopping list.` : `"${res.data.name}" is already on your shopping list.` });
        }
        continue;
      }

      if (action.intent === "move_inventory") {
        results.push({
          id: action.id,
          ok: false,
          message: "Moving/splitting items between locations isn’t supported from the assistant yet. Please move it from the Inventory screen for now.",
        });
        continue;
      }

      if (action.intent === "save_preference") {
        results.push({ id: action.id, ok: true, message: "Preference noted (will be applied when supported)." });
        continue;
      }

      results.push({ id: action.id, ok: false, message: "This action type isn’t supported yet." });
    } catch (e) {
      results.push({ id: action.id, ok: false, message: e instanceof Error ? e.message : "Could not complete this action." });
    }
  }

  revalidatePath("/home");
  revalidatePath("/inventory");
  revalidatePath("/grocery");
  revalidatePath("/household");
  revalidatePath("/plan");

  const ok = results.every((r) => r.ok);
  return { ok, results };
}
