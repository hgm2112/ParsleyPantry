/**
 * Canonical ingredient identity. A product keeps its exact scanned name; the
 * canonical match is a separate reference (items.canonical_item_id → root
 * item). The matching key for stock/recipe/grocery logic is
 * coalesce(canonical_item_id, id) — unmapped items keep their own identity.
 *
 * Matching is conservative: names are cleaned of pack sizes / marketing
 * fluff, then candidates must match by exact equality after cleanup, or by
 * strict token containment where every leftover token is known (stoplist or
 * brand). Bare word overlap is never enough, and distinctive tokens (cuts,
 * salted/unsalted, dairy vs alternatives) are never auto-stripped.
 */

/** Pack sizes, weights and counts that say nothing about identity. */
const MEASURE_RE =
  /\b\d+(?:[.,]\d+)?\s*(?:oz|ounce|ounces|g|gram|grams|kg|kilogram|kilograms|lb|lbs|pound|pounds|ml|milliliter|milliliters|l|ltr|liter|liters|gal|gallon|gallons|qt|quart|quarts|pt|pint|pints|ct|count|pk|pack|packs|pc|pcs)\b/g;
const LEADING_MULTIPLE_RE = /\b\d+\s*x\b/g;
const TRAILING_MULTIPLE_RE = /\bx\s*\d+\b/g;

/** Marketing tokens that never change what a recipe means. */
const STOPWORDS = new Set([
  "100",
  "artisan",
  "bulk",
  "everyday",
  "family",
  "fed",
  "free",
  "gmo",
  "grass",
  "non",
  "organic",
  "pasture",
  "premium",
  "range",
  "raised",
  "reserve",
  "size",
  "value",
]);

/**
 * Leftover tokens that always demote a match to "review": meaningful cuts,
 * preparations and dietary distinctions. Belt-and-suspenders on the stoplist
 * (a future stopword can never swallow these).
 */
const DISTINCTIVE = new Set([
  "almond",
  "breast",
  "breasts",
  "chuck",
  "cured",
  "dairy",
  "drumstick",
  "drumsticks",
  "flank",
  "ground",
  "lean",
  "oat",
  "ribeye",
  "skim",
  "smoked",
  "salted",
  "sirloin",
  "soy",
  "strawberry",
  "sweetened",
  "thigh",
  "thighs",
  "tenderloin",
  "unsalted",
  "unsweetened",
  "vanilla",
  "whole",
  "wing",
  "wings",
  "chocolate",
]);

/** Adjectives we only strip when almost nothing remains ("salted butter" → "butter"). */
const CONDITIONAL = new Set(["salted", "unsalted"]);

export interface CanonicalCandidate {
  id: string;
  name: string;
  categoryId?: string | null;
  /**
   * Safe to auto-map onto: the target must be a root (itself unmapped).
   * Non-root targets would create chains and are review-only.
   */
  canonicalSafe?: boolean;
  /** Recipe ingredient names with no items row yet — mapped by creating it. */
  virtual?: boolean;
}

export type CanonicalStatus = "high" | "suggested" | "ambiguous" | "none";

export interface CanonicalMatch {
  status: CanonicalStatus;
  /** Best-first; empty when status is "none". */
  candidates: CanonicalCandidate[];
}

/** Splits an OFF/brand string ("Great Value, Kraft") into lowercase tokens. */
export function brandTokenList(brand: string | null | undefined): string[] {
  if (!brand) return [];
  return brand
    .split(/[,/&]+/)
    .flatMap((part) => part.split(/\s+/))
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

/** Raw token cleanup: lowercase, no parens/hyphens/punct, no pack sizes. */
export function cleanTokens(name: string, brandTokens: string[] = []): string[] {
  const lowered = name.toLowerCase();
  const step = lowered
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[-–—]/g, " ")
    .replace(LEADING_MULTIPLE_RE, " ")
    .replace(TRAILING_MULTIPLE_RE, " ")
    .replace(MEASURE_RE, " ")
    .replace(/[^a-z0-9\s]/g, " ");
  const brand = new Set(brandTokens.map((t) => t.toLowerCase()));
  return step
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .filter((token) => !STOPWORDS.has(token) && !brand.has(token));
}

/** Raw whitespace word count of a name (before any cleanup). */
function rawWordCount(name: string): number {
  return name.trim().toLowerCase().split(/\s+/).filter(Boolean).length;
}

function containsTokens(product: string[], candidate: string[]): boolean {
  const left = new Map<string, number>();
  for (const token of product) left.set(token, (left.get(token) ?? 0) + 1);
  for (const token of candidate) {
    const count = left.get(token) ?? 0;
    if (count === 0) return false;
    left.set(token, count - 1);
  }
  return true;
}

