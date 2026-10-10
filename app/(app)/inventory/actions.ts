"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDal } from "@/lib/auth";
import { lookupOffProduct, type OffProduct } from "@/lib/off";
import { ensureGroceryItem } from "@/lib/grocery";
import {
  FREEZER_FOOD_TYPES,
  computeFreezerQualityDate,
} from "@/lib/freezer";
import {
  fefoSort,
  isItemLow,
  toBatchSnapshot,
  type BatchSnapshot,
} from "@/lib/batches";
import { earliest, imperialFactor, isLowStock, toImperialStock } from "@/lib/stock";
import type {
  InventoryRow,
  InventoryWithItem,
  ItemRow,
  Location,
} from "@/lib/types";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const locationSchema = z.enum(["pantry", "fridge", "freezer"]);

const addInputSchema = z.object({
  itemId: z.string().uuid().nullish(),
  name: z.string().trim().min(1).max(160),
  subcategoryId: z.string().uuid().nullish(),
  barcode: z
    .string()
    .trim()
    .regex(/^\d{0,14}$/)
    .nullish()
    .transform((value) => (value ? value : null)),
  categoryId: z.string().uuid().nullish(),
  location: locationSchema,
  quantity: z.number().min(0).max(9999),
  unit: z.string().trim().max(32).nullish(),
  expirationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .transform((value) => (value ? value : null)),
  source: z.string().trim().max(60).nullish(),
  notes: z.string().trim().max(500).nullish(),
  lowThreshold: z.number().min(0).nullish(),
  expirationDays: z.number().int().min(0).max(3650).nullish(),
  autoRestock: z.boolean().nullish(),
});

export type AddToInventoryInput = z.input<typeof addInputSchema>;

export async function resolveBarcode(
  barcode: string,
): Promise<
  ActionResult<{ item: ItemRow | null; off: OffProduct | null; inventory: InventoryRow[] }>
> {
  try {
    const { supabase, householdId } = await requireDal();

    const code = barcode.trim();
    const { data } = await supabase
      .from("items")
      .select("*")
      .eq("household_id", householdId)
      .eq("barcode", code)
      .maybeSingle();

    const item = data as ItemRow | null;
    let inventory: InventoryRow[] = [];

    if (item) {
      const { data: rows } = await supabase
        .from("inventory")
        .select("*")
        .eq("household_id", householdId)
        .eq("item_id", item.id);
      inventory = (rows ?? []) as InventoryRow[];
    }

    const off = item ? null : await lookupOffProduct(code);
    return { ok: true, data: { item, off, inventory } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Lookup failed",
    };
  }
}

async function findItemByName(
  supabase: Awaited<ReturnType<typeof requireDal>>["supabase"],
  householdId: string,
  name: string,
): Promise<ItemRow | null> {
  const { data } = await supabase
    .from("items")
    .select("*")
    .eq("household_id", householdId)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  return (data as ItemRow | null) ?? null;
}

async function loadItem(
  supabase: Awaited<ReturnType<typeof requireDal>>["supabase"],
  householdId: string,
  id: string,
): Promise<ItemRow | null> {
  const { data } = await supabase
    .from("items")
    .select("*")
    .eq("household_id", householdId)
    .eq("id", id)
    .maybeSingle();
  return (data as ItemRow | null) ?? null;
}

async function loadInventory(
  supabase: Awaited<ReturnType<typeof requireDal>>["supabase"],
  householdId: string,
  inventoryId: string,
): Promise<InventoryWithItem | null> {
  const { data } = await supabase
    .from("inventory")
    .select("*, item:items(*)")
    .eq("household_id", householdId)
    .eq("id", inventoryId)
    .maybeSingle();

  if (!data) return null;
  const row = data as unknown as InventoryWithItem;
  return row;
}

