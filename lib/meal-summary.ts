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

export type RecipeIngredientLine = SummaryLine & {
  status: "available" | "partial" | "missing";
  /** Pantry amount in the need's own basis (ounces for weights, containers otherwise). */
  haveQuantity: number;
  /** "oz" for weight needs, null when the need is counted in containers. */
  haveUnit: string | null;
  /** Whether the ingredient resolved to a canonical pantry pool. */
  matched: boolean;
  /** Canonical pool key (root item id, or "name:<lower>" when unmatched). */
  poolKey: string;
  /** An unchecked grocery line already covers this line. */
  onList: boolean;
};

export type RecipeCoverage = {
  total: number;
  inPantry: number;
  /** Lines the pantry doesn't fully cover — what still has to be bought. */
  shoppable: number;
  /** Of those, how many already have an unchecked grocery line. */
  onList: number;
  /** One line per canonical pantry pool, same dedupe as the counts. */
  lines: RecipeIngredientLine[];
};

export function emptyWeekSummary(): WeekSummary {
  return { total: 0, inPantry: 0, needed: 0, lines: [], onShoppingList: 0 };
}

/**
 * Pantry stock per canonical root in two bases:
 * - `ounces`: total weight, with each row's container size expanded
 *   (3 × "6 oz" = 18 oz).
 * - `packages`: how many containers/units are on hand. This is what recipe
 *   amounts without a weight ("2 cans", or a bare "1") are compared against,
 *   and what cooking deducts one-for-one.
 */
export type PantryPool = { ounces: number; packages: number };

/** An ingredient's demand. Weight needs carry `ounces`; everything else counts packages. */
export type PantryNeed = { ounces: number | null; packages: number };

/** Needs summed per pool — a recipe can list the same root twice, in either basis. */
export type PantryDemand = { ounces: number; packages: number };

export type PantryPools = {
  rootOf: (id: string) => string;
  nameToRoot: Map<string, string>;
  pools: Map<string, PantryPool>;
};

const EPSILON = 1e-6;

export function emptyPool(): PantryPool {
  return { ounces: 0, packages: 0 };
}

/** Adds one stock row's quantity to a pool, expanding its container size. */
export function addStockToPool(
  pool: PantryPool,
  quantity: number,
  unit: string | null,
): PantryPool {
  if (quantity <= 0) return pool;
  const ounces = toOunces(quantity, unit);
  if (ounces != null) pool.ounces += ounces;
  pool.packages += quantity;
  return pool;
}

/**
 * Stock pooled by canonical identity: every product under one generic root
 * shares a pool. Container sizes stay part of the number — a "6 oz" row holds
 * 6 oz per unit, so quantities are never compared as raw container counts.
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

  const pools = new Map<string, PantryPool>();
  for (const row of inventory) {
    if (row.quantity <= 0) continue;
    const root = rootOf(row.item_id);
    const pool = pools.get(root) ?? emptyPool();
    addStockToPool(pool, row.quantity, row.unit);
    pools.set(root, pool);
  }

  return { rootOf, nameToRoot, pools };
}

/** Need for a quantity + unit pair ("6 oz" → 6 oz, "" → one package). */
export function needFromParts(
  quantity: number,
  unit: string | null,
): PantryNeed {
  const ounces = toOunces(quantity, unit);
  if (ounces != null) return { ounces, packages: 0 };
  return { ounces: null, packages: quantity };
}

export function pantryNeed(quantityText: string): PantryNeed {
  const parsed = parseQuantityText(quantityText);
  return needFromParts(parsed.quantity, parsed.unit);
}

export function emptyDemand(): PantryDemand {
  return { ounces: 0, packages: 0 };
}

/** Accumulates a need; weight and container demands stay in their own column. */
export function addNeed(demand: PantryDemand, need: PantryNeed): PantryDemand {
  if (need.ounces != null) demand.ounces += need.ounces;
  else demand.packages += need.packages;
  return demand;
}

/** Which pool column this demand is measured in. */
export function demandBasis(demand: PantryDemand): "oz" | "count" {
  return demand.ounces > 0 ? "oz" : "count";
}

/** The pool's value in the demand's basis (ounces, or container count). */
export function poolValue(
  pool: PantryPool | undefined,
  demand: PantryDemand,
): number {
  if (!pool) return 0;
  return demandBasis(demand) === "oz" ? pool.ounces : pool.packages;
}

/**
 * Whether the pool satisfies the demand.
 *
 * Weight demands fall back to "any stock present" when there is zero weight
 * stock but package stock exists.
 *
 * Count demands (e.g. "2 carrots") now also fall back to covered when there is
 * any weight stock (ounces > 0), even if the recorded package count is low or
 * zero. This treats the presence of stock in either basis as sufficient for
 * count-style recipe needs (aligning with the simple presence check on /recipes).
 */
