import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GrocerySource } from "@/lib/types";

export type EnsureGroceryInput = {
  itemId: string | null;
  name: string;
  quantity?: number;
  unit?: string | null;
  categoryId?: string | null;
  source: GrocerySource;
};

/**
 * Adds an unchecked grocery row unless the same item is already waiting to be
 * bought. Never duplicates low-stock / consume re-adds.
 */
export async function ensureGroceryItem(
  supabase: SupabaseClient,
  householdId: string,
  input: EnsureGroceryInput,
): Promise<{ created: boolean; id: string | null }> {
  const base = supabase
    .from("grocery_items")
    .select("id")
    .eq("household_id", householdId)
    .eq("checked", false);

  const { data: existingRows } = await (
    input.itemId
      ? base.eq("item_id", input.itemId)
      : base.eq("name", input.name)
  ).limit(1);

  const existing = (existingRows ?? [])[0] as { id: string } | undefined;
  if (existing) return { created: false, id: existing.id };

  const { data: inserted, error } = await supabase
    .from("grocery_items")
    .insert({
      household_id: householdId,
      item_id: input.itemId,
      name: input.name,
      quantity: input.quantity ?? 1,
      unit: input.unit ?? null,
      category_id: input.categoryId ?? null,
      source: input.source,
    })
    .select("id")
    .single();

  if (error || !inserted) return { created: false, id: null };
  return { created: true, id: (inserted as { id: string }).id };
}
