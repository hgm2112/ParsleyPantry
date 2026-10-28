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

/** Pieces one purchased pack adds (1 = the item is not a pack item). */
export function packMultiplier(
  item: Pick<ItemRow, "pack_size"> | null | undefined,
): number {
  return item?.pack_size != null && item.pack_size > 1 ? item.pack_size : 1;
}

/** The name one piece inside a pack is stored under ("eggs", "packets"). */
export function packUnitLabel(
  item: Pick<ItemRow, "pack_unit"> | null | undefined,
): string {
  return item?.pack_unit?.trim() || "pieces";
}

/** True when the item is a pack item and the piece count is a whole pack. */
export function packCount(
  quantity: number,
  item: Pick<ItemRow, "pack_size"> | null | undefined,
): number | null {
  const size = item?.pack_size;
  if (size == null || size <= 1 || quantity <= 0) return null;
  const packs = quantity / size;
  return Number.isInteger(packs) ? packs : null;
}

/** "(1 box)" → keep to the generic pack wording in UI. */
export function packHintText(
  quantity: number,
  item: Pick<ItemRow, "pack_size"> | null | undefined,
): string | null {
  const packs = packCount(quantity, item);
  return packs ? `${packs} pack${packs === 1 ? "" : "s"}` : null;
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

/**
 * One row's unit is a *container*, and it often carries that container's size
 * ("6 oz" can, "1.44 lbs" pack, "4 ea" sleeve) because the scan prefill copies
 * the product size into Unit. This is the size of one container.
 */
export function unitPackSize(unit: string | null): number {
  if (!unit) return 1;
  const match = unit.trim().match(/^(\d+(?:\.\d+)?)\s*(.+)$/);
  if (!match) return 1;
  const size = Number(match[1]);
  return Number.isFinite(size) && size > 0 ? size : 1;
}

/** Weight factor of a unit that names a weight ("8oz", "1.44 lbs", "oz"). */
function weightFactorOf(unit: string | null): number | null {
  if (!unit) return null;
  const tokens = unit
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .split(/[\s/]+/);
  for (const token of tokens) {
    const factor = WEIGHT_TO_OZ[token];
    if (factor != null) return factor;
  }
  return null;
}

/**
 * Ounces of stock in `quantity` containers of `unit`. A sized unit multiplies:
 * 3 × "6 oz" is 18 oz, not 3 oz.
 */
export function toOunces(quantity: number, unit: string | null): number | null {
  const factor = weightFactorOf(unit);
  if (factor == null) return null;
  return quantity * unitPackSize(unit) * factor;
}

/** Inverse of toOunces: how many containers of `targetUnit` hold `ounces`. */
export function fromOunces(ounces: number, targetUnit: string | null): number | null {
  const factor = weightFactorOf(targetUnit);
  if (factor == null) return null;
  return ounces / (factor * unitPackSize(targetUnit));
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
