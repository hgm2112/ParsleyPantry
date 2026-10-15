import { createRootLookup } from "@/lib/canonical";
import {
  parseQuantityText,
  splitNameAndQuantity,
  toOunces,
} from "@/lib/stock";

export type SummaryIngredient = {
  name: string;
  quantityText: string;
  itemId: string | null;
};

export type RecipeSummaryIngredient = SummaryIngredient & {
  recipeId: string;
};

export type SummaryInventoryRow = {
  item_id: string;
  quantity: number;
  unit: string | null;
};

export type SummaryItemRow = {
  id: string;
  name: string;
  canonical_item_id: string | null;
};

export type SummaryLine = {
  name: string;
  quantityText: string;
  covered: boolean;
};

export type SummaryGroceryRow = {
  item_id: string | null;
  name: string;
};

export type WeekSummary = {
  total: number;
  inPantry: number;
  needed: number;
  lines: SummaryLine[];
  onShoppingList: number;
};

export type RecipeCoverage = {
  total: number;
  inPantry: number;
};

export function emptyWeekSummary(): WeekSummary {
  return { total: 0, inPantry: 0, needed: 0, lines: [], onShoppingList: 0 };
}

export type PantryPools = {
  rootOf: (id: string) => string;
  nameToRoot: Map<string, string>;
  stock: Map<string, number>;
  stockUnitByRoot?: Map<string, string | null>;
};

/**
 * Stock pooled by canonical identity: every product under one generic root
 * shares a pool. Mixed units collapse the common unit to null, exactly like
 * the recipe editor and the mark-as-made dialog, so aggregate pantry
 * quantities are compared with one consistent unit at a time.
 */
export function buildPantryPools(
  inventory: SummaryInventoryRow[],
  items: SummaryItemRow[],
): PantryPools {
  const rootOf = createRootLookup(items);
  const nameToRoot = new Map<string, string>();
  for (const row of items) {
    nameToRoot.set(row.name.trim().toLowerCase(), rootOf(row.id));
  }

  const stock = new Map<string, number>();
  const stockUnitByRoot = new Map<string, string | null>();
  const unitSeen = new Set<string>();
  for (const row of inventory) {
    if (row.quantity <= 0) continue;
    const root = rootOf(row.item_id);
    stock.set(root, (stock.get(root) ?? 0) + row.quantity);
    if (!unitSeen.has(root)) {
      unitSeen.add(root);
      stockUnitByRoot.set(root, row.unit);
    } else if (stockUnitByRoot.get(root) !== row.unit) {
      stockUnitByRoot.set(root, null);
    }
  }

  return { rootOf, nameToRoot, stock, stockUnitByRoot };
}

export function resolveLine(
  ingredient: SummaryIngredient,
  pools: PantryPools,
): { poolKey: string; quantity: number; resolved: boolean } {
  const resolvedRoot = ingredient.itemId
    ? pools.rootOf(ingredient.itemId)
    : (pools.nameToRoot.get(
        splitNameAndQuantity(ingredient.name).name.trim().toLowerCase(),
      ) ?? null);
  const parsed = parseQuantityText(ingredient.quantityText);
  const quantity = toOunces(parsed.quantity, parsed.unit) ?? parsed.quantity;
  if (!resolvedRoot) {
    return {
      poolKey: `name:${ingredient.name.trim().toLowerCase()}`,
      quantity,
      resolved: false,
    };
  }
  return { poolKey: resolvedRoot, quantity, resolved: true };
}

