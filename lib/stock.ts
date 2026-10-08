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

const WEIGHT_TO_IMPERIAL: Record<string, { unit: string; factor: number }> = {
  g: { unit: "oz", factor: 1 / 28.3495 },
  gram: { unit: "oz", factor: 1 / 28.3495 },
  grams: { unit: "oz", factor: 1 / 28.3495 },
  kg: { unit: "lb", factor: 2.20462 },
};

/** Renders metric weight in imperial (g -> oz, kg -> lb) for display. */
export function displayQuantity(
  quantity: number,
  unit: string | null,
): { quantity: number; unit: string | null } {
  if (!unit) return { quantity, unit };
  const target = WEIGHT_TO_IMPERIAL[unit.trim().toLowerCase()];
  if (!target) return { quantity, unit };
  const converted = Math.round(quantity * target.factor * 10) / 10;
  return { quantity: converted, unit: target.unit };
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
