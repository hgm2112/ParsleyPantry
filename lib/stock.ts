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

function trimDecimal(value: number): string {
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

/**
 * Pill texts for an inventory quantity: quantity text and unit text.
 * Metric weights convert to imperial (g -> OZ, kg -> LB); pack-size units
 * ("500 g") convert inside the unit text.
 */
export function displayQtyUnit(
  quantity: number,
  unit: string | null,
): { qtyText: string; unitText: string | null } {
  if (!unit) return { qtyText: trimDecimal(quantity), unitText: null };
  const normalized = unit.trim().toLowerCase();

  const bare = WEIGHT_TO_IMPERIAL[normalized];
  if (bare) {
    return {
      qtyText: trimDecimal(Math.round(quantity * bare.factor * 10) / 10),
      unitText: bare.unit.toUpperCase(),
    };
  }

  const pack = normalized.match(/^(\d+(?:\.\d+)?)\s*(g|grams?|kg)$/);
  if (pack && pack[1]) {
    const factor =
      pack[2] === "kg" ? WEIGHT_TO_IMPERIAL.kg! : WEIGHT_TO_IMPERIAL.g!;
    const amount = Math.round(Number(pack[1]) * factor.factor * 10) / 10;
    return {
      qtyText: trimDecimal(quantity),
      unitText: `${trimDecimal(amount)} ${factor.unit.toUpperCase()}`,
    };
  }

  return { qtyText: trimDecimal(quantity), unitText: unit.trim().toUpperCase() };
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
