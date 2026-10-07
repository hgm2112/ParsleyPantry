import type { InventoryRow, ItemRow } from "@/lib/types";

export function isLowStock(
  inventory: Pick<InventoryRow, "quantity" | "is_low">,
  item: Pick<ItemRow, "low_threshold"> | null | undefined,
): boolean {
  if (inventory.is_low) return true;
  if (item?.low_threshold != null) return inventory.quantity <= item.low_threshold;
  return false;
}

/** Expiration of merged stock should always show the earliest date. */
export function earliest(
  a: string | null | undefined,
  b: string | null | undefined,
): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a <= b ? a : b;
}

/** Stock pool key: reservations and stock buckets are per item+unit. */
export function stockPoolKey(itemId: string, unit: string | null): string {
  return `${itemId}__${(unit ?? "").toLowerCase()}`;
}

/** "6 oz" -> { quantity: 6, unit: "oz" } */
export function parseQuantityText(text: string): {
  quantity: number;
  unit: string | null;
} {
  const match = text.trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) return { quantity: 1, unit: text.trim() || null };
  const quantity = Number(match[1]);
  const unit = match[2]?.trim() || null;
  return { quantity: quantity || 1, unit };
}