/** Adds to stock, merging into an existing row for that location when present. */
export async function addToInventory(
  rawInput: AddToInventoryInput,
): Promise<ActionResult<{ inventory: InventoryWithItem; createdItem: boolean }>> {
  try {
    const parsed = addInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const input = parsed.data;
    const { supabase, householdId, user } = await requireDal();

    const imperial = toImperialStock(input.quantity, input.unit ?? null);
    const quantity = imperial.quantity;
    const unit = imperial.unit;
    const thresholdFactor = imperialFactor(input.unit ?? null);
    const lowThreshold =
      input.lowThreshold != null && thresholdFactor != null
        ? Math.round(input.lowThreshold * thresholdFactor * 10) / 10
        : (input.lowThreshold ?? null);

    let item: ItemRow | null = null;
    let createdItem = false;

    if (input.itemId) {
      item = await loadItem(supabase, householdId, input.itemId);
      if (!item) return { ok: false, error: "Item not found" };
    } else if (input.barcode) {
      const { data } = await supabase
        .from("items")
        .select("*")
        .eq("household_id", householdId)
        .eq("barcode", input.barcode)
        .maybeSingle();
      item = (data as ItemRow | null) ?? null;
    }

    if (!item) {
      item = await findItemByName(supabase, householdId, input.name);
    }

    if (!item) {
      const { data: inserted, error: insertError } = await supabase
        .from("items")
        .insert({
          household_id: householdId,
          name: input.name,
          barcode: input.barcode ?? null,
          category_id: input.categoryId ?? null,
          subcategory_id: input.subcategoryId ?? null,
          default_location: input.location,
          expiration_days: input.expirationDays ?? null,
          low_threshold: lowThreshold,
          auto_restock: input.autoRestock ?? false,
          unit,
          created_by: user.id,
        })
        .select("*")
        .single();

      if (insertError || !inserted) {
        // A concurrent insert may have won the unique-name race; reuse it.
        item = await findItemByName(supabase, householdId, input.name);
        if (!item) {
          return { ok: false, error: insertError?.message ?? "Could not create item" };
        }
      } else {
        item = inserted as ItemRow;
        createdItem = true;
      }
    } else if (
      input.lowThreshold != null ||
      input.expirationDays != null ||
      input.autoRestock != null ||
      input.categoryId != null ||
      input.subcategoryId != null
    ) {
      const patch: Record<string, unknown> = {};
      if (lowThreshold != null) patch.low_threshold = lowThreshold;
      if (input.expirationDays != null) patch.expiration_days = input.expirationDays;
      if (input.autoRestock != null) patch.auto_restock = input.autoRestock;
      if (input.categoryId != null) patch.category_id = input.categoryId;
      if (input.subcategoryId != null) patch.subcategory_id = input.subcategoryId;
      await supabase.from("items").update(patch).eq("id", item.id);
      item = { ...item, ...patch } as ItemRow;
    }

    // Batch key: same item + location + expiration date + freezing history =
    // the same batch (quantities merge). Anything else starts a new batch.
    const { data: existingRows } = await supabase
      .from("inventory")
      .select("*")
      .eq("household_id", householdId)
      .eq("item_id", item.id)
      .eq("location", input.location);

    const findExisting = (rows: InventoryRow[]) =>
      rows.find(
        (row) =>
          row.expiration_date === input.expirationDate &&
          row.frozen_at === null &&
          row.freezer_duration_months === null,
      ) ?? null;

    const existing = findExisting((existingRows ?? []) as InventoryRow[]);
    let inventoryId: string;

    if (existing) {
      const mergedQuantity = existing.quantity + quantity;
      const { data: updated, error: updateError } = await supabase
        .from("inventory")
        .update({
          quantity: mergedQuantity,
          expiration_date: earliest(existing.expiration_date, input.expirationDate),
          unit: unit ?? existing.unit,
          source: input.source ?? existing.source,
          notes: input.notes ?? existing.notes,
          added_by: user.id,
        })
        .eq("id", existing.id)
        .select("id")
        .single();
      if (updateError || !updated) {
        return { ok: false, error: updateError?.message ?? "Update failed" };
      }
      inventoryId = (updated as { id: string }).id;
    } else {
      const { data: insertedRow, error: insertRowError } = await supabase
        .from("inventory")
        .insert({
          household_id: householdId,
          item_id: item.id,
          location: input.location,
          quantity,
          unit,
          expiration_date: input.expirationDate,
          source: input.source ?? null,
          notes: input.notes ?? null,
          added_by: user.id,
        })
        .select("id")
        .single();
      if (insertRowError || !insertedRow) {
        if (insertRowError?.code === "23505") {
          // A concurrent identical batch won the race — merge into it.
          const { data: raceRows } = await supabase
            .from("inventory")
            .select("*")
            .eq("household_id", householdId)
            .eq("item_id", item.id)
            .eq("location", input.location);
          const raced = findExisting((raceRows ?? []) as InventoryRow[]);
          if (raced) {
            const { data: merged, error: mergeError } = await supabase
              .from("inventory")
              .update({
                quantity: raced.quantity + quantity,
                unit: unit ?? raced.unit,
                source: input.source ?? raced.source,
                notes: input.notes ?? raced.notes,
                added_by: user.id,
              })
              .eq("id", raced.id)
              .select("id")
              .single();
            if (!mergeError && merged) {
              inventoryId = (merged as { id: string }).id;
            } else {
              return { ok: false, error: mergeError?.message ?? insertRowError.message };
            }
          } else {
            return { ok: false, error: insertRowError.message };
          }
        } else {
          return {
            ok: false,
            error: insertRowError?.message ?? "Could not add to inventory",
          };
        }
      } else {
        inventoryId = (insertedRow as { id: string }).id;
      }
    }

    const result = await loadInventory(supabase, householdId, inventoryId);
    if (!result) return { ok: false, error: "Could not load updated item" };

    await maybeAutoRestock(supabase, householdId, result);

    revalidatePath("/inventory");
    return { ok: true, data: { inventory: result, createdItem } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not add item",
    };
  }
}

