import { createRootLookup } from "@/lib/canonical";
import {
  parseQuantityText,
  splitNameAndQuantity,
  stockPoolKey,
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
};

/**
 * Stock pooled by canonical identity: every product under one generic root
 * shares a pool, quantities normalized to ounces when units convert.
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
  for (const row of inventory) {
    const oz = toOunces(row.quantity, row.unit);
    const q = oz != null ? oz : row.quantity;
    const u = oz != null ? "oz" : row.unit;
    const key = stockPoolKey(rootOf(row.item_id), u);
    stock.set(key, (stock.get(key) ?? 0) + q);
  }

  return { rootOf, nameToRoot, stock };
}

export function resolveLine(
  ingredient: SummaryIngredient,
  pools: PantryPools,
): { poolKey: string; quantity: number; resolved: boolean } {
  const parsed = parseQuantityText(ingredient.quantityText);
  const root = ingredient.itemId
    ? pools.rootOf(ingredient.itemId)
    : (pools.nameToRoot.get(
        splitNameAndQuantity(ingredient.name).name.trim().toLowerCase(),
      ) ?? null);
  const oz = toOunces(parsed.quantity, parsed.unit);
  const q = oz != null ? oz : parsed.quantity;
  const u = oz != null ? "oz" : parsed.unit;
  if (!root) {
    return {
      poolKey: `name:${ingredient.name.trim().toLowerCase()}`,
      quantity: q,
      resolved: false,
    };
  }
  return { poolKey: stockPoolKey(root, u), quantity: q, resolved: true };
}

/**
 * Pantry coverage for one set of planned ingredient lines (already filtered
 * to on_shopping_list + un-made days). Mirrors the shop action's canonical/oz
 * pooling. Raw pantry sufficiency — other days' stock holds are ignored,
 * like Quick Bites.
 */
export function buildWeekSummary(
  ingredients: SummaryIngredient[],
  inventory: SummaryInventoryRow[],
  items: SummaryItemRow[],
  groceryItems: SummaryGroceryRow[] = [],
): WeekSummary {
  const pools = buildPantryPools(inventory, items);

  const pending: { line: SummaryLine; poolKey: string }[] = [];
  const needByPool = new Map<string, number>();
  for (const ingredient of ingredients) {
    const { poolKey, quantity } = resolveLine(ingredient, pools);
    needByPool.set(poolKey, (needByPool.get(poolKey) ?? 0) + quantity);
    pending.push({
      poolKey,
      line: {
        name: ingredient.name,
        quantityText: ingredient.quantityText,
        covered: false,
      },
    });
  }

  for (const entry of pending) {
    if (entry.poolKey.startsWith("name:")) continue;
    const have = pools.stock.get(entry.poolKey) ?? 0;
    const need = needByPool.get(entry.poolKey) ?? 0;
    entry.line.covered = have >= need - 1e-6;
  }

  const lines = pending.map((entry) => entry.line);
  const inPantry = lines.filter((line) => line.covered).length;
  return {
    total: lines.length,
    inPantry,
    needed: lines.length - inPantry,
    lines,
    onShoppingList: countIngredientsOnShoppingList(ingredients, groceryItems, items),
  };
}

  /**
   * Counts distinct ingredients in a week's planned lines that are currently
   * present as unchecked rows on the shopping list. Matching uses canonical
   * item roots (with exact-name fallback) so alternate product names do not
   * produce duplicates or false matches.
   */
  export function countIngredientsOnShoppingList(
    ingredients: SummaryIngredient[],
    groceryItems: SummaryGroceryRow[],
    items: SummaryItemRow[],
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

    let count = 0;
    for (const key of plannedKeys) {
      if (groceryKeys.has(key)) count += 1;
    }
    return count;
  }

  /**
   * Per-recipe line counts (Have X/Y for one recipe's ingredients), same
   * canonical/oz pools as the week summary — used by /plan day cards.
   */
  export function buildRecipeCoverage(
  ingredients: RecipeSummaryIngredient[],
  inventory: SummaryInventoryRow[],
  items: SummaryItemRow[],
): Map<string, RecipeCoverage> {
  const pools = buildPantryPools(inventory, items);

  const pending: { recipeId: string; key: string }[] = [];
  const needByKey = new Map<string, number>(); // `${recipeId}|${poolKey}`
  for (const ingredient of ingredients) {
    const { poolKey, quantity } = resolveLine(ingredient, pools);
    const key = `${ingredient.recipeId}|${poolKey}`;
    needByKey.set(key, (needByKey.get(key) ?? 0) + quantity);
    pending.push({ recipeId: ingredient.recipeId, key });
  }

  const coveredByKey = new Map<string, boolean>();
  for (const [key, need] of needByKey) {
    const poolKey = key.slice(key.indexOf("|") + 1);
    coveredByKey.set(
      key,
      !poolKey.startsWith("name:") &&
        (pools.stock.get(poolKey) ?? 0) >= need - 1e-6,
    );
  }

  const out = new Map<string, RecipeCoverage>();
  for (const entry of pending) {
    const stats = out.get(entry.recipeId) ?? { total: 0, inPantry: 0 };
    stats.total += 1;
    if (coveredByKey.get(entry.key)) stats.inPantry += 1;
    out.set(entry.recipeId, stats);
  }
  return out;
}