function leftoverTokens(product: string[], candidate: string[]): string[] {
  const left = new Map<string, number>();
  for (const token of product) left.set(token, (left.get(token) ?? 0) + 1);
  for (const token of candidate) left.set(token, (left.get(token) ?? 1) - 1);
  const out: string[] = [];
  for (const [token, count] of left) {
    for (let i = 0; i < count; i += 1) out.push(token);
  }
  return out;
}

type Rating = "exact" | "strip" | "weak";

function rate(
  product: string[],
  candidate: string[],
  known: Set<string>,
): Rating | null {
  if (candidate.length === 0 || !containsTokens(product, candidate)) return null;
  const leftover = leftoverTokens(product, candidate);
  if (leftover.length === 0) return "exact";

  // "salted butter" → "butter": only when a single meaningful token remains.
  if (
    candidate.length <= 1 &&
    leftover.every((token) => CONDITIONAL.has(token))
  ) {
    return "strip";
  }
  if (leftover.some((token) => DISTINCTIVE.has(token))) return "weak";
  if (leftover.every((token) => known.has(token))) return "strip";
  return "weak";
}

/**
 * Suggests the canonical identity for a product name. Exactly one
 * high-confidence candidate means it is safe to auto-apply; everything else
 * lands in the review queue with its suggestion.
 */
export function matchCanonical(
  name: string,
  candidates: CanonicalCandidate[],
  options?: { brandTokens?: string[]; categoryId?: string | null },
): CanonicalMatch {
  const product = cleanTokens(name, options?.brandTokens);
  if (product.length === 0) return { status: "none", candidates: [] };

  const known = new Set<string>([...STOPWORDS, ...(options?.brandTokens ?? [])]);
  const productCategory = options?.categoryId ?? null;

  const rated: { candidate: CanonicalCandidate; rating: Rating }[] = [];
  for (const candidate of candidates) {
    if (candidate.name.trim().toLowerCase() === name.trim().toLowerCase()) {
      // Same name — the caller merges by name before normalizing; skip self.
      continue;
    }
    if (rawWordCount(candidate.name) > rawWordCount(name)) {
      // A longer-named variant (pack sizes/marketing cleaned away) must
      // never become the identity of a shorter product ("Cream Cheese"
      // matching as "Cream Cheese 2 Pack"). The reverse direction stays.
      continue;
    }
    const target = cleanTokens(candidate.name, options?.brandTokens);
    let rating = rate(product, target, known);
    if (rating === null) continue;
    if (rating !== "weak") {
      const candidateCategory = candidate.categoryId ?? null;
      if (
        productCategory &&
        candidateCategory &&
        productCategory !== candidateCategory
      ) {
        rating = "weak";
      } else if (!candidate.canonicalSafe) {
        rating = "weak";
      }
    }
    rated.push({ candidate, rating });
  }

  if (rated.length === 0) return { status: "none", candidates: [] };

  rated.sort((a, b) => {
    const rank = (r: Rating) => (r === "exact" ? 0 : r === "strip" ? 1 : 2);
    return rank(a.rating) - rank(b.rating);
  });
  const ordered = rated.map((entry) => entry.candidate);
  const strong = rated.filter((entry) => entry.rating !== "weak");

  if (strong.length > 0) {
    return { status: strong.length === 1 ? "high" : "ambiguous", candidates: ordered };
  }
  if (rated.length === 1) return { status: "suggested", candidates: ordered };
  return { status: "ambiguous", candidates: ordered };
}

export interface RootableItem {
  id: string;
  canonical_item_id?: string | null;
}

/**
 * Map of mapped item id → display name of its generic root, for cards and
 * lists ("as Ground Beef"). Unmapped items and roots get no entry.
 */
export function buildCanonicalNameMap(
  rows: { id: string; name: string; canonical_item_id: string | null }[],
): Record<string, string> {
  const rootOf = createRootLookup(rows);
  const nameById = new Map(rows.map((row) => [row.id, row.name]));
  const out: Record<string, string> = {};
  for (const row of rows) {
    if (!row.canonical_item_id || row.canonical_item_id === row.id) continue;
    const root = rootOf(row.id);
    if (root === row.id) continue;
    const name = nameById.get(root);
    if (name) out[row.id] = name;
  }
  return out;
}

/**
 * Root resolver for items.canonical_item_id (cycle-safe, memoized). The app
 * always stores the root directly, so one hop is the norm.
 */
export function createRootLookup<T extends RootableItem>(
  items: T[],
): (id: string) => string {
  const byId = new Map<string, string | null>();
  for (const item of items) byId.set(item.id, item.canonical_item_id ?? null);
  const memo = new Map<string, string>();
  return (id: string) => {
    const seen = memo.get(id);
    if (seen) return seen;
    let current = id;
    for (let hop = 0; hop < 8; hop += 1) {
      const next = byId.get(current);
      if (!next || next === current) break;
      current = next;
    }
    memo.set(id, current);
    return current;
  };
}
