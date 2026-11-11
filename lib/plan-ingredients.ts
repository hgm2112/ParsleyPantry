import { createRootLookup } from "@/lib/canonical";
import {
  parseQuantityText,
  splitNameAndQuantity,
  toOunces,
  unitPackSize,
} from "@/lib/stock";

/**
 * Aggregation for the /plan "2-Week Ingredient Summary".
 *
 * Requirements are derived from the recipe lines of every planned day:
 * - `original` = every scheduled meal, including cooked ones.
 * - `remaining` = meals with `made_at` null only.
 * Pantry stock is always the caller's current inventory. Cooking already
 * deducts inventory (markMealMade), so stock is never reduced again here.
 *
 * Quantities are only summed inside a compatible unit bucket: oz-family
 * weights normalize to ounces, everything else keeps its own unit
 * (cup/cups merge, can/cans merge, ...). Different units are never assumed
 * interchangeable, and no volume/weight conversions are invented.
 */

export type PlanIngredientSource = {
  recipeId: string;
  recipeName: string;
  /** ISO date of the planned day (YYYY-MM-DD). */
  date: string;
  /** Pre-formatted label, e.g. "Mon Nov 10". */
  dateLabel: string;
  made: boolean;
  name: string;
  quantityText: string;
  itemId: string | null;
  optional: boolean;
};

export type PlanInventoryRow = {
  item_id: string;
  quantity: number;
  unit: string | null;
};

export type PlanItemRow = {
  id: string;
  name: string;
  canonical_item_id: string | null;
};

export type PlanAmountKind = "weight" | "count";

export type PlanAmount = {
  /** Bucket key: "weight" or the normalized count unit. */
  key: string;
  kind: PlanAmountKind;
  /** Ounces for weight, units for count. */
  value: number;
  /** Display text, e.g. "2.5 lb" or "3 cups". */
  text: string;
};

export type PlanIngredientUse = {
  recipeId: string;
  recipeName: string;
  date: string;
  dateLabel: string;
  made: boolean;
  /** Recipe amounts as written ("1 cup + 2 cups"); "—" when none were set. */
  quantityText: string;
};

export type PlanIngredientVerdict =
  /**
   * `presenceOnly` = the remaining recipe lines had no amounts, so any
   * positive pantry stock counts as enough.
   */
  | { kind: "enough"; presenceOnly?: boolean }
  | { kind: "short"; shortages: PlanAmount[]; hasStock: boolean }
  | { kind: "unknown"; reason: "unmatched" | "units" }
  | { kind: "unquantified" }
  | { kind: "cooked" };

export type PlanIngredientGroup = {
  key: string;
  name: string;
  matched: boolean;
  meals: number;
  cookedMeals: number;
  remainingMeals: number;
  original: PlanAmount[];
  remaining: PlanAmount[];
  stock: PlanAmount[];
  verdict: PlanIngredientVerdict;
  uses: PlanIngredientUse[];
};

const WEIGHT_KEY = "weight";
/** Unit was only a size ("10.75") with no unit word — can't be compared. */
const UNKNOWN_KEY = "unknown";
const EPSILON = 1e-6;

/** Canonical count units and their natural singular/plural labels. */
const COUNT_UNIT_LABELS: Record<string, [string, string]> = {
  each: ["each", "each"],
  cup: ["cup", "cups"],
  tsp: ["tsp", "tsp"],
  tbsp: ["tbsp", "tbsp"],
  can: ["can", "cans"],
  jar: ["jar", "jars"],
  bottle: ["bottle", "bottles"],
  box: ["box", "boxes"],
  package: ["package", "packages"],
  packet: ["packet", "packets"],
  bag: ["bag", "bags"],
  bunch: ["bunch", "bunches"],
  head: ["head", "heads"],
  clove: ["clove", "cloves"],
  slice: ["slice", "slices"],
  piece: ["piece", "pieces"],
  stick: ["stick", "sticks"],
  sprig: ["sprig", "sprigs"],
  pinch: ["pinch", "pinches"],
  dash: ["dash", "dashes"],
  dozen: ["dozen", "dozen"],
  container: ["container", "containers"],
  quart: ["quart", "quarts"],
  pint: ["pint", "pints"],
  gallon: ["gallon", "gallons"],
  liter: ["liter", "liters"],
  ml: ["ml", "ml"],
  l: ["l", "l"],
};