export function poolCovers(
  pool: PantryPool | undefined,
  demand: PantryDemand | undefined,
): boolean {
  if (!demand) return false;
  const ounces = pool?.ounces ?? 0;
  const packages = pool?.packages ?? 0;
  const ouncesOk =
    demand.ounces <= 0 ||
    ounces >= demand.ounces - EPSILON ||
    (ounces <= 0 && packages > 0);
  const packagesOk =
    demand.packages <= 0 ||
    packages >= demand.packages - EPSILON ||
    ounces > 0;
  return ouncesOk && packagesOk;
}

export function resolveLine(
  ingredient: SummaryIngredient,
  pools: PantryPools,
): { poolKey: string; need: PantryNeed; resolved: boolean } {
  const resolvedRoot = ingredient.itemId
    ? pools.rootOf(ingredient.itemId)
    : (pools.nameToRoot.get(
        splitNameAndQuantity(ingredient.name).name.trim().toLowerCase(),
      ) ?? null);
  const need = pantryNeed(ingredient.quantityText);
  if (!resolvedRoot) {
    return {
      poolKey: `name:${ingredient.name.trim().toLowerCase()}`,
      need,
      resolved: false,
    };
  }
  return { poolKey: resolvedRoot, need, resolved: true };
}

export function buildWeekSummary(
  ingredients: SummaryIngredient[],
  inventory: SummaryInventoryRow[],
  items: SummaryItemRow[],
  groceryItems: SummaryGroceryRow[] = [],
): WeekSummary {
  const pools = buildPantryPools(inventory, items);

  const demandByPool = new Map<string, PantryDemand>();
  const firstIngredientByKey = new Map<string, SummaryIngredient>();

  for (const ingredient of ingredients) {
    const { poolKey, need } = resolveLine(ingredient, pools);
    const demand = demandByPool.get(poolKey) ?? emptyDemand();
    addNeed(demand, need);
    demandByPool.set(poolKey, demand);
    if (!firstIngredientByKey.has(poolKey)) {
      firstIngredientByKey.set(poolKey, ingredient);
    }
  }

  const coveredKeys = new Set<string>();
  const lines: SummaryLine[] = [];
  for (const poolKey of firstIngredientByKey.keys()) {
    const ingredient = firstIngredientByKey.get(poolKey)!;
    const resolved = !poolKey.startsWith("name:");
    const covered =
      resolved && poolCovers(pools.pools.get(poolKey), demandByPool.get(poolKey));
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

/**
 * Pool keys (canonical root id, or "name:<lower>" for unmatched lines) for
 * every grocery line already on the list — the same keys `resolveLine` emits,
 * so pantry pools and shopping lines compare like for like.
 */
export function groceryPoolKeys(
  groceryItems: SummaryGroceryRow[],
  items: SummaryItemRow[],
): Set<string> {
  const rootLookup = createRootLookup(items);
  const keys = new Set<string>();
  for (const grocery of groceryItems) {
    keys.add(
      grocery.item_id
        ? rootLookup(grocery.item_id)
        : `name:${grocery.name.trim().toLowerCase()}`,
    );
  }
  return keys;
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

  const groceryKeys = groceryPoolKeys(groceryItems, items);

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
  groceryItems: SummaryGroceryRow[] = [],
): Map<string, RecipeCoverage> {
  const pools = buildPantryPools(inventory, items);
  const groceryKeys = groceryPoolKeys(groceryItems, items);

  const demandByKey = new Map<string, PantryDemand>();
  const firstByKey = new Map<string, RecipeSummaryIngredient>();
  for (const ingredient of ingredients) {
    const { poolKey, need } = resolveLine(ingredient, pools);
    const key = `${ingredient.recipeId}|${poolKey}`;
    const demand = demandByKey.get(key) ?? emptyDemand();
    addNeed(demand, need);
    demandByKey.set(key, demand);
    if (!firstByKey.has(key)) firstByKey.set(key, ingredient);
  }

  const out = new Map<string, RecipeCoverage>();
  for (const [key, demand] of demandByKey) {
    const sep = key.indexOf("|");
    const recipeId = key.slice(0, sep);
    const poolKey = key.slice(sep + 1);
    const matched = !poolKey.startsWith("name:");
    const pool = pools.pools.get(poolKey);
    const covered = matched && poolCovers(pool, demand);
    const available = poolValue(pool, demand);
    const status: RecipeIngredientLine["status"] = covered
      ? "available"
      : matched && available > 0
        ? "partial"
        : "missing";
    // Only lines the pantry can't cover need a shopping line; an uncovered
    // line counts as "on list" when the list already has its pool key.
    const onList = !covered && groceryKeys.has(poolKey);

    const first = firstByKey.get(key)!;
    const stats = out.get(recipeId) ?? {
      total: 0,
      inPantry: 0,
      shoppable: 0,
      onList: 0,
      lines: [],
    };
    stats.total += 1;
    if (covered) stats.inPantry += 1;
    else {
      stats.shoppable += 1;
      if (onList) stats.onList += 1;
    }
    stats.lines.push({
      name: first.name,
      quantityText: first.quantityText,
      covered,
      status,
      haveQuantity: available,
      haveUnit: demandBasis(demand) === "oz" ? "oz" : null,
      matched,
      poolKey,
      onList,
    });
    out.set(recipeId, stats);
  }
  return out;
}
