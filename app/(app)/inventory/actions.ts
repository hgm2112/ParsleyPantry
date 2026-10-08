"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDal } from "@/lib/auth";
import { lookupOffProduct, type OffProduct } from "@/lib/off";
import { ensureGroceryItem } from "@/lib/grocery";
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
      input.categoryId != null
    ) {
      const patch: Record<string, unknown> = {};
      if (lowThreshold != null) patch.low_threshold = lowThreshold;
      if (input.expirationDays != null) patch.expiration_days = input.expirationDays;
      if (input.autoRestock != null) patch.auto_restock = input.autoRestock;
      if (input.categoryId != null) patch.category_id = input.categoryId;
      await supabase.from("items").update(patch).eq("id", item.id);
      item = { ...item, ...patch } as ItemRow;
    }

    const { data: existingRows } = await supabase
      .from("inventory")
      .select("*")
      .eq("household_id", householdId)
      .eq("item_id", item.id)
      .eq("location", input.location)
      .limit(1);

    const existing = ((existingRows ?? [])[0] as InventoryRow | undefined) ?? null;
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
        return {
          ok: false,
          error: insertRowError?.message ?? "Could not add to inventory",
        };
      }
      inventoryId = (insertedRow as { id: string }).id;
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

/** Decrements stock (0 = "used the last one") and offers a grocery re-add. */
export async function consumeInventory(
  rawInput: ConsumeInput,
): Promise<
  ActionResult<{ quantity: number; low: boolean; groceryAdded: boolean }>
> {
  try {
    const parsed = consumeSchema.safeParse(rawInput);
    if (!parsed.success) return { ok: false, error: "Invalid input" };
    const input = parsed.data;
    const { supabase, householdId, user } = await requireDal();

    const inventory = await loadInventory(supabase, householdId, input.inventoryId);
    if (!inventory) return { ok: false, error: "Item not found in inventory" };

    const quantity = Math.max(0, inventory.quantity - input.amount);

    const { error: updateError } = await supabase
      .from("inventory")
      .update({ quantity, added_by: user.id })
      .eq("id", input.inventoryId);
    if (updateError) return { ok: false, error: updateError.message };

    const updated: InventoryWithItem = { ...inventory, quantity };
    const low = isLowStock(updated, inventory.item);

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
    return { ok: true, data: { quantity, low, groceryAdded } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update quantity",
    };
  }
}

const patchSchema = z.object({
  inventoryId: z.string().uuid(),
  itemName: z.string().trim().min(1).max(160).optional(),
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
});

export type UpdateInventoryInput = z.input<typeof patchSchema>;

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

    // Moving locations may collide with an existing row for the target.
    if (input.location && input.location !== current.location) {
      const { data: targetRows } = await supabase
        .from("inventory")
        .select("*")
        .eq("household_id", householdId)
        .eq("item_id", current.item_id)
        .eq("location", input.location)
        .limit(1);

      const target = ((targetRows ?? [])[0] as InventoryRow | undefined) ?? null;
      const nextQuantity = quantity ?? current.quantity + (target?.quantity ?? 0);

      if (target) {
        await supabase.from("inventory").delete().eq("id", current.id);
        await supabase
          .from("inventory")
          .update({
            quantity: nextQuantity,
            expiration_date: earliest(target.expiration_date, current.expiration_date),
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
      }

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
        })
        .eq("id", current.id);
      if (moveError) return { ok: false, error: moveError.message };
    } else {
      const patch: Record<string, unknown> = {};
      if (quantity !== undefined) patch.quantity = quantity;
      if (unit !== undefined) patch.unit = unit;
      if (input.expirationDate !== undefined) patch.expiration_date = input.expirationDate;
      if (input.source !== undefined) patch.source = input.source;
      if (input.notes !== undefined) patch.notes = input.notes;
      if (input.isLow !== undefined) patch.is_low = input.isLow;

      if (Object.keys(patch).length > 0) {
        const { error: updateError } = await supabase
          .from("inventory")
          .update(patch)
          .eq("id", current.id);
        if (updateError) return { ok: false, error: updateError.message };
      }
    }

    if (
      input.lowThreshold !== undefined ||
      input.autoRestock !== undefined ||
      input.itemName !== undefined
    ) {
      const itemPatch: Record<string, unknown> = {};
      if (lowThreshold !== undefined) itemPatch.low_threshold = lowThreshold;
      if (input.autoRestock !== undefined) itemPatch.auto_restock = input.autoRestock;
      if (input.itemName !== undefined) itemPatch.name = input.itemName;
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
        revalidatePath("/");
        revalidatePath("/grocery");
      }
    }

    const updated = await loadInventory(supabase, householdId, input.inventoryId);
    if (!updated) {
      // Row moved to a different id (merged) — reload by item+location.
      const merged = await supabase
        .from("inventory")
        .select("*, item:items(*)")
        .eq("household_id", householdId)
        .eq("item_id", current.item_id)
        .eq("location", input.location ?? current.location)
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