const UNIT_ALIASES: Record<string, string> = {
  "": "each",
  each: "each",
  ea: "each",
  count: "each",
  ct: "each",
  whole: "each",
  item: "each",
  unit: "each",
  cup: "cup",
  cups: "cup",
  tsp: "tsp",
  tsps: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tbsp: "tbsp",
  tbsps: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  can: "can",
  cans: "can",
  jar: "jar",
  jars: "jar",
  bottle: "bottle",
  bottles: "bottle",
  box: "box",
  boxes: "box",
  package: "package",
  packages: "package",
  pkg: "package",
  pkgs: "package",
  packet: "packet",
  packets: "packet",
  bag: "bag",
  bags: "bag",
  bunch: "bunch",
  bunches: "bunch",
  head: "head",
  heads: "head",
  clove: "clove",
  cloves: "clove",
  slice: "slice",
  slices: "slice",
  piece: "piece",
  pieces: "piece",
  stick: "stick",
  sticks: "stick",
  sprig: "sprig",
  sprigs: "sprig",
  pinch: "pinch",
  pinches: "pinch",
  dash: "dash",
  dashes: "dash",
  dozen: "dozen",
  container: "container",
  containers: "container",
  quart: "quart",
  quarts: "quart",
  pint: "pint",
  pints: "pint",
  gallon: "gallon",
  gallons: "gallon",
  liter: "liter",
  liters: "liter",
  litre: "liter",
  litres: "liter",
  ml: "ml",
  l: "l",
};

/**
 * Packaging/portion nouns stay in their own bucket. Anything else is a
 * piece noun ("eggs", "fillets", "cookies") and means the same thing as a
 * plain count of the item, so it shares the `each` bucket.
 */
const PACKAGING_UNIT_LABELS: Record<string, [string, string]> = {
  ...COUNT_UNIT_LABELS,
  carton: ["carton", "cartons"],
  tube: ["tube", "tubes"],
  pouch: ["pouch", "pouches"],
  tub: ["tub", "tubs"],
  loaf: ["loaf", "loaves"],
  roll: ["roll", "rolls"],
  sleeve: ["sleeve", "sleeves"],
  tray: ["tray", "trays"],
  canister: ["canister", "canisters"],
};

/** Lowercase, drop parens/punctuation noise, and normalize hyphens to spaces. */
function normalizeUnitText(unit: string | null): string {
  if (!unit) return "";
  return unit
    .toLowerCase()
    .replace(/[-–—]/g, " ")
    .replace(/[()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/g, "")
    .trim();
}

/** Plural piece nouns whose singular isn't "-y" ("cookies" → "cookie"). */
const IRREGULAR_SINGULARS = new Set(["cookies", "movies", "series"]);

/** Plural/singular unit merging only — never a cross-unit conversion. */
function singularKey(token: string): string {
  const alias = UNIT_ALIASES[token];
  if (alias) return alias;
  if (token.endsWith("ies") && token.length > 4) {
    if (IRREGULAR_SINGULARS.has(token)) return token.slice(0, -1);
    return `${token.slice(0, -3)}y`;
  }
  if (/(ches|shes|xes|sses|zes|oes)$/.test(token)) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 2) {
    return token.slice(0, -1);
  }
  return token;
}

/**
 * Singular form of a piece noun for display ("eggs" → "egg").
 * Deliberately simple: piece nouns are not converted, only pluralized.
 */
function singularNoun(noun: string): string {
  if (noun.endsWith("ies") && noun.length > 4) {
    if (IRREGULAR_SINGULARS.has(noun)) return noun.slice(0, -1);
    return `${noun.slice(0, -3)}y`;
  }
  if (/(ches|shes|xes|sses|zes|oes)$/.test(noun)) {
    return noun.slice(0, -2);
  }
  if (noun.endsWith("s") && !noun.endsWith("ss") && noun.length > 2) {
    return noun.slice(0, -1);
  }
  return noun;
}

