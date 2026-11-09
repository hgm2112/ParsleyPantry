"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDal } from "@/lib/auth";
import { lookupOffProduct, type OffProduct } from "@/lib/off";
import {
  HOUSEHOLD_CATEGORIES,
  HOUSEHOLD_STORAGE_LOCATIONS,
  type HouseholdItemRow,
} from "@/lib/types";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const categorySchema = z.enum(HOUSEHOLD_CATEGORIES);
const locationSchema = z.enum(HOUSEHOLD_STORAGE_LOCATIONS);

const createSchema = z.object({
  name: z.string().trim().min(1).max(160),
  quantity: z.number().min(0).max(9999).default(1),
  unit: z.string().trim().max(32).nullish(),
  category: categorySchema.default("Miscellaneous"),
  storageLocation: locationSchema.default("Other"),
  lowThreshold: z.number().min(0).max(9999).nullish(),
  notes: z.string().trim().max(1000).nullish(),
  barcode: z
    .string()
    .trim()
    .regex(/^(?:[\x21-\x7e]{1,64})?$/)
    .nullish()
    .transform((value) => (value ? value : null)),
  canonicalName: z
    .string()
    .max(400)
    .nullish()
    .transform((value) => {
      const trimmed = (value ?? "").trim().slice(0, 160);
      return trimmed ? trimmed : null;
    }),
});

export type CreateHouseholdItemInput = z.input<typeof createSchema>;

async function findByName(
  supabase: Awaited<ReturnType<typeof requireDal>>["supabase"],
  householdId: string,
  name: string,
) {
  const { data } = await supabase
    .from("household_items")
    .select("*")
    .eq("household_id", householdId)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  return (data as HouseholdItemRow | null) ?? null;
}

async function findByBarcode(
  supabase: Awaited<ReturnType<typeof requireDal>>["supabase"],
  householdId: string,
  barcode: string,
) {
  const { data } = await supabase
    .from("household_items")
    .select("*")
    .eq("household_id", householdId)
    .eq("barcode", barcode)
    .maybeSingle();
  return (data as HouseholdItemRow | null) ?? null;
}

async function resolveHouseholdCanonicalRoot(
  supabase: Awaited<ReturnType<typeof requireDal>>["supabase"],
  householdId: string,
  canonicalName: string,
  createdBy: string,
): Promise<HouseholdItemRow | null> {
  const trimmed = canonicalName.trim().slice(0, 160);
  if (!trimmed) return null;
  const existing = await findByName(supabase, householdId, trimmed);
  if (existing) return existing;
  const { data, error } = await supabase
    .from("household_items")
    .insert({
      household_id: householdId,
      name: trimmed,
      quantity: 0,
      unit: null,
      category: "Miscellaneous",
      storage_location: "Other",
      created_by: createdBy,
    })
    .select("*")
    .single();
  if (!error && data) return data as HouseholdItemRow;
  const retry = await findByName(supabase, householdId, trimmed);
  return retry;
}

