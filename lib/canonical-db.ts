import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Location } from "@/lib/types";

/**
 * Finds (or creates) the root catalog item behind a canonical ingredient
 * name. Always returns a root — a chain would break the "store the root
 * directly" invariant that keeps matching one hop.
 */
export async function resolveCanonicalRoot(
  supabase: SupabaseClient,
  householdId: string,
  rawName: string,
  opts: { location: Location; categoryId?: string | null; createdBy: string },
): Promise<{ id: string; name: string; created: boolean } | null> {
  const name = rawName.replace(/[%_]/g, " ").replace(/\s+/g, " ").trim();
  if (!name) return null;

  const lookup = async (): Promise<{ id: string; name: string } | null> => {
    const { data } = await supabase
      .from("items")
      .select("id, name, canonical_item_id")
      .eq("household_id", householdId)
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    const found = data as
      | { id: string; name: string; canonical_item_id: string | null }
      | null;
    if (!found) return null;
    // Follow the chain to the root (depth-capped; writes never make chains).
    let current = found;
    for (let hop = 0; hop < 8 && current.canonical_item_id; hop += 1) {
      const { data: next } = await supabase
        .from("items")
        .select("id, name, canonical_item_id")
        .eq("household_id", householdId)
        .eq("id", current.canonical_item_id)
        .maybeSingle();
      if (!next) break;
      const nextRow = next as {
        id: string;
        name: string;
        canonical_item_id: string | null;
      };
      if (nextRow.id === current.id) break;
      current = nextRow;
    }
    return { id: current.id, name: current.name };
  };

  const existing = await lookup();
  if (existing) return { ...existing, created: false };

  const { data: inserted, error } = await supabase
    .from("items")
    .insert({
      household_id: householdId,
      name,
      default_location: opts.location,
      category_id: opts.categoryId ?? null,
      created_by: opts.createdBy,
    })
    .select("id, name, canonical_item_id")
    .single();
  if (!error && inserted) {
    const row = inserted as {
      id: string;
      name: string;
      canonical_item_id: string | null;
    };
    return { id: row.id, name: row.name, created: true };
  }

  // A concurrent insert may have won the unique-name race; reuse it.
  const raced = await lookup();
  return raced ? { ...raced, created: false } : null;
}