async function maybeAutoRestock(
  supabase: Awaited<ReturnType<typeof requireDal>>["supabase"],
  householdId: string,
  inventory: InventoryWithItem,
) {
  const item = inventory.item;
  if (!item?.auto_restock) return;
  if (!isLowStock(inventory, item)) return;
  await ensureGroceryItem(supabase, householdId, {
    itemId: item.id,
    name: item.name,
    quantity: 1,
    unit: item.unit,
    categoryId: item.category_id,
    source: "low_stock",
  });
}

export type ConsumeInput = {
  inventoryId: string;
  amount: number;
  addToGrocery: boolean;
};

const consumeSchema = z.object({
  inventoryId: z.string().uuid(),
  amount: z.number().min(0).max(9999),
  addToGrocery: z.boolean(),
});

/** Decrements stock; hitting 0 deletes the row and offers a grocery re-add. */
export async function consumeInventory(
  rawInput: ConsumeInput,
): Promise<
  ActionResult<{
    quantity: number;
    low: boolean;
    groceryAdded: boolean;
    deleted: boolean;
    inventoryId: string;
  }>
> {
  try {
    const parsed = consumeSchema.safeParse(rawInput);
    if (!parsed.success) return { ok: false, error: "Invalid input" };
    const input = parsed.data;
    const { supabase, householdId, user } = await requireDal();

    const inventory = await loadInventory(supabase, householdId, input.inventoryId);
    if (!inventory) return { ok: false, error: "Item not found in inventory" };

    const quantity = Math.max(0, inventory.quantity - input.amount);
    const deleted = quantity <= 0;

    if (deleted) {
      const { error: deleteError } = await supabase
        .from("inventory")
        .delete()
        .eq("id", input.inventoryId);
      if (deleteError) return { ok: false, error: deleteError.message };
    } else {
      const { error: updateError } = await supabase
        .from("inventory")
        .update({ quantity, added_by: user.id })
        .eq("id", input.inventoryId);
      if (updateError) return { ok: false, error: updateError.message };
    }

    const updated: InventoryWithItem = { ...inventory, quantity };
    const low = deleted || isLowStock(updated, inventory.item);

    let groceryAdded = false;
    if (input.addToGrocery && inventory.item) {
      const result = await ensureGroceryItem(supabase, householdId, {
        itemId: inventory.item.id,
        name: inventory.item.name,
        quantity: 1,
        unit: inventory.item.unit,
        categoryId: inventory.item.category_id,
        source: "consume",
      });
      groceryAdded = result.created;
    } else if (inventory.item?.auto_restock && low) {
      const result = await ensureGroceryItem(supabase, householdId, {
        itemId: inventory.item.id,
        name: inventory.item.name,
        quantity: 1,
        unit: inventory.item.unit,
        categoryId: inventory.item.category_id,
        source: "low_stock",
      });
      groceryAdded = result.created;
    }

    revalidatePath("/inventory");
    revalidatePath("/grocery");
    return {
      ok: true,
      data: { quantity, low, groceryAdded, deleted, inventoryId: input.inventoryId },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update quantity",
    };
  }
}

const consumeItemSchema = z.object({
  itemId: z.string().uuid(),
  amount: z.number().min(0.01).max(9999),
  location: locationSchema.optional(),
  addToGrocery: z.boolean(),
});

