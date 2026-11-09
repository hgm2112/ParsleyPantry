/**
 * Stable identifiers for reorderable Home dashboard widgets.
 * Week Meals is fixed and intentionally excluded — only the 11 masonry
 * widgets below are customizable and persisted. Sizes stay hardcoded per
 * widget in HomeView; only the ID order is persisted here.
 */
export const DASHBOARD_WIDGET_IDS = [
  "smart-actions",
  "leftovers",
  "snacks",
  "new-to-try",
  "quick-bites",
  "pantry-insights",
  "mini-calendar",
  "stats",
  "promo",
  "pantry",
  "shopping",
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];

/** Current arrangement for the 11 customizable widgets (after fixed Week). */
export const DEFAULT_DASHBOARD_ORDER: DashboardWidgetId[] = [
  "smart-actions",
  "leftovers",
  "snacks",
  "new-to-try",
  "quick-bites",
  "pantry-insights",
  "mini-calendar",
  "stats",
  "promo",
  "pantry",
  "shopping",
];

const WIDGET_IDS = new Set<string>(DASHBOARD_WIDGET_IDS);

export function isDashboardWidgetId(value: unknown): value is DashboardWidgetId {
  return typeof value === "string" && WIDGET_IDS.has(value);
}

/** Drop unknowns/duplicates, keep first occurrence order. */
export function normalizeDashboardOrder(
  input: unknown,
): DashboardWidgetId[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const result: DashboardWidgetId[] = [];
  for (const entry of input) {
    if (!isDashboardWidgetId(entry)) continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    result.push(entry);
  }
  return result;
}

/**
 * Saved-order resolution: deduped/filtered saved IDs first, then any
 * default IDs missing from the saved list appended in default position.
 * Empty/invalid saved values fall back to the default order. New widgets
 * therefore appear automatically without overwriting household prefs.
 */
export function resolveDashboardOrder(
  saved: unknown,
): DashboardWidgetId[] {
  const normalized = normalizeDashboardOrder(saved);
  const result = [...normalized];
  for (const id of DEFAULT_DASHBOARD_ORDER) {
    if (!result.includes(id)) result.push(id);
  }
  return result;
}

export function isDefaultDashboardOrder(
  order: readonly DashboardWidgetId[],
): boolean {
  if (order.length !== DEFAULT_DASHBOARD_ORDER.length) return false;
  return order.every((id, index) => id === DEFAULT_DASHBOARD_ORDER[index]);
}
