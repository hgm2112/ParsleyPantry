export type KitchenOwlItem = {
  name: string;
  category?: string | null;
  icon?: string | null;
};

export type KitchenOwlIngredient = {
  name: string;
  description?: string | null;
  optional?: boolean | null;
};

export type KitchenOwlRecipe = {
  name: string;
  description?: string | null;
  prep_time?: number | null;
  cook_time?: number | null;
  time?: number | null;
  yields?: number | null;
  source?: string | null;
  tags?: string[] | null;
  items?: KitchenOwlIngredient[] | null;
};

export type KitchenOwlExport = {
  items: KitchenOwlItem[];
  recipes: KitchenOwlRecipe[];
};

const LEADING_EMOJI = /^(?:\p{Extended_Pictographic}[\uFE0F\u200D\p{Extended_Pictographic}]*\s*)+/u;
const AISLE_NUMBER = /^(\d+)\s*-\s*/;

/**
 * KitchenOwl category labels look like "🥫 12 - Canned food",
 * "🥬 Fruits and vegetables", or plain "Kroger".
 * The display name keeps the label verbatim (emoji + aisle number);
 * icon/number are also extracted for metadata and ordering.
 */
export function parseCategoryLabel(label: string): {
  name: string;
  icon: string | null;
  number: number | null;
} {
  const name = label.trim().replace(/\s+/g, " ");
  if (!name) return { name: label.trim(), icon: null, number: null };

  const iconMatch = LEADING_EMOJI.exec(name);
  const icon = iconMatch ? iconMatch[0].trim() || null : null;
  const afterIcon = iconMatch ? name.slice(iconMatch[0].length) : name;
  const numberMatch = AISLE_NUMBER.exec(afterIcon);
  const number = numberMatch ? Number(numberMatch[1]) : null;

  return { name, icon, number };
}

/**
 * Stable matching key for a category/aisle label: emoji and aisle
 * numbering stripped, trimmed, lowercased — so "Cleaning Aisle" and
 * "🧼 14 - Cleaning Aisle" always match each other.
 */
export function categoryMatchKey(label: string): string {
  let rest = label.trim().replace(/\s+/g, " ");
  rest = rest.replace(LEADING_EMOJI, "");
  rest = rest.replace(AISLE_NUMBER, "");
  return rest.trim().toLowerCase();
}

export function isKitchenOwlExport(value: unknown): value is KitchenOwlExport {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { items?: unknown; recipes?: unknown };
  return Array.isArray(candidate.items) && Array.isArray(candidate.recipes);
}