export type ConsumeItemInput = z.input<typeof consumeItemSchema>;

export type ConsumeItemData = {
  affected: { inventoryId: string; deleted: boolean; quantity: number }[];
  snapshots: BatchSnapshot[];
  remaining: number;
  low: boolean;
  groceryAdded: boolean;
};

/**
 * Item-level consume: decrements batches FEFO (effective date first) within an
 * optional location scope. Each touched row's pre-consume snapshot is returned
 * so the client can undo via restoreBatches.
 */
export async function consumeFromItem(
  rawInput: ConsumeItemInput,
): Promise<ActionResult<ConsumeItemData>> {
  try {
    const parsed = consumeItemSchema.safeParse(rawInput);
    if (!parsed.success) return { ok: false, error: "Invalid input" };
    const input = parsed.data;
    const { supabase, householdId } = await requireDal();

    const { data: itemData, error: itemError } = await supabase
      .from("items")
      .select("*")
      .eq("household_id", householdId)
      .eq("id", input.itemId)
      .maybeSingle();
    if (itemError) return { ok: false, error: itemError.message };
    const item = (itemData ?? null) as ItemRow | null;

    const { data: rowsData, error: rowsError } = await supabase
      .from("inventory")
      .select("*")
      .eq("household_id", householdId)
      .eq("item_id", input.itemId);
    if (rowsError) return { ok: false, error: rowsError.message };

    let rows = ((rowsData ?? []) as InventoryRow[]).filter((row) => row.quantity > 0);
    if (input.location) rows = rows.filter((row) => row.location === input.location);
    rows = fefoSort(rows);

    const snapshots: BatchSnapshot[] = [];
    const affected: { inventoryId: string; deleted: boolean; quantity: number }[] = [];
    let remaining = input.amount;
    for (const row of rows) {
      if (remaining <= 0) break;
      const take = Math.min(row.quantity, remaining);
      if (take <= 0) continue;
      const nextQuantity = row.quantity - take;
      snapshots.push(toBatchSnapshot(row));
      if (nextQuantity <= 0) {
        const { error } = await supabase.from("inventory").delete().eq("id", row.id);
        if (error) return { ok: false, error: error.message };
        affected.push({ inventoryId: row.id, deleted: true, quantity: 0 });
      } else {
        const { error } = await supabase
          .from("inventory")
          .update({ quantity: nextQuantity })
          .eq("id", row.id);
        if (error) return { ok: false, error: error.message };
        affected.push({ inventoryId: row.id, deleted: false, quantity: nextQuantity });
      }
      remaining -= take;
    }

    const { data: afterData, error: afterError } = await supabase
      .from("inventory")
      .select("*")
      .eq("household_id", householdId)
      .eq("item_id", input.itemId);
    if (afterError) return { ok: false, error: afterError.message };
    const after = (afterData ?? []) as InventoryRow[];
    const afterTotal = after.reduce((sum, row) => sum + row.quantity, 0);
    const low = after.length === 0 || isItemLow(afterTotal, after, item);

    let groceryAdded = false;
    if (item) {
      if (input.addToGrocery) {
        const result = await ensureGroceryItem(supabase, householdId, {
          itemId: item.id,
          name: item.name,
          quantity: 1,
          unit: item.unit,
          categoryId: item.category_id,
          source: "consume",
        });
        groceryAdded = result.created;
      } else if (item.auto_restock && low) {
        const result = await ensureGroceryItem(supabase, householdId, {
          itemId: item.id,
          name: item.name,
          quantity: 1,
          unit: item.unit,
          categoryId: item.category_id,
          source: "low_stock",
        });
        groceryAdded = result.created;
      }
    }

    revalidatePath("/inventory");
    revalidatePath("/grocery");
    return {
      ok: true,
      data: { affected, snapshots, remaining: Math.max(0, remaining), low, groceryAdded },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not consume item",
    };
  }
}

