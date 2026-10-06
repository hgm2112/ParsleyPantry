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

const EMOJI_TOKEN = /^\p{Extended_Pictographic}[\uFE0F\u200D\p{Extended_Pictographic}]*/u;
const NUMBER_TOKEN = /^\d+$/;

/**
 * KitchenOwl category labels look like "🥫 12 - Canned food",
 * "🥬 Fruits and vegetables", or plain "Kroger".
 * Splits them into a display name plus the leading emoji as an icon.
 */
export function parseCategoryLabel(label: string): {
  name: string;
  icon: string | null;
} {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { name: label.trim(), icon: null };

  let icon: string | null = null;
  if (EMOJI_TOKEN.test(parts[0])) {
    icon = parts[0];
    parts.shift();
  }

  // Strip aisle numbering like "12 -"
  if (parts.length >= 2 && NUMBER_TOKEN.test(parts[0]) && parts[1] === "-") {
    parts.splice(0, 2);
  }

  const name = parts.join(" ").trim();
  return { name: name || label.trim(), icon };
}

export function isKitchenOwlExport(value: unknown): value is KitchenOwlExport {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { items?: unknown; recipes?: unknown };
  return Array.isArray(candidate.items) && Array.isArray(candidate.recipes);
}
