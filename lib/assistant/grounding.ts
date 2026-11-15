import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProposedAction } from "@/lib/assistant/schema";

export type Candidate = {
  id: string;
  name: string;
  barcode?: string | null;
  brand?: string | null;
  unit?: string | null;
  packageSize?: string | null;
  canonicalItemId?: string | null;
  isPreferred?: boolean;
  source?: "catalog" | "preference" | "household";
};

export type GroundedAction = ProposedAction & {
  match?: {
    kind: "item" | "household_item" | "none" | "ambiguous";
    id?: string | null;
    name?: string | null;
    barcode?: string | null;
    brand?: string | null;
    unit?: string | null;
    packageSize?: string | null;
    candidates?: Candidate[];
    reason?: string;
    /** True when this intent would create a new catalog/household record if saved as-is. */
    wouldCreateNew?: boolean;
    /** Requires explicit user choice before saving (e.g. create new vs pick existing). */
    requiresExplicitChoice?: boolean;
  };
};

function normTerm(text: string): string {
  return text.trim().toLowerCase();
}

function packageLabel(packSize?: number | null, packUnit?: string | null, unit?: string | null): string | null {
  if (packSize && packSize > 1) return `${packSize} ${packUnit || "pieces"} per pack`;
  if (unit) return unit;
  return null;
}

async function getPreferences(
  supabase: SupabaseClient,
  householdId: string,
  userId: string,
  domain: "food" | "household",
  term: string,
): Promise<Array<{ preferred_item_id: string | null; preferred_household_item_id: string | null; preferred_barcode: string | null; brand: string | null; package_size: string | null; user_id: string | null }>> {
  const { data } = await supabase
    .from("product_preferences")
    .select("preferred_item_id, preferred_household_item_id, preferred_barcode, brand, package_size, user_id")
    .eq("household_id", householdId)
    .eq("domain", domain)
    .ilike("term", term);
  const rows = (data ?? []) as any[];
  // Prefer user-specific over household-wide
  return rows.sort((a, b) => (a.user_id ? 0 : 1) - (b.user_id ? 0 : 1));
}

async function findCatalogCandidates(
  supabase: SupabaseClient,
  householdId: string,
  text: string,
): Promise<Candidate[]> {
  const q = text.trim();
  if (!q) return [];
  const safe = q.replace(/[%_,()]/g, " ").trim();
  const orParts = [`name.ilike.%${safe}%`];
  if (/^[\x21-\x7e]{4,64}$/.test(q)) orParts.push(`barcode.eq.${q}`);
  const { data } = await supabase
    .from("items")
    .select("id, name, barcode, brand, unit, pack_size, pack_unit, canonical_item_id")
    .eq("household_id", householdId)
    .or(orParts.join(","))
    .order("name", { ascending: true })
    .limit(12);
  const rows = (data ?? []) as Array<{
    id: string; name: string; barcode: string | null; brand: string | null; unit: string | null;
    pack_size: number | null; pack_unit: string | null; canonical_item_id: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    barcode: r.barcode,
    brand: r.brand,
    unit: r.unit,
    packageSize: packageLabel(r.pack_size, r.pack_unit, r.unit),
    canonicalItemId: r.canonical_item_id,
    source: "catalog" as const,
  }));
}

async function findHouseholdCandidates(
  supabase: SupabaseClient,
  householdId: string,
  text: string,
): Promise<Candidate[]> {
  const q = text.trim();
  if (!q) return [];
  const safe = q.replace(/[%_,()]/g, " ").trim();
  const orParts = [`name.ilike.%${safe}%`];
  if (/^[\x21-\x7e]{4,64}$/.test(q)) orParts.push(`barcode.eq.${q}`);
  const { data } = await supabase
    .from("household_items")
    .select("id, name, barcode, unit, category, storage_location")
    .eq("household_id", householdId)
    .or(orParts.join(","))
    .order("name", { ascending: true })
    .limit(12);
  const rows = (data ?? []) as Array<{ id: string; name: string; barcode: string | null; unit: string | null }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    barcode: r.barcode,
    unit: r.unit,
    source: "household" as const,
  }));
}