/**
 * Unit bucket for one amount: weight ounces share one bucket, known packaging
 * units keep their own, and unknown piece nouns ("eggs") join the generic
 * `each` bucket while keeping their noun for display.
 */
function parseUnit(unit: string | null): {
  normalized: string;
  weight: boolean;
  key: string;
  /** Piece noun to display when the bucket is the generic count bucket. */
  label: string | null;
} {
  const normalized = normalizeUnitText(unit);
  if (toOunces(1, normalized) != null) {
    return { normalized, weight: true, key: WEIGHT_KEY, label: null };
  }
  if (!normalized) {
    return { normalized, weight: false, key: "each", label: null };
  }
  const sized = normalized.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  const token = (sized?.[2] ?? normalized).trim();
  if (!token) {
    // A bare size ("10.75") says how big the container is, not what it's
    // measured in. It can't be expanded into pieces or compared as weight.
    return { normalized, weight: false, key: UNKNOWN_KEY, label: normalized };
  }
  const alias = UNIT_ALIASES[token];
  if (alias) return { normalized, weight: false, key: alias, label: null };
  const singular = singularKey(token);
  if (PACKAGING_UNIT_LABELS[singular]) {
    return { normalized, weight: false, key: singular, label: null };
  }
  return { normalized, weight: false, key: "each", label: normalized };
}

/** Amount in the bucket's base: ounces for weight, unit counts otherwise. */
function unitValue(quantity: number, parsed: ReturnType<typeof parseUnit>): number {
  if (parsed.weight) return toOunces(quantity, parsed.normalized) ?? 0;
  if (parsed.key === UNKNOWN_KEY) return quantity;
  // "4 ea" describes one container of 4, so expand it to unit counts.
  return quantity * unitPackSize(parsed.normalized);
}

/** A line is quantified only when it starts with a number ("2", ".5", "1/2", "1 1/2"). */
function parseNeed(quantityText: string): { quantity: number; unit: string | null } | null {
  const text = quantityText.trim();
  if (!/^[.\d]/.test(text)) return null;
  const parsed = parseQuantityText(text);
  if (!Number.isFinite(parsed.quantity) || parsed.quantity <= 0) return null;
  return parsed;
}