const batchSnapshotSchema = z.object({
  id: z.string().uuid(),
  item_id: z.string().uuid(),
  location: locationSchema,
  quantity: z.number().min(0).max(9999),
  unit: z
    .string()
    .trim()
    .max(32)
    .nullish()
    .transform((value) => value ?? null),
  expiration_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .transform((value) => value ?? null),
  frozen_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .transform((value) => value ?? null),
  freezer_duration_months: z
    .number()
    .int()
    .min(0)
    .max(120)
    .nullish()
    .transform((value) => value ?? null),
  freezer_quality_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .transform((value) => value ?? null),
  is_low: z.boolean(),
  source: z
    .string()
    .trim()
    .max(60)
    .nullish()
    .transform((value) => value ?? null),
  notes: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((value) => value ?? null),
});

const restoreSchema = z.object({
  snapshots: z.array(batchSnapshotSchema).min(1).max(60),
});

/** Undo for consumeFromItem: re-inserts deleted rows (same ids) or tops back up survivors. */
export async function restoreBatches(
  rawInput: { snapshots: BatchSnapshot[] },
): Promise<ActionResult<{ restored: number }>> {
  try {
    const parsed = restoreSchema.safeParse(rawInput);
    if (!parsed.success) return { ok: false, error: "Invalid input" };
    const { supabase, householdId, user } = await requireDal();

    let restored = 0;
    for (const snap of parsed.data.snapshots) {
      const { data: existing, error: checkError } = await supabase
        .from("inventory")
        .select("id, quantity")
        .eq("household_id", householdId)
        .eq("id", snap.id)
        .maybeSingle();
      if (checkError) return { ok: false, error: checkError.message };

      if (existing) {
        // Row survived the consume (partial decrement) — restore its quantity.
        const { error: updateError } = await supabase
          .from("inventory")
          .update({ quantity: snap.quantity })
          .eq("id", snap.id)
          .eq("household_id", householdId);
        if (updateError) return { ok: false, error: updateError.message };
        restored += 1;
        continue;
      }

      const { error: insertError } = await supabase.from("inventory").insert({
        id: snap.id,
        household_id: householdId,
        item_id: snap.item_id,
        location: snap.location,
        quantity: snap.quantity,
        unit: snap.unit,
        expiration_date: snap.expiration_date,
        frozen_at: snap.frozen_at,
        freezer_duration_months: snap.freezer_duration_months,
        freezer_quality_date: snap.freezer_quality_date,
        is_low: snap.is_low,
        source: snap.source,
        notes: snap.notes,
        added_by: user.id,
      });
      if (insertError) {
        if (insertError.code === "23505") {
          // An identical batch exists now — top its quantity back up.
          const { data: siblingRows } = await supabase
            .from("inventory")
            .select("*")
            .eq("household_id", householdId)
            .eq("item_id", snap.item_id)
            .eq("location", snap.location);
          const sibling = ((siblingRows ?? []) as InventoryRow[]).find(
            (row) =>
              row.expiration_date === snap.expiration_date &&
              row.frozen_at === snap.frozen_at &&
              row.freezer_duration_months === snap.freezer_duration_months,
          );
          if (!sibling) return { ok: false, error: insertError.message };
          const { error: mergeError } = await supabase
            .from("inventory")
            .update({ quantity: sibling.quantity + snap.quantity })
            .eq("id", sibling.id);
          if (mergeError) return { ok: false, error: mergeError.message };
          restored += 1;
          continue;
        }
        return { ok: false, error: insertError.message };
      }
      restored += 1;
    }

    revalidatePath("/inventory");
    revalidatePath("/home");
    return { ok: true, data: { restored } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not restore batches",
    };
  }
}

const patchSchema = z.object({
  inventoryId: z.string().uuid(),
  itemName: z.string().trim().min(1).max(160).optional(),
  subcategoryId: z.string().uuid().nullish(),
  quantity: z.number().min(0).max(9999).optional(),
  unit: z.string().trim().max(32).nullish(),
  location: locationSchema.optional(),
  expirationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .transform((value) => (value === undefined ? undefined : (value ?? null))),
  source: z.string().trim().max(60).nullish(),
  notes: z.string().trim().max(500).nullish(),
  isLow: z.boolean().optional(),
  lowThreshold: z.number().min(0).nullish(),
  autoRestock: z.boolean().optional(),
  /** Freeze date (YYYY-MM-DD); null = frozen with unknown date. */
  frozenAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .transform((value) => (value === undefined ? undefined : (value ?? null))),
  /** Months from frozen_at to the best-quality date; null = not tracked. */
  freezerDurationMonths: z.number().int().min(0).max(120).nullish(),
  /** Food type key from lib/freezer.ts; null = "not sure". */
  freezerFoodType: z.string().trim().max(64).nullish(),
});