export async function createHouseholdItem(
  rawInput: CreateHouseholdItemInput,
): Promise<ActionResult<{ item: HouseholdItemRow }>> {
  try {
    const parsed = createSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const input = parsed.data;
    const { supabase, householdId, user } = await requireDal();

    const canonicalRoot = input.canonicalName
      ? await resolveHouseholdCanonicalRoot(
          supabase,
          householdId,
          input.canonicalName,
          user.id,
        )
      : null;
    const canonicalId =
      canonicalRoot &&
      canonicalRoot.name.trim().toLowerCase() !== input.name.trim().toLowerCase()
        ? canonicalRoot.id
        : null;

    let existing: HouseholdItemRow | null = null;
    if (input.barcode) existing = await findByBarcode(supabase, householdId, input.barcode);
    if (!existing) existing = await findByName(supabase, householdId, input.name);

    if (existing) {
      const nextQty = existing.quantity + input.quantity;
      if (nextQty < 0) return { ok: false, error: "Quantity cannot be negative" };
      const patch: Record<string, unknown> = { quantity: nextQty };
      if (input.unit) patch.unit = input.unit;
      if (input.category !== "Miscellaneous") patch.category = input.category;
      if (input.storageLocation !== "Other") patch.storage_location = input.storageLocation;
      if (input.lowThreshold !== undefined) patch.low_threshold = input.lowThreshold;
      if (input.notes) patch.notes = input.notes;
      if (canonicalId && !existing.canonical_household_item_id) {
        patch.canonical_household_item_id = canonicalId;
      }
      const { data, error } = await supabase
        .from("household_items")
        .update(patch)
        .eq("id", existing.id)
        .eq("household_id", householdId)
        .select("*")
        .single();
      if (error || !data) return { ok: false, error: error?.message ?? "Could not update item" };
      revalidatePath("/household");
      return { ok: true, data: { item: data as HouseholdItemRow } };
    }

    const { data, error } = await supabase
      .from("household_items")
      .insert({
        household_id: householdId,
        name: input.name,
        quantity: input.quantity,
        unit: input.unit || null,
        category: input.category,
        storage_location: input.storageLocation,
        low_threshold: input.lowThreshold ?? null,
        notes: input.notes || null,
        barcode: input.barcode || null,
        canonical_household_item_id: canonicalId ?? null,
        created_by: user.id,
      })
      .select("*")
      .single();
    if (error || !data) {
      // Race on unique name/barcode — reuse the winner.
      const retry =
        (input.barcode ? await findByBarcode(supabase, householdId, input.barcode) : null) ??
        (await findByName(supabase, householdId, input.name));
      if (retry) {
        const { error: updErr } = await supabase
          .from("household_items")
          .update({ quantity: retry.quantity + input.quantity })
          .eq("id", retry.id);
        if (updErr) return { ok: false, error: updErr.message };
        const { data: refreshed } = await supabase
          .from("household_items")
          .select("*")
          .eq("id", retry.id)
          .single();
        revalidatePath("/household");
        return { ok: true, data: { item: refreshed as HouseholdItemRow } };
      }
      return { ok: false, error: error?.message ?? "Could not add item" };
    }
    revalidatePath("/household");
    return { ok: true, data: { item: data as HouseholdItemRow } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not add item" };
  }
}

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    quantity: z.number().min(0).max(9999).optional(),
    unit: z.string().trim().max(32).nullish(),
    category: categorySchema.optional(),
    storageLocation: locationSchema.optional(),
    lowThreshold: z.number().min(0).max(9999).nullish(),
    notes: z.string().trim().max(1000).nullish(),
    barcode: z.string().trim().max(64).nullish(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: "Nothing to update" });

export async function updateHouseholdItem(
  id: string,
  rawPatch: z.input<typeof updateSchema>,
): Promise<ActionResult<{ item: HouseholdItemRow }>> {
  try {
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid item" };
    const parsed = updateSchema.safeParse(rawPatch);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const patch = parsed.data;
    const { supabase, householdId } = await requireDal();

    const dbPatch: Record<string, unknown> = {};
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.quantity !== undefined) {
      if (patch.quantity < 0) return { ok: false, error: "Quantity cannot be negative" };
      dbPatch.quantity = patch.quantity;
    }
    if (patch.unit !== undefined) dbPatch.unit = patch.unit || null;
    if (patch.category !== undefined) dbPatch.category = patch.category;
    if (patch.storageLocation !== undefined) dbPatch.storage_location = patch.storageLocation;
    if (patch.lowThreshold !== undefined) dbPatch.low_threshold = patch.lowThreshold;
    if (patch.notes !== undefined) dbPatch.notes = patch.notes ? patch.notes : null;
    if (patch.barcode !== undefined) dbPatch.barcode = patch.barcode ? patch.barcode.trim() : null;

    const { data, error } = await supabase
      .from("household_items")
      .update(dbPatch)
      .eq("id", id)
      .eq("household_id", householdId)
      .select("*")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Item not found" };
    revalidatePath("/household");
    return { ok: true, data: { item: data as HouseholdItemRow } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Update failed" };
  }
}