function formatQty(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

function formatWeight(ounces: number): string {
  if (ounces >= 16) return `${formatQty(ounces / 16)} lb`;
  return `${formatQty(ounces)} oz`;
}

function countLabel(
  key: string,
  value: number,
  label?: string | null,
): string {
  if (label) {
    const noun = value === 1 ? singularNoun(label) : label;
    return `${formatQty(value)} ${noun}`;
  }
  const labels = COUNT_UNIT_LABELS[key];
  const one = labels?.[0] ?? key;
  const many = labels?.[1] ?? (key.endsWith("s") ? key : `${key}s`);
  return `${formatQty(value)} ${value === 1 ? one : many}`;
}

function makeAmount(
  key: string,
  value: number,
  label?: string | null,
): PlanAmount {
  if (key === WEIGHT_KEY) {
    return { key, kind: "weight", value, text: formatWeight(value) };
  }
  if (key === UNKNOWN_KEY) {
    return {
      key,
      kind: "count",
      value,
      text: `${formatQty(value)} × ${label ?? "?"} (unit unknown)`,
    };
  }
  return { key, kind: "count", value, text: countLabel(key, value, label) };
}

/** Stock that can actually be measured in one of the known bases. */
function hasComparableStock(stockAmounts: Map<string, number>): boolean {
  for (const key of stockAmounts.keys()) {
    if (key !== UNKNOWN_KEY) return true;
  }
  return false;
}

function amountsFrom(
  buckets: Map<string, number>,
  labels?: Map<string, string>,
): PlanAmount[] {
  return [...buckets.entries()]
    .filter(([, value]) => value > EPSILON)
    .sort(([a], [b]) => {
      if (a === b) return 0;
      if (a === WEIGHT_KEY) return 1;
      if (b === WEIGHT_KEY) return -1;
      return a.localeCompare(b);
    })
    .map(([key, value]) => makeAmount(key, value, labels?.get(key)));
}

type GroupUse = {
  recipeId: string;
  recipeName: string;
  date: string;
  dateLabel: string;
  made: boolean;
  texts: string[];
};

type GroupAccum = {
  key: string;
  name: string;
  matched: boolean;
  rootId: string | null;
  uses: Map<string, GroupUse>;
  original: Map<string, number>;
  remaining: Map<string, number>;
  /** Display noun per bucket ("eggs"), when the bucket is a piece noun. */
  labels: Map<string, string>;
};

type StockBuckets = {
  /** bucket key → total amount */
  amounts: Map<string, number>;
  /** display noun per bucket */
  labels: Map<string, string>;
};

function buildStockBuckets(
  inventory: PlanInventoryRow[],
  rootOf: (id: string) => string,
): Map<string, StockBuckets> {
  const byRoot = new Map<string, StockBuckets>();
  for (const row of inventory) {
    if (row.quantity <= 0) continue;
    const root = rootOf(row.item_id);
    const parsed = parseUnit(row.unit);
    const value = unitValue(row.quantity, parsed);
    if (value <= 0) continue;
    const bucket = byRoot.get(root) ?? {
      amounts: new Map<string, number>(),
      labels: new Map<string, string>(),
    };
    bucket.amounts.set(parsed.key, (bucket.amounts.get(parsed.key) ?? 0) + value);
    if (parsed.label) bucket.labels.set(parsed.key, parsed.label);
    byRoot.set(root, bucket);
  }
  return byRoot;
}

function addTo(
  map: Map<string, number>,
  labels: Map<string, string>,
  key: string,
  value: number,
  label?: string | null,
): void {
  map.set(key, (map.get(key) ?? 0) + value);
  if (label) labels.set(key, label);
}

function finalize(
  accum: GroupAccum,
  stockByRoot: Map<string, StockBuckets>,
): PlanIngredientGroup {
  const uses = [...accum.uses.values()]
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.recipeName.localeCompare(b.recipeName),
    )
    .map((use) => ({
      recipeId: use.recipeId,
      recipeName: use.recipeName,
      date: use.date,
      dateLabel: use.dateLabel,
      made: use.made,
      quantityText: use.texts.length > 0 ? use.texts.join(" + ") : "—",
    }));
  const remainingMeals = uses.filter((use) => !use.made).length;
  const cookedMeals = uses.length - remainingMeals;
  const stockBuckets = accum.rootId ? stockByRoot.get(accum.rootId) : undefined;
  const stockAmounts = stockBuckets?.amounts ?? new Map<string, number>();
  const stockLabels = stockBuckets?.labels ?? new Map<string, string>();
  const stock = amountsFrom(stockAmounts, stockLabels);

  let verdict: PlanIngredientVerdict;
  if (!accum.matched) {
    verdict = { kind: "unknown", reason: "unmatched" };
  } else if (uses.length > 0 && remainingMeals === 0) {
    verdict = { kind: "cooked" };
  } else if (accum.remaining.size === 0) {
    // No amounts were set on the lines still to cook. Having the ingredient
    // in the pantry is all the recipes ask for, so stock alone means enough —
    // but only stock in a unit we can read.
    if (hasComparableStock(stockAmounts)) {
      verdict = { kind: "enough", presenceOnly: true };
    } else if (stockAmounts.size > 0) {
      verdict = { kind: "unknown", reason: "units" };
    } else {
      verdict = { kind: "unquantified" };
    }
  } else {
    const shortages: PlanAmount[] = [];
    let hasStock = false;
    let anyShort = false;
    let anyIncompatible = false;
    for (const [bucketKey, need] of accum.remaining) {
      if (bucketKey === UNKNOWN_KEY) {
        anyIncompatible = true;
        continue;
      }
      const have = stockAmounts.get(bucketKey) ?? 0;
      if (have > 0) hasStock = true;
      if (have >= need - EPSILON) continue;
      if (have > 0) {
        anyShort = true;
        shortages.push(
          makeAmount(
            bucketKey,
            need - have,
            accum.labels.get(bucketKey) ?? stockLabels.get(bucketKey),
          ),
        );
      } else if (stockAmounts.size > 0) {
        // Stock exists for this ingredient, just in an incompatible unit.
        anyIncompatible = true;
      } else {
        shortages.push(
          makeAmount(
            bucketKey,
            need,
            accum.labels.get(bucketKey) ?? stockLabels.get(bucketKey),
          ),
        );
      }
    }
    if (anyShort || (shortages.length > 0 && !anyIncompatible)) {
      verdict = { kind: "short", shortages, hasStock };
    } else if (anyIncompatible) {
      verdict = { kind: "unknown", reason: "units" };
    } else {
      verdict = { kind: "enough" };
    }
  }

  return {
    key: accum.key,
    name: accum.name,
    matched: accum.matched,
    meals: uses.length,
    cookedMeals,
    remainingMeals,
    original: amountsFrom(accum.original, accum.labels),
    remaining: amountsFrom(accum.remaining, accum.labels),
    stock,
    verdict,
    uses,
  };
}