export type UpdateInventoryInput = z.input<typeof patchSchema>;

type FreezeColumns = {
  frozen_at: string | null;
  freezer_duration_months: number | null;
  freezer_quality_date: string | null;
};

/**
 * Freeze columns a row should end up with after a move/patch: thawed to null
 * outside the freezer; inside, recomputed from frozen_at + months when the
 * input touches them (never chained through a previous quality date).
 */
function resultingFreezeColumns(
  current: Pick<
    InventoryRow,
    "frozen_at" | "freezer_duration_months" | "freezer_quality_date"
  >,
  input: { frozenAt?: string | null; freezerDurationMonths?: number | null },
  targetLocation: Location,
): FreezeColumns {
  if (targetLocation !== "freezer") {
    return {
      frozen_at: null,
      freezer_duration_months: null,
      freezer_quality_date: null,
    };
  }
  const frozenAt = input.frozenAt !== undefined ? input.frozenAt : current.frozen_at;
  const months =
    input.freezerDurationMonths !== undefined
      ? input.freezerDurationMonths
      : current.freezer_duration_months;
  let quality: string | null;
  if (input.frozenAt !== undefined || input.freezerDurationMonths !== undefined) {
    quality =
      frozenAt && months != null ? computeFreezerQualityDate(frozenAt, months) : null;
  } else {
    quality = current.freezer_quality_date;
  }
  return {
    frozen_at: frozenAt,
    freezer_duration_months: months,
    freezer_quality_date: quality,
  };
}

