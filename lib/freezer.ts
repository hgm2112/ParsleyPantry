import { addMonths } from "date-fns";
import { daysUntil, parseDate, toDateString } from "@/lib/expiry";

/**
 * Freezer-aware expiration tracking.
 *
 * While a row lives at location "freezer":
 *  - expiration_date keeps the ORIGINAL refrigerated date (never overwritten),
 *  - frozen_at records when it went in (null = purchased frozen / unknown),
 *  - freezer_quality_date = frozen_at + recommended months (computed once,
 *    never chained through a previous quality date).
 * Moving back out of the freezer clears the freeze fields (thaw).
 */

export type FreezerGroup =
  | "Beef"
  | "Pork"
  | "Poultry"
  | "Prepared meals & leftovers"
  | "Other";

export type FreezerFoodType = {
  key: string;
  label: string;
  group: FreezerGroup;
  /** Recommended months at 0 °F; null = no validated duration. */
  months: number | null;
  /** Extra caveat shown when this type is selected. */
  warning?: string;
};

/** Longest end of each USDA-style range; cream cheese has no date (texture only). */
export const FREEZER_FOOD_TYPES: Record<string, FreezerFoodType> = {
  "beef.steaks": { key: "beef.steaks", label: "Beef steaks", group: "Beef", months: 12 },
  "beef.roasts": { key: "beef.roasts", label: "Beef roasts", group: "Beef", months: 12 },
  "beef.ground": { key: "beef.ground", label: "Ground beef", group: "Beef", months: 4 },
  "beef.cooked": { key: "beef.cooked", label: "Cooked beef", group: "Beef", months: 3 },
  "pork.chops": { key: "pork.chops", label: "Pork chops", group: "Pork", months: 6 },
  "pork.roasts": { key: "pork.roasts", label: "Pork roasts & loin", group: "Pork", months: 6 },
  "pork.ground": { key: "pork.ground", label: "Ground pork", group: "Pork", months: 4 },
  "pork.cooked": { key: "pork.cooked", label: "Cooked pork", group: "Pork", months: 3 },
  "pork.bacon": { key: "pork.bacon", label: "Bacon", group: "Pork", months: 2 },
  "pork.sausage": { key: "pork.sausage", label: "Sausage", group: "Pork", months: 2 },
  "poultry.whole": {
    key: "poultry.whole",
    label: "Whole chicken or turkey",
    group: "Poultry",
    months: 12,
  },
  "poultry.pieces": {
    key: "poultry.pieces",
    label: "Chicken or turkey pieces",
    group: "Poultry",
    months: 9,
  },
  "poultry.ground": {
    key: "poultry.ground",
    label: "Ground chicken or turkey",
    group: "Poultry",
    months: 4,
  },
  "poultry.cooked": {
    key: "poultry.cooked",
    label: "Cooked chicken or turkey",
    group: "Poultry",
    months: 4,
  },
  "prepared.leftovers": {
    key: "prepared.leftovers",
    label: "Cooked leftovers",
    group: "Prepared meals & leftovers",
    months: 3,
  },
  "prepared.casserole": {
    key: "prepared.casserole",
    label: "Casseroles",
    group: "Prepared meals & leftovers",
    months: 3,
  },
  "prepared.soup": {
    key: "prepared.soup",
    label: "Soups & stews",
    group: "Prepared meals & leftovers",
    months: 3,
  },
  "prepared.meal": {
    key: "prepared.meal",
    label: "Home-prepared meals",
    group: "Prepared meals & leftovers",
    months: 3,
  },
  "prepared.commercial": {
    key: "prepared.commercial",
    label: "Commercial frozen dinners",
    group: "Prepared meals & leftovers",
    months: 4,
  },
  "other.hotdogs": { key: "other.hotdogs", label: "Hot dogs", group: "Other", months: 2 },
  "other.deli": { key: "other.deli", label: "Deli meats", group: "Other", months: 2 },
  "other.cream_cheese": {
    key: "other.cream_cheese",
    label: "Cream cheese",
    group: "Other",
    months: null,
    warning: "Freezing can change the texture.",
  },
};

export const FREEZER_GROUPS: FreezerGroup[] = [
  "Beef",
  "Pork",
  "Poultry",
  "Prepared meals & leftovers",
  "Other",
];

export const FREEZER_UNKNOWN_KEY = "__unknown";

export function foodTypeByKey(key: string | null | undefined): FreezerFoodType | null {
  if (!key) return null;
  return FREEZER_FOOD_TYPES[key] ?? null;
}

const COOKED_WORD =
  /\b(cooked|leftovers?|rotisserie|fried|grilled|meatloaf|meal prep)\b/;
const HAS_CHICKEN = /\b(chicken|turkey|poultry)\b/;
const HAS_PORK = /\bpork\b/;
const HAS_BEEF = /\b(beef|steak|meatloaf)\b/;

