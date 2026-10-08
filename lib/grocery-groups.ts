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
import type {
  CategoryRow,
  GroceryViewMode,
  StoreAisleRow,
  StoreRow,
} from "@/lib/types";

export const UNASSIGNED_GROUP_KEY = "__unassigned";
export const OTHER_GROUP_KEY = "__other";

export type AisleSourceItem = {
  id: string;
  item_id: string | null;
  category_id: string | null;
  item?: { category_id: string | null } | null;
  checked?: boolean;
};

/** Unchecked keep their incoming order; checked sink to the group bottom. */
function sinkChecked<T extends { checked?: boolean }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => Number(a.checked ?? false) - Number(b.checked ?? false),
  );
}

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
export function buildAisleGroups<T extends { id: string; checked?: boolean }>(
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

  return result
    .filter((group) => group.items.length > 0)
    .map((group) => ({ ...group, items: sinkChecked(group.items) }));
}

/**
 * Multi-store support. A line can be bought at several stores, so the list is
 * read as one section per store in view (plus a shared "Any store" section for
 * lines not filed anywhere) rather than one flat group list.
 */

export const ANY_STORE_KEY = "__any_store";

export type ItemStoreMembership = {
  grocery_item_id: string;
  store_id: string;
};

export type ItemStoreMap = Map<string, Set<string>>;

/** Rows → grocery item id → set of store ids it is bought at. */
export function buildItemStores(rows: ItemStoreMembership[]): ItemStoreMap {
  const map: ItemStoreMap = new Map();
  for (const row of rows) {
    const set = map.get(row.grocery_item_id) ?? new Set<string>();
    set.add(row.store_id);
    map.set(row.grocery_item_id, set);
  }
  return map;
}

/**
 * Lines bought at one of `inView`, plus lines filed nowhere — unfiled work is
 * never hidden. An empty view reads as "every store".
 */
export function visibleForStores<T extends { id: string }>(
  items: T[],
  itemStores: ItemStoreMap,
  inView: Iterable<string>,
): T[] {
  const view = new Set(inView);
  if (view.size === 0) return items;
  return items.filter((item) => {
    const stores = itemStores.get(item.id);
    if (!stores || stores.size === 0) return true;
    for (const storeId of stores) {
      if (view.has(storeId)) return true;
    }
    return false;
  });
}

export type StoreSection<T> = {
  /** Store id, or `ANY_STORE_KEY`. Also the React key prefix. */
  key: string;
  title: string;
  groups: GroceryGrouping<T>[];
};

const prefixKeys = <T>(
  groups: GroceryGrouping<T>[],
  prefix: string,
): GroceryGrouping<T>[] => groups.map((group) => ({ ...group, key: `${prefix}:${group.key}` }));

type SectionInput<T extends AisleSourceItem> = {
  items: T[];
  mode: GroceryViewMode;
  /** Stores to render, in list order. */
  stores: StoreRow[];
  aisles: StoreAisleRow[];
  itemStores: ItemStoreMap;
  assignments: ItemAisleAssignment[];
  rememberedAisles: RememberedAisle[];
  categories: CategoryRow[];
};

/**
 * One section per store (only the stores that have something to show), then
 * "Any store" for lines with no store. Keys are prefixed with the section key
 * so aisle/category ids never collide across stores.
 */
export function buildStoreSections<T extends AisleSourceItem>(
  input: SectionInput<T>,
): StoreSection<T>[] {
  const {
    items,
    mode,
    stores,
    aisles,
    itemStores,
    assignments,
    rememberedAisles,
    categories,
  } = input;

  const sectionFor = (
    key: string,
    title: string,
    storeItems: T[],
    store: StoreRow | null,
  ): StoreSection<T> | null => {
    let groups: GroceryGrouping<T>[];
    if (mode === "aisle") {
      const storeAisles = store
        ? aisles
            .filter((aisle) => aisle.store_id === store.id)
            .sort((a, b) => a.sort_order - b.sort_order)
        : [];
      if (store) {
        const effective = resolveEffectiveAisle(
          storeItems,
          store.id,
          storeAisles,
          assignments,
          rememberedAisles,
          categories,
        );
        groups = buildAisleGroups(storeItems, storeAisles, effective);
      } else {
        // Nothing to file against — one flat "Any store" group.
        groups = [
          {
            key: ANY_STORE_KEY,
            title: "Any store",
            items: [...storeItems].sort(
              (a, b) =>
                Number(a.checked ?? false) - Number(b.checked ?? false),
            ),
          },
        ];
      }
    } else {
      groups = buildCategoryGroups(storeItems, categories);
    }
    groups = prefixKeys(groups, key);
    if (groups.length === 0) return null;
    return { key, title, groups };
  };

  const sections: StoreSection<T>[] = [];
  for (const store of stores) {
    const storeItems = items.filter((item) =>
      itemStores.get(item.id)?.has(store.id),
    );
    const section = sectionFor(store.id, store.name, storeItems, store);
    if (section) sections.push(section);
  }

  const unfiled = items.filter((item) => {
    const set = itemStores.get(item.id);
    return !set || set.size === 0;
  });
  if (unfiled.length > 0) {
    const section = sectionFor(ANY_STORE_KEY, "Any store", unfiled, null);
    if (section) sections.push(section);
  }

  return sections;
}

/** Categories that would seed at `store` but have no aisle yet (per store). */
export function missingAislesForStore(
  storeId: string,
  aisles: StoreAisleRow[],
  categories: CategoryRow[],
): number {
  const storeAisles = aisles.filter((aisle) => aisle.store_id === storeId);
  const linked = new Set(
    storeAisles
      .map((aisle) => aisle.category_id)
      .filter((id): id is string => id !== null),
  );
  const byKey = aisleNameKeyMap(storeAisles);
  return categories.filter(
    (category) =>
      category.seed_stores &&
      !linked.has(category.id) &&
      !byKey.has(categoryMatchKey(category.name)),
  ).length;
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

  return ordered
    .filter((group) => group.items.length > 0)
    .map((group) => ({ ...group, items: sinkChecked(group.items) }));
}