export async function updateInventory(
  rawInput: UpdateInventoryInput,
): Promise<ActionResult<{ inventory: InventoryWithItem }>> {
  try {
    const parsed = patchSchema.safeParse(rawInput);
    if (!parsed.success) return { ok: false, error: "Invalid input" };
    const input = parsed.data;
    const { supabase, householdId } = await requireDal();

    const current = await loadInventory(supabase, householdId, input.inventoryId);
    if (!current) return { ok: false, error: "Item not found in inventory" };

    let quantity = input.quantity;
    let unit = input.unit;
    let lowThreshold = input.lowThreshold;
    if (unit !== undefined) {
      const imperial = toImperialStock(quantity ?? current.quantity, unit ?? null);
      quantity = imperial.quantity;
      unit = imperial.unit;
      const factor = imperialFactor(input.unit ?? null);
      if (factor != null && lowThreshold != null) {
        lowThreshold = Math.round(lowThreshold * factor * 10) / 10;
      }
    }

    // Moving locations may collide with an existing batch at the target
    // (same date + storage history) — only then do quantities merge.
    if (input.location && input.location !== current.location) {
      const freezeColumns = resultingFreezeColumns(current, input, input.location);
      const resultExpiration =
        input.expirationDate === undefined
          ? current.expiration_date
          : input.expirationDate;

      const { data: targetRows } = await supabase
        .from("inventory")
        .select("*")
        .eq("household_id", householdId)
        .eq("item_id", current.item_id)
        .eq("location", input.location);

      const findTarget = (rows: InventoryRow[]) =>
        rows.find(
          (row) =>
            row.expiration_date === resultExpiration &&
            row.frozen_at === freezeColumns.frozen_at &&
            row.freezer_duration_months === freezeColumns.freezer_duration_months,
        ) ?? null;

      const mergeIntoTarget = async (
        target: InventoryRow,
      ): Promise<ActionResult<{ inventory: InventoryWithItem }>> => {
        const nextQuantity = quantity ?? current.quantity + target.quantity;
        await supabase.from("inventory").delete().eq("id", current.id);
        await supabase
          .from("inventory")
          .update({
            quantity: nextQuantity,
            expiration_date: earliest(target.expiration_date, resultExpiration),
            unit: unit ?? target.unit,
            source: input.source ?? target.source,
            notes: input.notes ?? target.notes,
            is_low: input.isLow ?? target.is_low,
          })
          .eq("id", target.id);
        const merged = await loadInventory(supabase, householdId, target.id);
        if (merged) await maybeAutoRestock(supabase, householdId, merged);
        revalidatePath("/inventory");
        return merged
          ? { ok: true, data: { inventory: merged } }
          : { ok: false, error: "Could not move item" };
      };

      const target = findTarget((targetRows ?? []) as InventoryRow[]);
      if (target) return mergeIntoTarget(target);

      const { error: moveError } = await supabase
        .from("inventory")
        .update({
          location: input.location,
          quantity: quantity ?? current.quantity,
          unit: unit ?? undefined,
          expiration_date:
            input.expirationDate === undefined ? undefined : input.expirationDate,
          source: input.source ?? undefined,
          notes: input.notes ?? undefined,
          is_low: input.isLow ?? undefined,
          ...freezeColumns,
        })
        .eq("id", current.id);
      if (moveError) {
        if (moveError.code === "23505") {
          // An identical batch appeared meanwhile — merge into it.
          const { data: raceRows } = await supabase
            .from("inventory")
            .select("*")
            .eq("household_id", householdId)
            .eq("item_id", current.item_id)
            .eq("location", input.location);
          const raced = findTarget((raceRows ?? []) as InventoryRow[]);
          if (raced) return mergeIntoTarget(raced);
        }
        return { ok: false, error: moveError.message };
      }
    } else {
      const patch: Record<string, unknown> = {};
      if (quantity !== undefined) patch.quantity = quantity;
      if (unit !== undefined) patch.unit = unit;
      if (input.expirationDate !== undefined) patch.expiration_date = input.expirationDate;
      if (input.source !== undefined) patch.source = input.source;
      if (input.notes !== undefined) patch.notes = input.notes;
      if (input.isLow !== undefined) patch.is_low = input.isLow;

      const freezeTouched =
        input.frozenAt !== undefined || input.freezerDurationMonths !== undefined;
      const freezeColumns = freezeTouched
        ? resultingFreezeColumns(current, input, input.location ?? current.location)
        : null;
      if (freezeColumns) Object.assign(patch, freezeColumns);

      if (Object.keys(patch).length > 0) {
        const { error: updateError } = await supabase
          .from("inventory")
          .update(patch)
          .eq("id", current.id);
        if (updateError) {
          if (updateError.code === "23505") {
            // The edited date/storage history matches a sibling batch — merge.
            const cols: FreezeColumns = freezeColumns ?? {
              frozen_at: current.frozen_at,
              freezer_duration_months: current.freezer_duration_months,
              freezer_quality_date: current.freezer_quality_date,
            };
            const resultExpiration =
              input.expirationDate === undefined
                ? current.expiration_date
                : input.expirationDate;
            const { data: siblingRows } = await supabase
              .from("inventory")
              .select("*")
              .eq("household_id", householdId)
              .eq("item_id", current.item_id)
              .eq("location", current.location);
            const sibling = ((siblingRows ?? []) as InventoryRow[]).find(
              (row) =>
                row.id !== current.id &&
                row.expiration_date === resultExpiration &&
                row.frozen_at === cols.frozen_at &&
                row.freezer_duration_months === cols.freezer_duration_months,
            );
            if (sibling) {
              await supabase.from("inventory").delete().eq("id", current.id);
              const { error: mergeError } = await supabase
                .from("inventory")
                .update({
                  quantity: (quantity ?? current.quantity) + sibling.quantity,
                  unit: unit ?? sibling.unit,
                  source: input.source ?? sibling.source,
                  notes: input.notes ?? sibling.notes,
                  is_low: input.isLow ?? sibling.is_low,
                })
                .eq("id", sibling.id);
              if (mergeError) return { ok: false, error: mergeError.message };
              const merged = await loadInventory(supabase, householdId, sibling.id);
              if (merged) await maybeAutoRestock(supabase, householdId, merged);
              revalidatePath("/inventory");
              return merged
                ? { ok: true, data: { inventory: merged } }
                : { ok: false, error: "Could not save batch" };
            }
          }
          return { ok: false, error: updateError.message };
        }
      }
    }

    if (
      input.lowThreshold !== undefined ||
      input.autoRestock !== undefined ||
      input.itemName !== undefined ||
      input.subcategoryId !== undefined ||
      input.freezerFoodType !== undefined
    ) {
      const itemPatch: Record<string, unknown> = {};
      if (lowThreshold !== undefined) itemPatch.low_threshold = lowThreshold;
      if (input.autoRestock !== undefined) itemPatch.auto_restock = input.autoRestock;
      if (input.itemName !== undefined) itemPatch.name = input.itemName;
      if (input.subcategoryId !== undefined) itemPatch.subcategory_id = input.subcategoryId;
      if (input.freezerFoodType !== undefined) {
        if (
          input.freezerFoodType !== null &&
          !FREEZER_FOOD_TYPES[input.freezerFoodType]
        ) {
          return { ok: false, error: "Unknown freezer food type" };
        }
        itemPatch.freezer_food_type = input.freezerFoodType;
      }
      const { error: itemError } = await supabase
        .from("items")
        .update(itemPatch)
        .eq("id", current.item_id);
      if (itemError) {
        if (itemError.code === "23505") {
          return {
            ok: false,
            error: `An item named "${input.itemName}" already exists`,
          };
        }
        return { ok: false, error: itemError.message };
      }
      if (input.itemName !== undefined) {
        // Grocery rows keep their own copy of the name.
        await supabase
          .from("grocery_items")
          .update({ name: input.itemName })
          .eq("household_id", householdId)
          .eq("item_id", current.item_id);
        revalidatePath("/grocery");
      }
      if (
        input.itemName !== undefined ||
        input.subcategoryId !== undefined
      ) {
        revalidatePath("/");
      }
    }

    const updated = await loadInventory(supabase, householdId, input.inventoryId);
    if (!updated) {
      // Row moved/merged away — reload any row of the same batch key.
      const merged = await supabase
        .from("inventory")
        .select("*, item:items(*)")
        .eq("household_id", householdId)
        .eq("item_id", current.item_id)
        .eq("location", input.location ?? current.location)
        .limit(1)
        .maybeSingle();
      const row = merged.data as unknown as InventoryWithItem | null;
      if (row) {
        await maybeAutoRestock(supabase, householdId, row);
        revalidatePath("/inventory");
        return { ok: true, data: { inventory: row } };
      }
      return { ok: false, error: "Could not load updated item" };
    }

    await maybeAutoRestock(supabase, householdId, updated);
    revalidatePath("/inventory");
    return { ok: true, data: { inventory: updated } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Update failed",
    };
  }
}

