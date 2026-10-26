"use client";

import { useState, useMemo, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { compareByExpiry, daysUntil } from "@/lib/expiry";
import { foodEmoji } from "@/lib/tiles";
import { mondayOf } from "@/lib/plan";
import { isPlanned } from "@/lib/meal-kind";
import { useToday } from "@/lib/use-now";
import { addGroceryItem } from "@/app/(app)/grocery/actions";
import { DayDialog, type RecipeOption } from "@/components/plan/day-dialog";
import { useLocalStorage } from "@/lib/use-local-storage";
import type { HomeMeal } from "@/lib/types";
import type { ShoppingPreviewItem } from "@/components/home/shopping-widget";
import type { InventoryEntry } from "@/lib/types";
import { groupByItem, type ItemGroup } from "@/lib/batches";
import { fromOunces, toOunces } from "@/lib/stock";

const EXPIRING_DAYS = 5;

/** Normalize unit text for compatibility checks (never merges synonyms). */
function normalizeUnit(unit: string | null): string | null {
  if (unit == null) return null;
  const normalized = unit.trim().toLowerCase().replace(/\.$/, "").trim();
  return normalized || null;
}

type CanonicalStock = {
  quantity: number;
  mode: "raw" | "oz";
};

/** Pool basis for one product group; null = not safely poolable. */
type StockBasis = {
  key: string;
  mode: "raw" | "oz";
  unit: string | null;
};

/**
 * The unit basis of one product group, when it can be safely compared with
 * sibling products. Batch units must be uniform and must match the item's
 * configured unit; otherwise the group falls back to per-product low-stock
 * behavior (isItemLow semantics).
 */
function groupStockUnit(group: ItemGroup): {
  unit: string | null;
  mode: "raw" | "oz";
  compatible: boolean;
} {
  const batchUnits = new Set(group.batches.map((row) => normalizeUnit(row.unit)));
  if (batchUnits.size > 1) return { unit: null, mode: "raw", compatible: false };
  const batchUnit = [...batchUnits][0] ?? null;
  const itemUnit = normalizeUnit(group.item.unit);
  if (batchUnit !== itemUnit) return { unit: null, mode: "raw", compatible: false };
  if (batchUnit != null && toOunces(1, batchUnit) != null) {
    return { unit: batchUnit, mode: "oz", compatible: true };
  }
  return { unit: batchUnit, mode: "raw", compatible: true };
}

/**
 * Pool key = canonical root + unit basis. Same-basis siblings pool; a
 * different basis forms its own pool instead of disabling the root, so
 * incompatible units are never summed together.
 */
function stockBasisOf(
  group: ItemGroup,
  rootOf: (id: string) => string,
): StockBasis | null {
  const { unit, mode, compatible } = groupStockUnit(group);
  if (!compatible) return null;
  const basis = mode === "oz" ? "oz" : `raw:${unit ?? ""}`;
  return { key: `${rootOf(group.item.id)}|${basis}`, mode, unit };
}

/**
 * Pool quantities per canonical root + unit basis for low-stock evaluation
 * only. Stock stays in product groups; only identical normalized units (or
 * weights convertible via toOunces) share a pool.
 */
function buildCanonicalStock(
  groups: ItemGroup[],
  rootOf: (id: string) => string,
): Map<string, CanonicalStock> {
  const pools = new Map<string, CanonicalStock>();
  for (const group of groups) {
    const basis = stockBasisOf(group, rootOf);
    if (!basis) continue;
    const quantity =
      basis.mode === "oz" ? toOunces(group.totalQuantity, basis.unit) : group.totalQuantity;
    if (quantity == null) continue;
    const pool = pools.get(basis.key);
    if (pool) pool.quantity += quantity;
    else pools.set(basis.key, { quantity, mode: basis.mode });
  }
  return pools;
}

/** "Milk (2d ago) · Spinach (today)" — days < 0 read as ago, 0 as today. */
function formatExpiryList(rows: InventoryEntry[]): string {
  return rows
    .map((row) => {
      const days = daysUntil(row.expiration_date);
      if (days === null) return row.item.name;
      const when = days < 0 ? `${-days}d ago` : days === 0 ? "today" : `${days}d`;
      return `${row.item.name} (${when})`;
    })
    .join(" · ");
}

/** "Chicken (3d) · Soup (passed)" — best-quality countdown, never "expired". */
function formatFreezerList(rows: InventoryEntry[]): string {
  return rows
    .map((row) => {
      const days = daysUntil(row.freezer_quality_date);
      if (days === null) return row.item.name;
      const when = days < 0 ? "passed" : days === 0 ? "best today" : `${days}d`;
      return `${row.item.name} (${when})`;
    })
    .join(" · ");
}

type Card = {
  key: string;
  emoji: string;
  line: ReactNode;
  action: ReactNode;
  tint: string;
};

type Props = {
  pantry: InventoryEntry[];
  grocery: ShoppingPreviewItem[];
  meals: HomeMeal[];
  recipes: RecipeOption[];
};

export function SmartActions({ pantry, grocery, meals, recipes }: Props) {
  const today = useToday();
  const [busy, setBusy] = useState(false);
  const [addedLocal, setAddedLocal] = useState<string[]>([]);
  const [dinnerOpen, setDinnerOpen] = useState(false);
  const [showAllExpired, setShowAllExpired] = useState(false);
  const [showAllSoon, setShowAllSoon] = useState(false);
  const [showAllFreezer, setShowAllFreezer] = useState(false);

  const [ignoredRaw, setIgnoredRaw] = useLocalStorage("smart-low-ignored");
  const ignored = useMemo(() => {
    if (!ignoredRaw) return [] as string[];
    try {
      const parsed = JSON.parse(ignoredRaw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [] as string[];
    }
  }, [ignoredRaw]);
  const setIgnored = (ids: string[]) => setIgnoredRaw(JSON.stringify(ids));

  const groups = useMemo(() => groupByItem(pantry), [pantry]);

  // One representative batch per item: earliest refrigerated date for
  // 🥀/🥑 cards (freezer rows never count as expired), earliest quality date
  // for ❄️. Batches are already FEFO-sorted inside each group.
  const expiredReps: InventoryEntry[] = [];
  const soonReps: InventoryEntry[] = [];
  const freezerReps: InventoryEntry[] = [];
  for (const group of groups) {
    const refBatch = group.batches.find((row) => row.location !== "freezer");
    if (refBatch) {
      const days = daysUntil(refBatch.expiration_date);
      if (days !== null && days < 0) expiredReps.push(refBatch);
      else if (days !== null && days >= 0 && days <= EXPIRING_DAYS) {
        soonReps.push(refBatch);
      }
    }
    const qualityBatch = group.batches.find(
      (row) => row.location === "freezer" && row.freezer_quality_date,
    );
    if (qualityBatch) {
      const days = daysUntil(qualityBatch.freezer_quality_date);
      if (days !== null && days <= 7) freezerReps.push(qualityBatch);
    }
  }

  const unchecked = grocery.filter((item) => !item.checked).length;

  const lowGroup = useMemo(() => {
    // Grocery lines pool by canonical identity — compare roots on both sides
    // so "already listed" sees a product through its generic ingredient.
    const roots = new Map<string, string>();
    for (const group of groups) {
      roots.set(
        group.item.id,
        group.item.canonical_item_id ?? group.item.id,
      );
    }
    const rootOf = (id: string) => {
      let current = id;
      for (let hop = 0; hop < 8; hop += 1) {
        const next = roots.get(current);
        if (!next || next === current) break;
        current = next;
      }
      return current;
    };
    const canonicalStock = buildCanonicalStock(groups, rootOf);
    const isLowForSmartAction = (group: ItemGroup) => {
      if (!group.low) return false;
      // Explicit manual low-stock flags are never overridden by aggregation.
      if (group.batches.some((row) => row.is_low)) return true;
      if (group.item.low_threshold == null) return true;
      const basis = stockBasisOf(group, rootOf);
      if (!basis) return true;
      const pool = canonicalStock.get(basis.key);
      if (!pool) return true;
      let available = pool.quantity;
      if (pool.mode === "oz") {
        const converted = fromOunces(pool.quantity, basis.unit);
        if (converted == null) return true;
        available = converted;
      }
      return available <= group.item.low_threshold;
    };
    const listedIds = new Set(
      [
        ...grocery.filter((g) => !g.checked).map((g) => g.item_id).filter(Boolean) as string[],
        ...addedLocal,
      ].map(rootOf),
    );
    return groups
      .filter(
        (group) =>
          !listedIds.has(rootOf(group.item.id)) && !ignored.includes(group.item.id),
      )
      .filter((group) => isLowForSmartAction(group))
      .sort((a, b) => a.totalQuantity - b.totalQuantity)[0] ?? null;
  }, [groups, grocery, addedLocal, ignored]);

  // Auto-clean persisted ignores for items that are no longer low
  useEffect(() => {
    const currentLowIds = new Set(
      groups.filter((group) => group.low).map((group) => group.item.id),
    );
    const cleaned = ignored.filter((id) => currentLowIds.has(id));
    if (cleaned.length !== ignored.length) {
      setIgnored(cleaned);
    }
  }, [groups, ignored]);

  const weekStart = mondayOf(new Date(`${today}T00:00:00Z`));
  const todayIndex = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) /
      86_400_000,
  );
  const todayEntry =
    meals.find(
      (meal) => meal.week_start === weekStart && meal.day_index === todayIndex,
    ) ?? null;
  const dinnerPlanned = isPlanned(todayEntry);

  const cards: Card[] = [];

  const expiredSorted = [...expiredReps].sort((a, b) =>
    compareByExpiry(
      a.expiration_date,
      a.item.name,
      b.expiration_date,
      b.item.name,
    ),
  );
  const soonSorted = [...soonReps].sort((a, b) =>
    compareByExpiry(
      a.expiration_date,
      a.item.name,
      b.expiration_date,
      b.item.name,
    ),
  );

  function listAction(
    sorted: InventoryEntry[],
    expanded: boolean,
    toggle: () => void,
    label: (rows: InventoryEntry[]) => string = formatExpiryList,
  ): ReactNode {
    const shown = expanded ? sorted : sorted.slice(0, 2);
    const hidden = sorted.length - shown.length;
    return (
      <span>
        {label(shown)}
        {sorted.length > 2 ? (
          <>
            {" · "}
            <button type="button" onClick={toggle}>
              {expanded ? "Show less" : `+${hidden} more →`}
            </button>
          </>
        ) : null}
      </span>
    );
  }

  if (expiredSorted.length > 0) {
    const count = expiredSorted.length;
    cards.push({
      key: "expired",
      emoji: "🥀",
      line: `${count} food${count === 1 ? "" : "s"} ${count === 1 ? "has" : "have"} expired`,
      action: listAction(expiredSorted, showAllExpired, () =>
        setShowAllExpired((value) => !value),
      ),
      tint: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
    });
  }

  if (soonSorted.length > 0) {
    const count = soonSorted.length;
    cards.push({
      key: "expiring",
      emoji: "🥑",
      line: `${count} food${count === 1 ? "" : "s"} expire${count === 1 ? "s" : ""} soon`,
      action: listAction(soonSorted, showAllSoon, () =>
        setShowAllSoon((value) => !value),
      ),
      tint: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
    });
  }

  const freezerSorted = [...freezerReps].sort((a, b) =>
    compareByExpiry(
      a.freezer_quality_date,
      a.item.name,
      b.freezer_quality_date,
      b.item.name,
    ),
  );

  if (freezerSorted.length > 0) {
    const count = freezerSorted.length;
    cards.push({
      key: "freezer",
      emoji: "❄️",
      line: `${count} frozen item${count === 1 ? "" : "s"} near freezer quality date`,
      action: listAction(
        freezerSorted,
        showAllFreezer,
        () => setShowAllFreezer((value) => !value),
        formatFreezerList,
      ),
      tint: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
    });
  }

  if (unchecked > 0) {
    cards.push({
      key: "shopping",
      emoji: "🛒",
      line: `${unchecked} item${unchecked === 1 ? "" : "s"} on your shopping list`,
      action: <Link href="/grocery">Continue shopping →</Link>,
      tint: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
    });
  }

  if (lowGroup) {
    const out = lowGroup.totalQuantity <= 0;
    async function addToList() {
      if (!lowGroup) return;
      setBusy(true);
      const result = await addGroceryItem({
        name: lowGroup.item.name,
        itemId: lowGroup.item.id,
        categoryId: lowGroup.item.category_id,
        quantity: 1,
        unit: lowGroup.batches[0]?.unit ?? lowGroup.item.unit,
        source: "low_stock",
      });
      setBusy(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setAddedLocal((prev) => [...new Set([...prev, lowGroup.item.id])]);
      if (result.data.created) {
        toast.success(`${result.data.name} added to your shopping list`);
      } else {
        toast.message(`${result.data.name} is already on your list`);
      }
    }
    const handleIgnore = () => {
      if (!lowGroup) return;
      setIgnored([...new Set([...ignored, lowGroup.item.id])]);
    };
    cards.push({
      key: "low",
      emoji: foodEmoji(lowGroup.item.name),
      line: out
        ? `${lowGroup.item.name} is out of stock`
        : `${lowGroup.item.name} is running low`,
      action: (
        <span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void addToList()}
            className="disabled:opacity-60"
          >
            {busy ? "Adding…" : "Add now"}
          </button>
          {" · "}
          <button
            type="button"
            onClick={handleIgnore}
            className="text-xs opacity-70 hover:opacity-100"
          >
            Don't add
          </button>
        </span>
      ),
      tint: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200",
    });
  }

  if (!dinnerPlanned) {
    cards.push({
      key: "dinner",
      emoji: "🍽️",
      line: "Dinner isn't planned",
      action: (
        <button type="button" onClick={() => setDinnerOpen(true)}>
          Pick a meal →
        </button>
      ),
      tint: "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200",
    });
  }

  if (cards.length === 0) {
    cards.push({
      key: "all-good",
      emoji: "🎉",
      line: "All caught up — nothing needs your attention",
      action: (
        <span className="flex flex-wrap gap-x-3">
          <Link href="/inventory/add">Add to Pantry →</Link>
          <Link href="/recipes">Find Recipes →</Link>
        </span>
      ),
      tint: "border-primary/30 bg-primary/5 text-foreground",
    });
  }

  return (
    <section className="flex h-full flex-col rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-extrabold">Smart Actions</h2>
      <div className="flex flex-1 flex-col gap-2.5">
        {cards.map((card) => (
          <div
            key={card.key}
            className={cn(
              "flex flex-1 items-center gap-3 rounded-xl border p-3",
              card.tint,
            )}
          >
            <span className="text-2xl" aria-hidden>
              {card.emoji}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug">{card.line}</p>
              <p className="mt-0.5 text-xs font-semibold">
                <span className="[&_a]:text-primary [&_a:hover]:underline [&_button]:text-primary [&_button:hover]:underline [&_button]:cursor-pointer">
                  {card.action}
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>

      {dinnerOpen ? (
        <DayDialog
          weekStart={weekStart}
          day={{ index: todayIndex, entry: todayEntry }}
          recipes={recipes}
          onDone={() => setDinnerOpen(false)}
        />
      ) : null}
    </section>
  );
}
