import { expiryBucket } from "@/lib/expiry";
import { effectiveExpiryDate } from "@/lib/freezer";
import type { InventoryEntry, InventoryRow, ItemRow, Location } from "@/lib/types";

/**
 * One inventory row = one batch (quantity + expiration date + storage
 * history). The inventory list and details work on item-level groups; every
 * total/date shown here is computed from batches, never stored.
 */

export type ItemGroup = {
  item: ItemRow;
  /** All batches for the item (qty > 0), FEFO sorted. */
  batches: InventoryEntry[];
  /** Sum of all batches across locations. */
  totalQuantity: number;
  /** Sum per location. */
  locationTotals: Partial<Record<Location, number>>;
  /** Distinct locations holding a batch. */
  locations: Location[];
  low: boolean;
};

/** First-expire-first-out: effective date asc (frozen = quality date), undated last, oldest batch tiebreak. */
export function compareFefo(
  a: InventoryRow,
  b: InventoryRow,
): number {
  const aDate = effectiveExpiryDate(a);
  const bDate = effectiveExpiryDate(b);
  if (aDate && bDate) {
    const byDate = aDate.localeCompare(bDate);
    if (byDate !== 0) return byDate;
  } else if (aDate) {
    return -1;
  } else if (bDate) {
    return 1;
  }
  return a.created_at.localeCompare(b.created_at);
}

export function fefoSort<T extends InventoryRow>(rows: T[]): T[] {
  return [...rows].sort(compareFefo);
}

/** Batches shown for a location tab ("all" = every batch). */
export function scopedBatches<T extends InventoryRow>(
  rows: T[],
  location: Location | "all",
): T[] {
  return location === "all" ? rows : rows.filter((row) => row.location === location);
}

/** Earliest effective date among batches (frozen rows use quality dates). */
export function earliestEffective(rows: InventoryRow[]): string | null {
  let earliest: string | null = null;
  for (const row of rows) {
    const date = effectiveExpiryDate(row);
    if (date && (!earliest || date < earliest)) earliest = date;
  }
  return earliest;
}

/** How many distinct effective dates the batches carry (undated excluded). */
export function distinctEffectiveDates(rows: InventoryRow[]): number {
  const dates = new Set<string>();
  for (const row of rows) {
    const date = effectiveExpiryDate(row);
    if (date) dates.add(date);
  }
  return dates.size;
}

export function multiDate(rows: InventoryRow[]): boolean {
  return distinctEffectiveDates(rows) > 1;
}

/** Item-level low: total at/below threshold, or any batch flagged low. */
export function isItemLow(
  totalQuantity: number,
  batches: Pick<InventoryRow, "is_low">[],
  item: Pick<ItemRow, "low_threshold"> | null | undefined,
): boolean {
  if (batches.some((batch) => batch.is_low)) return true;
  if (item?.low_threshold != null) return totalQuantity <= item.low_threshold;
  return false;
}

/** Groups items from raw inventory rows; totals computed from the batches. */
export function groupByItem(rows: InventoryEntry[]): ItemGroup[] {
  const byItem = new Map<string, InventoryEntry[]>();
  for (const row of rows) {
    const list = byItem.get(row.item_id);
    if (list) list.push(row);
    else byItem.set(row.item_id, [row]);
  }

  const groups: ItemGroup[] = [];
  for (const batches of byItem.values()) {
    const item = batches[0].item;
    const sorted = fefoSort(batches);
    const totalQuantity = sorted.reduce((sum, row) => sum + row.quantity, 0);
    const locationTotals: Partial<Record<Location, number>> = {};
    for (const row of sorted) {
      locationTotals[row.location] = (locationTotals[row.location] ?? 0) + row.quantity;
    }
    groups.push({
      item,
      batches: sorted,
      totalQuantity,
      locationTotals,
      locations: [...new Set(sorted.map((row) => row.location))],
      low: isItemLow(totalQuantity, sorted, item),
    });
  }
  return groups;
}

/** True when any batch's effective date falls in an urgent bucket. */
export function anyBatchUrgent(rows: InventoryRow[]): boolean {
  return rows.some((row) => {
    const bucket = expiryBucket(effectiveExpiryDate(row));
    return bucket === "expired" || bucket === "urgent" || bucket === "soon";
  });
}

/** The batch a card/detail stepper should act on first (FEFO, within scope). */
export function pickFefoBatch<T extends InventoryRow>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return fefoSort(rows)[0];
}

/** Client-side copy of a batch row, used to undo consumes/removes. */
export type BatchSnapshot = {
  id: string;
  item_id: string;
  location: Location;
  quantity: number;
  unit: string | null;
  expiration_date: string | null;
  frozen_at: string | null;
  freezer_duration_months: number | null;
  freezer_quality_date: string | null;
  is_low: boolean;
  source: string | null;
  notes: string | null;
};

export function toBatchSnapshot(row: InventoryRow): BatchSnapshot {
  return {
    id: row.id,
    item_id: row.item_id,
    location: row.location,
    quantity: row.quantity,
    unit: row.unit,
    expiration_date: row.expiration_date,
    frozen_at: row.frozen_at,
    freezer_duration_months: row.freezer_duration_months,
    freezer_quality_date: row.freezer_quality_date,
    is_low: row.is_low,
    source: row.source,
    notes: row.notes,
  };
}