export async function deleteInventory(
  inventoryId: string,
): Promise<ActionResult<{ itemId: string }>> {
  try {
    const { supabase, householdId } = await requireDal();
    const current = await loadInventory(supabase, householdId, inventoryId);
    if (!current) return { ok: false, error: "Item not found" };

    const { error } = await supabase
      .from("inventory")
      .delete()
      .eq("id", inventoryId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/inventory");
    return { ok: true, data: { itemId: current.item_id } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Delete failed",
    };
  }
}

export type CatalogSearchResult = {
  items: ItemRow[];
};

export async function searchCatalog(
  query: string,
  limit = 12,
): Promise<ActionResult<CatalogSearchResult>> {
  try {
    const { supabase, householdId } = await requireDal();
    const trimmed = query.trim();
    if (!trimmed) return { ok: true, data: { items: [] } };

    let builder = supabase
      .from("items")
      .select("*")
      .eq("household_id", householdId);

    if (/^\d{4,14}$/.test(trimmed)) {
      builder = builder.or(`barcode.eq.${trimmed},name.ilike.%${trimmed}%`);
    } else {
      builder = builder.ilike("name", `%${trimmed}%`);
    }

    const { data } = await builder
      .order("name", { ascending: true })
      .limit(limit);

    return { ok: true, data: { items: (data ?? []) as ItemRow[] } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Search failed",
    };
  }
}

export async function locationForNewItem(): Promise<Location> {
  const { supabase, householdId } = await requireDal();
  const { data } = await supabase
    .from("household_settings")
    .select("default_location")
    .eq("household_id", householdId)
    .maybeSingle();
  return (data as { default_location: Location } | null)?.default_location ?? "pantry";
}

/** Adds an inventory item to the grocery list without consuming it. */
export async function addInventoryToGrocery(
  inventoryId: string,
): Promise<ActionResult<{ created: boolean }>> {
  try {
    const { supabase, householdId } = await requireDal();
    const inventory = await loadInventory(supabase, householdId, inventoryId);
    if (!inventory?.item) return { ok: false, error: "Item not found" };

    const result = await ensureGroceryItem(supabase, householdId, {
      itemId: inventory.item.id,
      name: inventory.item.name,
      quantity: 1,
      unit: inventory.item.unit,
      categoryId: inventory.item.category_id,
      source: "consume",
    });

    revalidatePath("/grocery");
    return { ok: true, data: { created: result.created } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not add to list",
    };
  }
}
