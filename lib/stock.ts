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
  gr: { unit: "oz", factor: 1 / 28.3495 },
  gram: { unit: "oz", factor: 1 / 28.3495 },
  grams: { unit: "oz", factor: 1 / 28.3495 },
  kg: { unit: "lb", factor: 2.20462 },
};

export function trimDecimal(value: number): string {
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

const WEIGHT_TO_OZ: Record<string, number> = {
  oz: 1,
  ounce: 1,
  ounces: 1,
  lb: 16,
  lbs: 16,
  pound: 16,
  pounds: 16,
};

export function toOunces(quantity: number, unit: string | null): number | null {
  if (!unit) return null;
  let u = unit.trim().toLowerCase().replace(/\.$/, "").trim();
  u = u.replace(/^[\d\.\s]+/, "").trim();
  const tokens = u.split(/[\s\/]+/);
  u = tokens[tokens.length - 1] || u;
  const f = WEIGHT_TO_OZ[u];
  return f != null ? quantity * f : null;
}

export function fromOunces(ounces: number, targetUnit: string | null): number | null {
  if (!targetUnit) return null;
  let u = targetUnit.trim().toLowerCase().replace(/\.$/, "").trim();
  u = u.replace(/^[\d\.\s]+/, "").trim();
  const tokens = u.split(/[\s\/]+/);
  u = tokens[tokens.length - 1] || u;
  const f = WEIGHT_TO_OZ[u];
  return f != null ? ounces / f : null;
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

  const pack = normalized.match(/^(\d+(?:\.\d+)?)\s*(g|gr|grams?|kg)\.?$/);
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

/**
 * Write-time counterpart of displayQtyUnit: metric weights are stored in
 * imperial. Bare g/gr/gram(s)/kg convert the quantity; pack-size text
 * ("206 g") converts the unit text; anything else passes through trimmed.
 */
export function toImperialStock(
  quantity: number,
  unit: string | null,
): { quantity: number; unit: string | null } {
  if (!unit) return { quantity, unit };
  const normalized = unit.trim().toLowerCase();

  const bare = WEIGHT_TO_IMPERIAL[normalized];
  if (bare) {
    return {
      quantity: Math.round(quantity * bare.factor * 10) / 10,
      unit: bare.unit,
    };
  }

  const pack = normalized.match(/^(\d+(?:\.\d+)?)\s*(g|gr|grams?|kg)\.?$/);
  if (pack && pack[1]) {
    const factor =
      pack[2] === "kg" ? WEIGHT_TO_IMPERIAL.kg! : WEIGHT_TO_IMPERIAL.g!;
    const amount = Math.round(Number(pack[1]) * factor.factor * 10) / 10;
    return { quantity, unit: `${trimDecimal(amount)} ${factor.unit}` };
  }

  return { quantity, unit: unit.trim() };
}

/** Multiplication factor to imperial for bare metric units (g/kg), else null. */
export function imperialFactor(unit: string | null): number | null {
  if (!unit) return null;
  const bare = WEIGHT_TO_IMPERIAL[unit.trim().toLowerCase()];
  return bare ? bare.factor : null;
}

/** Normalizes a "num unit" text to imperial ("206 g" -> "7.3 oz"). */
export function toImperialText(text: string): string {
  const trimmed = text.trim();
  const parsed = parseQuantityText(trimmed);
  const bare = WEIGHT_TO_IMPERIAL[(parsed.unit ?? "").toLowerCase()];
  if (!/^\d/.test(trimmed) || !parsed.unit || !bare) return trimmed;
  const converted = Math.round(parsed.quantity * bare.factor * 10) / 10;
  return `${trimDecimal(converted)} ${bare.unit}`;
}

/** "6 oz" -> { quantity: 6, unit: "oz" } */
export function parseQuantityText(text: string): {
  quantity: number;
  unit: string | null;
} {
  const trimmed = text.trim();
  if (!trimmed) return { quantity: 1, unit: null };

  const match = trimmed.match(/^([\d\s\/\-\.]+)\s*(.*)$/);
  if (!match) return { quantity: 1, unit: trimmed || null };

  const numStr = match[1].trim();
  const unit = match[2]?.trim() || null;

  let quantity = 1;

  // mixed number: "1 1/2", "1-1/2", "1 1/2"
  const mixed = numStr.match(/^(\d+)[ \s\-]+(\d+)\/(\d+)$/);
  if (mixed) {
    quantity = parseInt(mixed[1], 10) + parseInt(mixed[2], 10) / parseInt(mixed[3], 10);
  } else {
    // simple fraction "3/4"
    const frac = numStr.match(/^(\d+)\/(\d+)$/);
    if (frac) {
      quantity = parseInt(frac[1], 10) / parseInt(frac[2], 10);
    } else {
      // decimal / int
      quantity = parseFloat(numStr) || 1;
    }
  }

  return { quantity: quantity || 1, unit };
}

export function splitNameAndQuantity(full: string): { name: string; quantity: string } {
  const trimmed = full.trim();
  const match = trimmed.match(/^(.*?)\s+([\d\/][\d\/\.\s]*(?:[a-zA-Z]+)?)$/i);
  if (match) {
    const potentialQty = match[2];
    const p = parseQuantityText(potentialQty);
    if (p.quantity > 0 && p.unit) {
      return { name: match[1].trim(), quantity: potentialQty };
    }
  }
  return { name: trimmed, quantity: "" };
}
