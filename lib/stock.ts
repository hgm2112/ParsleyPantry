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
