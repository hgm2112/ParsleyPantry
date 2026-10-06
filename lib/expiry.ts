export type ExpirySuggestion = { days: number; reason: string };

type Rule = {
  test: (tags: string[], name: string | null) => boolean;
  days: number;
  reason: string;
};

const has = (tags: string[], ...keys: string[]) =>
  tags.some((tag) => keys.some((key) => tag.includes(key)));

/**
 * Maps Open Food Facts category tags to a default shelf life in days.
 * Order matters: first match wins, so narrower rules come first.
 */
const RULES: Rule[] = [
  { test: (t) => has(t, "berries"), days: 3, reason: "Berries" },
  { test: (t) => has(t, "bananas"), days: 5, reason: "Bananas" },
  {
    test: (t, n) => has(t, "fresh-meat", "poultry") || /chicken|turkey/.test(n ?? ""),
    days: 2,
    reason: "Fresh meat",
  },
  {
    test: (t) => has(t, "fishes", "seafood", "shellfish"),
    days: 2,
    reason: "Seafood",
  },
  {
    test: (t, n) => has(t, "beef", "pork", "lamb", "meats") || /steak|ground (beef|pork)/.test(n ?? ""),
    days: 3,
    reason: "Fresh red meat",
  },
  {
    test: (t, n) =>
      has(t, "milks", "dairy-beverages", "plant-milks") || /milk/.test(n ?? ""),
    days: 7,
    reason: "Milk",
  },
  {
    test: (t, n) => has(t, "yogurts") || /yogurt/.test(n ?? ""),
    days: 14,
    reason: "Yogurt",
  },
  {
    test: (t, n) => has(t, "cheeses") || /cheese/.test(n ?? ""),
    days: 14,
    reason: "Cheese",
  },
  {
    test: (t) => has(t, "butter"),
    days: 30,
    reason: "Butter",
  },
  {
    test: (t, n) => has(t, "eggs") || /^eggs?$/.test((n ?? "").toLowerCase()),
    days: 28,
    reason: "Eggs",
  },
  {
    test: (t) => has(t, "breads", "bakery", "bread-rolls"),
    days: 5,
    reason: "Bread",
  },
  {
    test: (t, n) =>
      has(t, "fresh-fruits", "fresh-vegetables", "lettuce-and-leafy-products") ||
      /salad|spinach|herbs/.test(n ?? ""),
    days: 5,
    reason: "Produce",
  },
  { test: (t) => has(t, "prepared-fruits", "fruit-juices"), days: 7, reason: "Juice" },
  { test: (t) => has(t, "frozen"), days: 180, reason: "Frozen" },
  {
    test: (t, n) => has(t, "canned") || /canned|soup/.test(n ?? ""),
    days: 365,
    reason: "Canned goods",
  },
  {
    test: (t, n) => has(t, "pastas", "rice", "flours", "cereals") || /pasta|rice|flour|oat/.test(n ?? ""),
    days: 365,
    reason: "Dry pantry",
  },
  {
    test: (t, n) => has(t, "chips", "crisps", "chocolates", "sweets", "biscuits") || /snack|candy|chip|cookie/.test(n ?? ""),
    days: 180,
    reason: "Snacks",
  },
  {
    test: (t) =>
      has(t, "soft-drinks", "waters", "beers", "wines", "teas", "coffees"),
    days: 180,
    reason: "Drinks",
  },
  {
    test: (t) => has(t, "condiments", "sauces", "dressings", "mustards", "ketchups", "mayonnaises"),
    days: 180,
    reason: "Condiments",
  },
  {
    test: (t) => has(t, "household", "cleaning", "paper-towels", "detergents"),
    days: 730,
    reason: "Household",
  },
];

export function suggestExpiration(
  tags: string[],
  name: string | null,
): ExpirySuggestion | null {
  const normalizedTags = tags.map((tag) => tag.toLowerCase());
  for (const rule of RULES) {
    if (rule.test(normalizedTags, name)) {
      return { days: rule.days, reason: rule.reason };
    }
  }
  return null;
}

export type ExpiryBucket = "expired" | "urgent" | "soon" | "ok";

export function expiryBucket(dateStr: string | null): ExpiryBucket | null {
  if (!dateStr) return null;
  const today = startOfToday();
  const target = parseDate(dateStr);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return "expired";
  if (diffDays <= 3) return "urgent";
  if (diffDays <= 7) return "soon";
  return "ok";
}

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.round(
    (parseDate(dateStr).getTime() - startOfToday().getTime()) / 86_400_000,
  );
}

export function formatExpiry(dateStr: string | null): string {
  if (!dateStr) return "No expiry";
  const days = daysUntil(dateStr);
  if (days === null) return "No expiry";
  if (days < -1) return `Expired ${Math.abs(days)}d ago`;
  if (days === -1) return "Expired yesterday";
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  if (days <= 14) return `In ${days}d`;
  return parseDate(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function addDays(days: number, from: Date = startOfToday()): string {
  const date = new Date(from.getTime() + days * 86_400_000);
  return toDateString(date);
}

export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
