import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProposedAction } from "@/lib/assistant/schema";

export type GroundedAction = ProposedAction & {
  match?: {
    kind: "item" | "household_item" | "none" | "ambiguous";
    id?: string | null;
    name?: string | null;
    candidates?: Array<{ id: string; name: string; barcode?: string | null }>;
    reason?: string;
  };
};

async function findCatalogCandidates(
  supabase: SupabaseClient,
  householdId: string,
  text: string,
): Promise<Array<{ id: string; name: string; barcode: string | null }>> {
  const q = text.trim();
  if (!q) return [];
  const safe = q.replace(/[%_,()]/g, " ").trim();
  const { data } = await supabase
    .from("items")
    .select("id, name, barcode")
    .eq("household_id", householdId)
    .or(`name.ilike.%${safe}%,barcode.eq.${q}`)
    .limit(6);
  return (data ?? []) as Array<{ id: string; name: string; barcode: string | null }>;
}

async function findHouseholdCandidates(
  supabase: SupabaseClient,
  householdId: string,
  text: string,
): Promise<Array<{ id: string; name: string; barcode: string | null }>> {
  const q = text.trim();
  if (!q) return [];
  const safe = q.replace(/[%_,()]/g, " ").trim();
  const { data } = await supabase
    .from("household_items")
    .select("id, name, barcode")
    .eq("household_id", householdId)
    .or(`name.ilike.%${safe}%,barcode.eq.${q}`)
    .limit(6);
  return (data ?? []) as Array<{ id: string; name: string; barcode: string | null }>;
}

function pickMatch(candidates: Array<{ id: string; name: string; barcode?: string | null }>, text: string) {
  if (candidates.length === 0) return { kind: "none" as const };
  const exact = candidates.find((c) => c.name.toLowerCase() === text.toLowerCase());
  if (exact) return { kind: "item" as const, id: exact.id, name: exact.name, candidates };
  if (candidates.length === 1) return { kind: "item" as const, id: candidates[0].id, name: candidates[0].name, candidates };
  return { kind: "ambiguous" as const, candidates, reason: "Multiple possible matches" };
}

export async function groundActions(
  supabase: SupabaseClient,
  householdId: string,
  actions: ProposedAction[],
): Promise<GroundedAction[]> {
  const out: GroundedAction[] = [];
  for (const action of actions) {
    const isHousehold =
      action.domain === "household" ||
      action.intent === "add_household_item" ||
      action.intent === "add_household_to_grocery";
    const candidates = isHousehold
      ? await findHouseholdCandidates(supabase, householdId, action.itemText)
      : await findCatalogCandidates(supabase, householdId, action.itemText);

    let match: GroundedAction["match"];
    if (action.resolvedItemId) {
      match = { kind: isHousehold ? "household_item" : "item", id: action.resolvedItemId, name: action.itemText, candidates };
    } else if (candidates.length === 0) {
      match = { kind: "none", candidates: [], reason: "No existing match found" };
    } else {
      const picked = pickMatch(candidates, action.itemText);
      if (picked.kind === "ambiguous") {
        match = { kind: "ambiguous", candidates: picked.candidates, reason: picked.reason };
      } else if (picked.kind === "item") {
        match = { kind: isHousehold ? "household_item" : "item", id: picked.id, name: picked.name, candidates };
      } else {
        match = { kind: "none", candidates: [] };
      }
    }

    let needsClarification = action.needsClarification;
    let clarificationQuestion = action.clarificationQuestion;
    if (match.kind === "ambiguous" && !needsClarification) {
      needsClarification = true;
      clarificationQuestion = clarificationQuestion || `I found multiple matches for "${action.itemText}". Which one do you mean?`;
    }

    out.push({
      ...action,
      resolvedItemId:
        action.resolvedItemId ??
        (match.kind === "item" || match.kind === "household_item" ? match.id ?? null : null),
      needsClarification,
      clarificationQuestion: clarificationQuestion ?? null,
      match,
    });
  }
  return out;
}
