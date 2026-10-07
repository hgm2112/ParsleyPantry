import { categoryMatchKey } from "@/lib/kitchenowl";

export type AislePlanEntry = { id: string; name: string };

type CategoryLike = { name: string; sort_order: number };
type AisleLike = { id: string; name: string; sort_order: number };

/**
 * Pure pairing/ordering shared by the server sync and the grocery UI's
 * drift detection. Pairs each aisle with a category (exact name first, then
 * match key) and returns the aisle list a store *should* have: paired rows
 * follow category order and take the category's label, unmatched (manual)
 * rows keep their relative order at the end. Same set of aisles, planned
 * order — safe to diff against the store's actual list.
 */
export function planStoreAisles(
  categories: CategoryLike[],
  aisles: AisleLike[],
): AislePlanEntry[] {
  const orderedCategories = [...categories].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const pool = [...aisles].sort((a, b) => a.sort_order - b.sort_order);

  const pairedByCategory = new Map<string, AisleLike>();
  const claimed = new Set<string>();
  // Exact-name matches first, so a rename can never collide with a row that
  // already holds the category's label.
  for (const category of orderedCategories) {
    const key = categoryMatchKey(category.name);
    if (!key || claimed.has(key)) continue;
    const match = pool.find(
      (aisle) => aisle.name.toLowerCase() === category.name.toLowerCase(),
    );
    if (match) {
      claimed.add(key);
      pairedByCategory.set(key, match);
    }
  }
  for (const category of orderedCategories) {
    const key = categoryMatchKey(category.name);
    if (!key || claimed.has(key)) continue;
    const index = pool.findIndex(
      (aisle) => categoryMatchKey(aisle.name) === key,
    );
    if (index >= 0) {
      claimed.add(key);
      pairedByCategory.set(key, pool[index]);
    }
  }

  const pairedIds = new Set(
    [...pairedByCategory.values()].map((aisle) => aisle.id),
  );

  const entries: AislePlanEntry[] = [];
  for (const category of orderedCategories) {
    const key = categoryMatchKey(category.name);
    const aisle = key ? pairedByCategory.get(key) : undefined;
    if (aisle) entries.push({ id: aisle.id, name: category.name });
  }
  for (const aisle of pool) {
    if (!pairedIds.has(aisle.id)) entries.push({ id: aisle.id, name: aisle.name });
  }
  return entries;
}