/**
 * Builds one row per canonical ingredient across the whole 14-day window.
 * Optional ingredients are excluded (cooking never consumes them). Lines
 * without a numeric amount still count as meals but are not summed or
 * flagged as a shortfall.
 */
export function buildPlanIngredientTotals(
  sources: PlanIngredientSource[],
  inventory: PlanInventoryRow[],
  items: PlanItemRow[],
): PlanIngredientGroup[] {
  const rootOf = createRootLookup(items);
  const nameById = new Map(items.map((item) => [item.id, item.name]));
  const nameToRoot = new Map(
    items.map((item) => [item.name.trim().toLowerCase(), rootOf(item.id)]),
  );
  const stockByRoot = buildStockBuckets(inventory, rootOf);

  const groups = new Map<string, GroupAccum>();

  for (const source of sources) {
    if (source.optional) continue;
    const cleaned = splitNameAndQuantity(source.name).name.trim() || source.name.trim();
    if (!cleaned) continue;

    const rootId = source.itemId
      ? rootOf(source.itemId)
      : (nameToRoot.get(cleaned.toLowerCase()) ?? null);
    const key = rootId ?? `name:${cleaned.toLowerCase()}`;
    const matched = rootId !== null;
    const name = matched ? (nameById.get(rootId) ?? cleaned) : cleaned;

    const group =
      groups.get(key) ??
      ({
        key,
        name,
        matched,
        rootId,
        uses: new Map<string, GroupUse>(),
        original: new Map<string, number>(),
        remaining: new Map<string, number>(),
        labels: new Map<string, string>(),
      } satisfies GroupAccum);

    const mealKey = `${source.date}|${source.recipeId}`;
    const use =
      group.uses.get(mealKey) ??
      ({
        recipeId: source.recipeId,
        recipeName: source.recipeName,
        date: source.date,
        dateLabel: source.dateLabel,
        made: source.made,
        texts: [],
      } satisfies GroupUse);

    const text = source.quantityText.trim();
    if (text) use.texts.push(text);

    const need = parseNeed(source.quantityText);
    if (need) {
      const parsed = parseUnit(need.unit);
      const value = unitValue(need.quantity, parsed);
      if (value > 0) {
        addTo(group.original, group.labels, parsed.key, value, parsed.label);
        if (!source.made) {
          addTo(group.remaining, group.labels, parsed.key, value, parsed.label);
        }
      }
    }

    group.uses.set(mealKey, use);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((accum) => finalize(accum, stockByRoot))
    .sort(
      (a, b) =>
        b.meals - a.meals ||
        b.remainingMeals - a.remainingMeals ||
        a.name.localeCompare(b.name),
    );
}
