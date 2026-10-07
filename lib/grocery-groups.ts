/**
 * Shared shopping-list grouping so the homepage widget and the /grocery page
 * render the exact same groups in the exact same order.
 *
 * Logic mirrors the original grocery-view implementation: aisle mode files
 * items under the selected store's aisles (explicit assignment → remembered
 * assignment → category link → category-name match); category mode follows
 * category sort_order with unlisted categories and Other last.
 */

import { categoryMatchKey } from "@/lib/kitchenowl";
import type { CategoryRow, StoreAisleRow } from "@/lib/types";

export const UNASSIGNED_GROUP_KEY = "__unassigned";
export const OTHER_GROUP_KEY = "__other";

export type AisleSourceItem = {
  id: string;
  item_id: string | null;
  category_id: string | null;
  item?: { category_id: string | null } | null;
};

export type GroceryGrouping<T> = {
  key: string;
  title: string;
  items: T[];
};

export type ItemAisleAssignment = {
  grocery_item_id: string;
  store_id: string;
  aisle_id: string;
};

export type RememberedAisle = {
  item_id: string;
  store_id: string;
  aisle_id: string;
};

/** Aisle name key → aisle id, first aisle per key wins. */
export function aisleNameKeyMap(
  storeAisles: StoreAisleRow[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const aisle of storeAisles) {
    const key = categoryMatchKey(aisle.name);
    if (key && !map.has(key)) map.set(key, aisle.id);
  }
  return map;
}

/** Category id → aisle id for aisles linked to a category, first wins. */
export function aisleCategoryMap(
  storeAisles: StoreAisleRow[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const aisle of storeAisles) {
    if (aisle.category_id && !map.has(aisle.category_id)) {
      map.set(aisle.category_id, aisle.id);
    }
  }
  return map;
}

/**
 * Grocery item id → aisle id for one store.
 * Precedence: explicit per-item assignment, remembered per-catalog-item
 * assignment, category-linked aisle, category-name match.
 */
export function resolveEffectiveAisle<T extends AisleSourceItem>(
  items: T[],
  storeId: string | null,
  storeAisles: StoreAisleRow[],
  assignments: ItemAisleAssignment[],
  rememberedAisles: RememberedAisle[],
  categories: CategoryRow[],
): Map<string, string> {
  const aisleByItem = new Map<string, string>();
  for (const row of assignments) {
    if (row.store_id === storeId) aisleByItem.set(row.grocery_item_id, row.aisle_id);
  }

  const rememberedByItem = new Map<string, string>();
  if (storeId) {
    for (const row of rememberedAisles) {
      if (row.store_id === storeId) rememberedByItem.set(row.item_id, row.aisle_id);
    }
  }

  const aisleByKey = aisleNameKeyMap(storeAisles);
  const aisleByCategoryId = aisleCategoryMap(storeAisles);

  const categoryNames = new Map<string, string>();
  for (const category of categories) categoryNames.set(category.id, category.name);

  const map = new Map<string, string>();
  for (const item of items) {
    const explicit = aisleByItem.get(item.id);
    if (explicit) {
      map.set(item.id, explicit);
      continue;
    }
    if (item.item_id) {
      const remembered = rememberedByItem.get(item.item_id);
      if (remembered) {
        map.set(item.id, remembered);
        continue;
      }
    }
    const categoryId = item.category_id ?? item.item?.category_id ?? null;
    if (categoryId) {
      const linked = aisleByCategoryId.get(categoryId);
      if (linked) {
        map.set(item.id, linked);
        continue;
      }
    }
    const categoryName = categoryId
      ? categoryNames.get(categoryId) ?? null
      : null;
    if (categoryName) {
      const matched = aisleByKey.get(categoryMatchKey(categoryName));
      if (matched) map.set(item.id, matched);
    }
  }
  return map;
}

/** Store aisles in sort_order, each holding its items; unfiled items last. */
export function buildAisleGroups<T extends { id: string }>(
  items: T[],
  storeAisles: StoreAisleRow[],
  effectiveAisle: Map<string, string>,
): GroceryGrouping<T>[] {
  const result: GroceryGrouping<T>[] = storeAisles.map((aisle) => ({
    key: aisle.id,
    title: aisle.name,
    items: items.filter((item) => effectiveAisle.get(item.id) === aisle.id),
  }));

  const unassigned = items.filter((item) => !effectiveAisle.has(item.id));
  if (unassigned.length > 0) {
    result.push({
      key: UNASSIGNED_GROUP_KEY,
      title: "Needs an aisle",
      items: unassigned,
    });
  }

  return result.filter((group) => group.items.length > 0);
}

/** Categories in sort_order → unlisted categories → Other (null) last. */
export function buildCategoryGroups<T extends AisleSourceItem>(
  items: T[],
  categories: CategoryRow[],
): GroceryGrouping<T>[] {
  const byCategory = new Map<string | null, T[]>();
  for (const item of items) {
    const categoryId = item.category_id ?? item.item?.category_id ?? null;
    const list = byCategory.get(categoryId) ?? [];
    list.push(item);
    byCategory.set(categoryId, list);
  }

  const ordered: GroceryGrouping<T>[] = categories.map((category) => ({
    key: category.id,
    title: category.name,
    items: byCategory.get(category.id) ?? [],
  }));
  const leftovers = byCategory.get(null) ?? [];
  const claimed = new Set(categories.map((category) => category.id));
  for (const [categoryId, list] of byCategory) {
    if (categoryId && !claimed.has(categoryId)) {
      ordered.push({
        key: categoryId,
        title:
          categories.find((category) => category.id === categoryId)?.name ??
          "Other",
        items: list,
      });
    }
  }
  if (leftovers.length > 0) {
    ordered.push({ key: OTHER_GROUP_KEY, title: "Other", items: leftovers });
  }

  return ordered.filter((group) => group.items.length > 0);
}