export function buildWeekSummary(
  ingredients: SummaryIngredient[],
  inventory: SummaryInventoryRow[],
  items: SummaryItemRow[],
  groceryItems: SummaryGroceryRow[] = [],
): WeekSummary {
  const pools = buildPantryPools(inventory, items);

  const needByRoot = new Map<string, number>();
  const firstIngredientByKey = new Map<string, SummaryIngredient>();

  for (const ingredient of ingredients) {
    const { poolKey, quantity } = resolveLine(ingredient, pools);
    needByRoot.set(poolKey, (needByRoot.get(poolKey) ?? 0) + quantity);
    if (!firstIngredientByKey.has(poolKey)) {
      firstIngredientByKey.set(poolKey, ingredient);
    }
  }

  const coveredKeys = new Set<string>();
  const lines: SummaryLine[] = [];
  for (const poolKey of firstIngredientByKey.keys()) {
    const ingredient = firstIngredientByKey.get(poolKey)!;
    const resolved = !poolKey.startsWith("name:");
    const rawHave = pools.stock.get(poolKey) ?? 0;
    const commonUnit = pools.stockUnitByRoot?.get(poolKey) ?? null;
    const have = toOunces(rawHave, commonUnit) ?? rawHave;
    const need = needByRoot.get(poolKey) ?? 0;
    const covered = resolved && have >= need - 1e-6;
    if (covered) coveredKeys.add(poolKey);
    lines.push({
      name: ingredient.name,
      quantityText: ingredient.quantityText,
      covered,
    });
  }

  return {
    total: lines.length,
    inPantry: coveredKeys.size,
    needed: lines.length - coveredKeys.size,
    lines,
    onShoppingList: countIngredientsOnShoppingList(
      ingredients,
      groceryItems,
      items,
      coveredKeys,
    ),
  };
}

export function countIngredientsOnShoppingList(
  ingredients: SummaryIngredient[],
  groceryItems: SummaryGroceryRow[],
  items: SummaryItemRow[],
  coveredKeys?: Set<string> | null,
): number {
  const rootLookup = createRootLookup(items);
  const nameToRoot = new Map<string, string>(
    items.map((row) => [row.name.trim().toLowerCase(), rootLookup(row.id)]),
  );

  const plannedKeys = new Set<string>();
  for (const ingredient of ingredients) {
    const displayName = splitNameAndQuantity(ingredient.name).name
      .trim()
      .toLowerCase();
    const key = ingredient.itemId
      ? rootLookup(ingredient.itemId)
      : (nameToRoot.get(displayName) ?? `name:${displayName}`);
    plannedKeys.add(key);
  }

  const groceryKeys = new Set<string>();
  for (const grocery of groceryItems) {
    if (grocery.item_id) {
      groceryKeys.add(rootLookup(grocery.item_id));
    } else {
      groceryKeys.add(`name:${grocery.name.trim().toLowerCase()}`);
    }
  }

  const safeCovered = coveredKeys ?? new Set<string>();
  let count = 0;
  for (const key of plannedKeys) {
    if (safeCovered.has(key)) continue;
    if (groceryKeys.has(key)) count += 1;
  }
  return count;
}

export function buildRecipeCoverage(
  ingredients: RecipeSummaryIngredient[],
  inventory: SummaryInventoryRow[],
  items: SummaryItemRow[],
): Map<string, RecipeCoverage> {
  const pools = buildPantryPools(inventory, items);

  const pending: { recipeId: string; poolKey: string; quantity: number }[] = [];
  const needByKey = new Map<string, number>();
  for (const ingredient of ingredients) {
    const { poolKey, quantity } = resolveLine(ingredient, pools);
    const key = `${ingredient.recipeId}|${poolKey}`;
    needByKey.set(key, (needByKey.get(key) ?? 0) + quantity);
    pending.push({ recipeId: ingredient.recipeId, poolKey, quantity });
  }

  const coveredByKey = new Map<string, boolean>();
  for (const [key, need] of needByKey) {
    const poolKey = key.slice(key.indexOf("|") + 1);
    const resolved = !poolKey.startsWith("name:");
    const rawHave = pools.stock.get(poolKey) ?? 0;
    const commonUnit = pools.stockUnitByRoot?.get(poolKey) ?? null;
    const have = toOunces(rawHave, commonUnit) ?? rawHave;
    coveredByKey.set(key, resolved && have >= need - 1e-6);
  }

  const out = new Map<string, RecipeCoverage>();
  const seenIngredientKeys = new Map<string, Set<string>>();
  for (const entry of pending) {
    const key = `${entry.recipeId}|${entry.poolKey}`;
    const stats = out.get(entry.recipeId) ?? { total: 0, inPantry: 0 };
    const seen = seenIngredientKeys.get(entry.recipeId) ?? new Set<string>();
    if (!seen.has(entry.poolKey)) {
      stats.total += 1;
      if (coveredByKey.get(key)) stats.inPantry += 1;
      seen.add(entry.poolKey);
    }
    seenIngredientKeys.set(entry.recipeId, seen);
    out.set(entry.recipeId, stats);
  }
  return out;
}