/**
 * Conservative name-based guess used only to prefill the freeze dialog.
 * Never invents a duration: unmatched names return null → "Not sure".
 */
export function guessFreezerFoodType(
  name: string,
  categoryName?: string | null,
  subcategoryName?: string | null,
): string | null {
  const n = name.toLowerCase();
  const ctx = `${categoryName ?? ""} ${subcategoryName ?? ""}`.toLowerCase();
  const hay = `${n} ${ctx}`;

  if (/cream cheese/.test(n)) return "other.cream_cheese";
  if (/ground (chicken|turkey)/.test(n)) return "poultry.ground";
  if (/ground pork/.test(n)) return "pork.ground";
  if (/\bground (beef|mince)\b|beef mince|minced beef/.test(n)) return "beef.ground";
  if (/\bbacon\b/.test(n)) return "pork.bacon";
  if (/\bsausage/.test(n)) return "pork.sausage";
  if (/hot ?dogs?/.test(n)) return "other.hotdogs";
  if (/\bdeli meats?\b|\blunch meat\b|\bcold cuts?\b|salami|prosciutto|pepperoni|\bcooked ham\b/.test(n))
    return "other.deli";
  if (/\bsoup\b|\bstew\b|\bchili\b/.test(n)) return "prepared.soup";
  if (/casserole/.test(n)) return "prepared.casserole";
  if (/frozen dinners?|frozen meals?|tv dinners?|lean cuisine|stouffers|banquet|hot ?pockets?|pizza rolls?/.test(n))
    return "prepared.commercial";

  // Cooked/prepared context → cooked variants (raw cuts are handled below).
  if (COOKED_WORD.test(n) || COOKED_WORD.test(ctx)) {
    if (HAS_CHICKEN.test(hay)) return "poultry.cooked";
    if (HAS_PORK.test(hay)) return "pork.cooked";
    if (HAS_BEEF.test(hay)) return "beef.cooked";
    if (/meal prep/.test(n)) return "prepared.meal";
    if (/\bleftovers?\b/.test(hay)) return "prepared.leftovers";
    return null;
  }

  // Raw cuts.
  if (/steaks?|ribeye|sirloin|t-bone|filet mignon|new york strip/.test(n)) return "beef.steaks";
  if (/pork chops?/.test(n)) return "pork.chops";
  if (/pork (loin|roast|tenderloin)/.test(n)) return "pork.roasts";
  if (/\b(chuck|brisket|round|sirloin) roasts?\b|\bbeef roasts?\b/.test(n)) return "beef.roasts";
  if (/\bwhole\b.*(chicken|turkey)|(chicken|turkey).*\bwhole\b|\bfryers?\b|\broasters?\b/.test(n))
    return "poultry.whole";
  if (
    (HAS_CHICKEN.test(n) &&
      /\b(breasts?|thighs?|drumsticks?|wings?|tenders?|legs?)\b/.test(n)) ||
    /\b(breasts?|thighs?|drumsticks?|wings?|tenders?) (of )?(chicken|turkey)/.test(n)
  )
    return "poultry.pieces";

  return null;
}

/** Best-quality-by date = frozen_at + months (date-fns clamps month ends). */
export function computeFreezerQualityDate(frozenAt: string, months: number): string {
  return toDateString(addMonths(parseDate(frozenAt), months));
}

export function isFrozenRow(row: { location: string }): boolean {
  return row.location === "freezer";
}

/** The date that drives alerts/sorting for a row, storage-aware. */
export function effectiveExpiryDate(row: {
  location: string;
  expiration_date: string | null;
  freezer_quality_date: string | null;
}): string | null {
  if (row.location === "freezer") return row.freezer_quality_date;
  return row.expiration_date;
}

export function freezerStatus(row: {
  location: string;
  freezer_quality_date: string | null;
}): "untracked" | "near-quality" | "quality-passed" | null {
  if (row.location !== "freezer") return null;
  if (!row.freezer_quality_date) return "untracked";
  const days = daysUntil(row.freezer_quality_date);
  if (days === null) return "untracked";
  return days < 0 ? "quality-passed" : "near-quality";
}

export type ExpiryChipMode = "refrigerated" | "freezer" | "freezer-untracked";

/** Chip props for any inventory row: picks the right date + mode. */
export function expiryChipProps(row: {
  location: string;
  expiration_date: string | null;
  freezer_quality_date: string | null;
}): { date: string | null; mode: ExpiryChipMode } {
  if (row.location !== "freezer") {
    return { date: row.expiration_date, mode: "refrigerated" };
  }
  return row.freezer_quality_date
    ? { date: row.freezer_quality_date, mode: "freezer" }
    : { date: null, mode: "freezer-untracked" };
}

/** "Best quality by Feb 10" / "Quality date passed" — never "expired". */
export function formatFreezerQuality(date: string | null): string {
  if (!date) return "Frozen";
  const days = daysUntil(date);
  if (days !== null && days < 0) return "Quality date passed";
  return `Best quality by ${parseDate(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}