export async function adjustHouseholdQuantity(
  id: string,
  delta: number,
): Promise<ActionResult<{ deleted: boolean }>> {
  try {
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid item" };
    if (!Number.isFinite(delta) || delta === 0) return { ok: false, error: "Invalid quantity" };
    const { supabase, householdId } = await requireDal();
    const { data: current } = await supabase
      .from("household_items")
      .select("*")
      .eq("household_id", householdId)
      .eq("id", id)
      .maybeSingle();
    const row = current as HouseholdItemRow | null;
    if (!row) return { ok: false, error: "Item not found" };
    const nextQty = row.quantity + delta;
    if (nextQty < 0) return { ok: false, error: "Quantity cannot be negative" };
    if (nextQty <= 0) {
      const { error } = await supabase
        .from("household_items")
        .delete()
        .eq("id", id)
        .eq("household_id", householdId);
      if (error) return { ok: false, error: error.message };
      revalidatePath("/household");
      return { ok: true, data: { deleted: true } };
    }
    const { error } = await supabase
      .from("household_items")
      .update({ quantity: nextQty })
      .eq("id", id)
      .eq("household_id", householdId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/household");
    return { ok: true, data: { deleted: false } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Update failed" };
  }
}

export async function listHouseholdCanonicalCandidates(): Promise<
  ActionResult<{ items: { id: string; name: string }[] }>
> {
  try {
    const { supabase, householdId } = await requireDal();
    const { data, error } = await supabase
      .from("household_items")
      .select("id, name")
      .eq("household_id", householdId)
      .order("name", { ascending: true })
      .limit(200);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { items: ((data ?? []) as { id: string; name: string }[]) } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Lookup failed" };
  }
}

/**
 * Points a household supply at the generic it matches as (or clears).
 * Never overwrites name/barcode/qty; generic is resolve-or-created (qty 0).
 * Typing the item's own name clears — same as food canonical.
 */
export async function setHouseholdCanonical(
  itemId: string,
  canonicalName: string | null,
): Promise<
  ActionResult<{
    canonicalHouseholdItemId: string | null;
    canonicalName: string | null;
  }>
> {
  try {
    if (!z.string().uuid().safeParse(itemId).success) {
      return { ok: false, error: "Invalid item" };
    }
    const { supabase, householdId, user } = await requireDal();
    const { data } = await supabase
      .from("household_items")
      .select("*")
      .eq("household_id", householdId)
      .eq("id", itemId)
      .maybeSingle();
    const item = data as HouseholdItemRow | null;
    if (!item) return { ok: false, error: "Item not found" };

    const trimmed = (canonicalName ?? "").trim().slice(0, 160);
    let root: HouseholdItemRow | null = null;
    // Typing this item's own name clears, even if a differently-cased
    // root exists under the same name.
    const same =
      trimmed !== "" && item.name.trim().toLowerCase() === trimmed.toLowerCase();
    if (trimmed && !same) {
      root = await resolveHouseholdCanonicalRoot(
        supabase,
        householdId,
        trimmed,
        user.id,
      );
      if (root && root.id === itemId) root = null;
    }

    const { error } = await supabase
      .from("household_items")
      .update({ canonical_household_item_id: root?.id ?? null })
      .eq("household_id", householdId)
      .eq("id", itemId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/household");
    revalidatePath("/grocery");
    return {
      ok: true,
      data: {
        canonicalHouseholdItemId: root?.id ?? null,
        canonicalName: root?.name ?? null,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Update failed" };
  }
}

export async function deleteHouseholdItem(id: string): Promise<ActionResult> {
  try {
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid item" };
    const { supabase, householdId } = await requireDal();
    const { error } = await supabase
      .from("household_items")
      .delete()
      .eq("id", id)
      .eq("household_id", householdId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/household");
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Delete failed" };
  }
}

/** Household-only barcode lookup. Never touches food catalog or inventory. */
export async function resolveHouseholdBarcode(
  barcode: string,
): Promise<
  ActionResult<{ item: HouseholdItemRow | null; off: OffProduct | null }>
> {
  try {
    const { supabase, householdId } = await requireDal();
    const code = barcode.trim();
    if (code.length < 4) return { ok: false, error: "Barcode is too short" };
    const existing = await findByBarcode(supabase, householdId, code);
    // OFF only for name/brands/unit — categories/expiry are ignored for supplies.
    const off = existing ? null : await lookupOffProduct(code);
    return { ok: true, data: { item: existing, off } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Lookup failed" };
  }
}

export type HouseholdCatalogResult = { items: HouseholdItemRow[] };

/** Isolated search — never calls searchCatalog (food) or creates food rows. */
export async function searchHouseholdCatalog(
  query: string,
  limit = 12,
): Promise<ActionResult<HouseholdCatalogResult>> {
  try {
    const { supabase, householdId } = await requireDal();
    const trimmed = query.trim();
    if (!trimmed) return { ok: true, data: { items: [] } };
    let builder = supabase
      .from("household_items")
      .select("*")
      .eq("household_id", householdId);
    if (/^\d{4,14}$/.test(trimmed)) {
      builder = builder.or(`barcode.eq.${trimmed},name.ilike.%${trimmed}%`);
    } else {
      builder = builder.ilike("name", `%${trimmed}%`);
    }
    const { data, error } = await builder
      .order("name", { ascending: true })
      .limit(limit);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { items: ((data ?? []) as HouseholdItemRow[]) } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Search failed" };
  }
}

/** Adds a household supply to the shared Shopping List, collapsed to its generic. */
export async function addHouseholdItemToGrocery(
  householdItemId: string,
): Promise<ActionResult<{ created: boolean; name: string }>> {
  try {
    if (!z.string().uuid().safeParse(householdItemId).success) {
      return { ok: false, error: "Invalid item" };
    }
    const { supabase, householdId, user } = await requireDal();
    const { data: itemData } = await supabase
      .from("household_items")
      .select("*")
      .eq("household_id", householdId)
      .eq("id", householdItemId)
      .maybeSingle();
    const item = itemData as HouseholdItemRow | null;
    if (!item) return { ok: false, error: "Item not found" };

    // Follow canonical chain to the generic so variants share one line.
    let rootId = item.id;
    let rootName = item.name;
    let rootUnit = item.unit;
    let nextId = item.canonical_household_item_id;
    for (let hop = 0; hop < 8 && nextId; hop += 1) {
      const { data: nextData } = await supabase
        .from("household_items")
        .select("id, name, unit, canonical_household_item_id")
        .eq("household_id", householdId)
        .eq("id", nextId)
        .maybeSingle();
      const next = nextData as {
        id: string;
        name: string;
        unit: string | null;
        canonical_household_item_id: string | null;
      } | null;
      if (!next) break;
      rootId = next.id;
      rootName = next.name;
      rootUnit = next.unit ?? rootUnit;
      nextId = next.canonical_household_item_id;
    }

    const { data: existingRows } = await supabase
      .from("grocery_items")
      .select("id, name")
      .eq("household_id", householdId)
      .eq("household_item_id", rootId)
      .eq("checked", false)
      .limit(1);
    const existing = (existingRows ?? [])[0] as { id: string; name: string } | undefined;
    if (existing) {
      revalidatePath("/grocery");
      return { ok: true, data: { created: false, name: existing.name } };
    }

    const { data, error } = await supabase
      .from("grocery_items")
      .insert({
        household_id: householdId,
        item_id: null,
        household_item_id: rootId,
        name: rootName,
        specific_name: item.name,
        quantity: 1,
        unit: rootUnit,
        category_id: null,
        checked: false,
        sale_only: false,
        source: "manual",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Could not add item" };
    revalidatePath("/grocery");
    return { ok: true, data: { created: true, name: rootName } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not add item" };
  }
}
