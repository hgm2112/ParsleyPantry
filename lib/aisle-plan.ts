import { categoryMatchKey } from "@/lib/kitchenowl";

export type AislePlanEntry = {
  id: string;
  name: string;
  categoryId: string | null;
};

type CategoryLike = { id: string; name: string; sort_order: number };
type AisleLike = {
  id: string;
  name: string;
  sort_order: number;
  category_id?: string | null;
};

/**
 * Pure pairing/ordering shared by the server reset and the seed flow's
 * view of a store list. Pairs each aisle with a category — FK link first
 * (rename-proof), then exact name, then match key — and returns the aisle
 * list a store *should* have: paired rows follow category order and take
 * the category's label, unmatched (manual) rows keep their relative order
 * at the end.
 */
export function planStoreAisles(
  categories: CategoryLike[],
  aisles: AisleLike[],
): AislePlanEntry[] {
  const orderedCategories = [...categories].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const pool = [...aisles].sort((a, b) => a.sort_order - b.sort_order);

  const paired = new Map<string, AisleLike>();
  const claimed = new Set<string>();

  // Existing category links win: a store can rename both sides freely.
  for (const category of orderedCategories) {
    const match = pool.find(
      (aisle) => !claimed.has(aisle.id) && aisle.category_id === category.id,
    );
    if (match) {
      claimed.add(match.id);
      paired.set(category.id, match);
    }
  }
  // Exact-name matches next, so a rename can never collide with a row that
  // already holds the category's label.
  for (const category of orderedCategories) {
    if (paired.has(category.id)) continue;
    const match = pool.find(
      (aisle) =>
        !claimed.has(aisle.id) &&
        aisle.name.toLowerCase() === category.name.toLowerCase(),
    );
    if (match) {
      claimed.add(match.id);
      paired.set(category.id, match);
    }
  }
  // Match-key pairs for emoji/number-prefixed variants of the same label.
  for (const category of orderedCategories) {
    if (paired.has(category.id)) continue;
    const key = categoryMatchKey(category.name);
    if (!key) continue;
    const match = pool.find(
      (aisle) => !claimed.has(aisle.id) && categoryMatchKey(aisle.name) === key,
    );
    if (match) {
      claimed.add(match.id);
      paired.set(category.id, match);
    }
  }

  const entries: AislePlanEntry[] = [];
  for (const category of orderedCategories) {
    const aisle = paired.get(category.id);
    if (aisle) {
      entries.push({ id: aisle.id, name: category.name, categoryId: category.id });
    }
  }
  for (const aisle of pool) {
    if (!claimed.has(aisle.id)) {
      entries.push({ id: aisle.id, name: aisle.name, categoryId: null });
    }
  }
  return entries;
}