async function fetchCatalogByIds(supabase: SupabaseClient, householdId: string, ids: string[]): Promise<Candidate[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("items")
    .select("id, name, barcode, brand, unit, pack_size, pack_unit, canonical_item_id")
    .eq("household_id", householdId)
    .in("id", ids);
  const rows = (data ?? []) as Array<{
    id: string; name: string; barcode: string | null; brand: string | null; unit: string | null;
    pack_size: number | null; pack_unit: string | null; canonical_item_id: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    barcode: r.barcode,
    brand: r.brand,
    unit: r.unit,
    packageSize: packageLabel(r.pack_size, r.pack_unit, r.unit),
    canonicalItemId: r.canonical_item_id,
    source: "catalog" as const,
  }));
}

async function fetchHouseholdByIds(supabase: SupabaseClient, householdId: string, ids: string[]): Promise<Candidate[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("household_items")
    .select("id, name, barcode, unit")
    .eq("household_id", householdId)
    .in("id", ids);
  const rows = (data ?? []) as Array<{ id: string; name: string; barcode: string | null; unit: string | null }>;
  return rows.map((r) => ({ id: r.id, name: r.name, barcode: r.barcode, unit: r.unit, source: "household" as const }));
}

function rankAndPick(
  candidates: Candidate[],
  text: string,
  preferredIds: Set<string>,
  preferredBarcodes: Set<string>,
): { picked: Candidate | null; ambiguous: boolean } {
  if (candidates.length === 0) return { picked: null, ambiguous: false };
  const t = normTerm(text);
  const scored = candidates.map((c) => {
    let score = 0;
    if (preferredIds.has(c.id)) score += 100;
    if (c.barcode && preferredBarcodes.has(c.barcode)) score += 90;
    if (normTerm(c.name) === t) score += 50;
    if (normTerm(c.name).startsWith(t) || t.startsWith(normTerm(c.name))) score += 10;
    // Prefer canonical/root-like entries (no canonical_item_id) slightly when names are generic
    if (!c.canonicalItemId) score += 2;
    return { c, score };
  });
  scored.sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name));
  const top = scored[0];
  const second = scored[1];
  // Confident if uniquely preferred or exact unique match
  if (top && (preferredIds.has(top.c.id) || (top.c.barcode && preferredBarcodes.has(top.c.barcode)))) {
    if (!second || top.score - second.score >= 20 || normTerm(top.c.name) === t) {
      return { picked: { ...top.c, isPreferred: true }, ambiguous: false };
    }
  }
  if (top && normTerm(top.c.name) === t) {
    if (!second || normTerm(second.c.name) !== t) return { picked: top.c, ambiguous: false };
  }
  if (scored.length === 1) return { picked: scored[0].c, ambiguous: false };
  return { picked: null, ambiguous: true };
}

function createsNewByDefault(intent: string): boolean {
  return intent === "add_inventory_item" || intent === "add_household_item";
}

export async function groundActions(
  supabase: SupabaseClient,
  householdId: string,
  actions: ProposedAction[],
  userId?: string,
): Promise<GroundedAction[]> {
  const out: GroundedAction[] = [];
  for (const action of actions) {
    const isHousehold =
      action.domain === "household" ||
      action.intent === "add_household_item" ||
      action.intent === "add_household_to_grocery";
    const domain: "food" | "household" = isHousehold ? "household" : "food";
    const term = normTerm(action.itemText);

    let candidates = isHousehold
      ? await findHouseholdCandidates(supabase, householdId, action.itemText)
      : await findCatalogCandidates(supabase, householdId, action.itemText);

    let preferredIds = new Set<string>();
    let preferredBarcodes = new Set<string>();
    try {
      if (userId) {
        const prefs = await getPreferences(supabase, householdId, userId, domain, term);
        for (const p of prefs) {
          if (domain === "food" && p.preferred_item_id) preferredIds.add(p.preferred_item_id);
          if (domain === "household" && p.preferred_household_item_id) preferredIds.add(p.preferred_household_item_id);
          if (p.preferred_barcode) preferredBarcodes.add(p.preferred_barcode);
        }
        const prefIds = [...preferredIds];
        const prefCandidates = isHousehold
          ? await fetchHouseholdByIds(supabase, householdId, prefIds)
          : await fetchCatalogByIds(supabase, householdId, prefIds);
        const byId = new Map(candidates.map((c) => [c.id, c]));
        for (const pc of prefCandidates) {
          if (!byId.has(pc.id)) {
            candidates = [pc, ...candidates];
            byId.set(pc.id, pc);
          }
        }
        candidates = candidates.map((c) => ({ ...c, isPreferred: preferredIds.has(c.id) || (c.barcode ? preferredBarcodes.has(c.barcode) : false) }));
      }
    } catch {
      // preferences table may not exist or query may fail; continue without them
    }

    // If action came with a barcode, try to prioritize that match
    if (action.barcode) {
      const bc = candidates.find((c) => c.barcode === action.barcode);
      if (bc) {
        candidates = [{ ...bc, isPreferred: true }, ...candidates.filter((c) => c.id !== bc.id)];
        preferredBarcodes.add(action.barcode);
      }
    }

    let match: GroundedAction["match"];
    if (action.resolvedItemId) {
      const resolved = candidates.find((c) => c.id === action.resolvedItemId);
      match = {
        kind: isHousehold ? "household_item" : "item",
        id: action.resolvedItemId,
        name: resolved?.name ?? action.itemText,
        barcode: resolved?.barcode ?? action.barcode ?? null,
        brand: resolved?.brand ?? action.brand ?? null,
        unit: resolved?.unit ?? null,
        packageSize: resolved?.packageSize ?? action.packageSize ?? null,
        candidates,
        wouldCreateNew: false,
        requiresExplicitChoice: false,
      };
    } else if (candidates.length === 0) {
      const wouldCreateNew = createsNewByDefault(action.intent);
      match = {
        kind: "none",
        candidates: [],
        reason: "No existing match found",
        wouldCreateNew,
        requiresExplicitChoice: wouldCreateNew && !action.allowCreateNew,
      };
    } else {
      const { picked, ambiguous } = rankAndPick(candidates, action.itemText, preferredIds, preferredBarcodes);
      if (ambiguous || !picked) {
        match = {
          kind: "ambiguous",
          candidates,
          reason: "Multiple possible matches — pick the correct one",
          wouldCreateNew: false,
          requiresExplicitChoice: true,
        };
      } else {
        match = {
          kind: isHousehold ? "household_item" : "item",
          id: picked.id,
          name: picked.name,
          barcode: picked.barcode ?? null,
          brand: picked.brand ?? null,
          unit: picked.unit ?? null,
          packageSize: picked.packageSize ?? null,
          candidates,
          wouldCreateNew: false,
          requiresExplicitChoice: false,
        };
      }
    }

    let needsClarification = action.needsClarification;
    let clarificationQuestion = action.clarificationQuestion;

    if (match.kind === "ambiguous" && !needsClarification) {
      needsClarification = true;
      clarificationQuestion = clarificationQuestion || `I found multiple matches for "${action.itemText}". Please pick the correct one before confirming.`;
    }
    if (match.requiresExplicitChoice && match.wouldCreateNew && !action.allowCreateNew) {
      needsClarification = true;
      clarificationQuestion = clarificationQuestion || `I couldn’t find an existing match for "${action.itemText}". To keep things organized, please pick an existing item or explicitly choose to create a new one.`;
    }

    const enriched: GroundedAction = {
      ...action,
      // carry through matched details when known
      barcode: action.barcode ?? match.barcode ?? null,
      brand: action.brand ?? match.brand ?? null,
      packageSize: action.packageSize ?? match.packageSize ?? null,
      resolvedItemId:
        action.resolvedItemId ??
        (match.kind === "item" || match.kind === "household_item" ? match.id ?? null : null),
      needsClarification,
      clarificationQuestion: clarificationQuestion ?? null,
      match,
    };

    // Keep grocery adds safe-ish: they can reference a name; creating a catalog
    // entry happens in add flow. We don't block grocery list lines by name, but
    // we do show match status clearly.
    out.push(enriched);
  }
  return out;
}
