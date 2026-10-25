export type Location = "pantry" | "fridge" | "freezer";

export type GrocerySource =
  | "manual"
  | "low_stock"
  | "consume"
  | "recipe"
  | "planner";

export type GroceryViewMode = "aisle" | "category";

export interface ProfileRow {
  id: string;
  email: string | null;
  display_name: string | null;
  current_household_id: string | null;
}

export interface HouseholdRow {
  id: string;
  name: string;
  invite_code: string;
  is_auto: boolean;
}

export interface MemberRow {
  household_id: string;
  user_id: string;
  role: "owner" | "member";
  created_at: string;
  profiles?: { display_name: string | null; email: string | null } | null;
}

export interface CategoryRow {
  id: string;
  household_id: string;
  name: string;
  icon: string | null;
  sort_order: number;
  seed_stores: boolean;
}

export interface SubcategoryRow {
  id: string;
  household_id: string;
  name: string;
  sort_order: number;
}

export interface ItemRow {
  id: string;
  household_id: string;
  name: string;
  category_id: string | null;
  subcategory_id: string | null;
  icon: string | null;
  barcode: string | null;
  /** Brand from the barcode lookup when available. */
  brand: string | null;
  /**
   * Generic catalog entry this product matches recipes as. null = canonical
   * identity itself (generic or unmapped); matching key = this ?? id.
   */
  canonical_item_id: string | null;
  /**
   * User looked at this item in the ingredient review queue and chose to keep
   * it as its own generic identity (never auto-mapped, hidden from review).
   */
  canonical_reviewed: boolean;
  default_location: Location;
  expiration_days: number | null;
  low_threshold: number | null;
  auto_restock: boolean;
  unit: string | null;
  /**
   * Pieces per purchased pack ("1 carton = 12 eggs"); null = not a pack item.
   * Stock for pack items is stored in pieces — quantities are multiplied by
   * this at purchase time so consumption never deals in fractions of a pack.
   */
  pack_size: number | null;
  /** What one piece inside a pack is called ("eggs", "packets"). */
  pack_unit: string | null;
  /** Last freezer food type chosen for this item (key from lib/freezer.ts). */
  freezer_food_type: string | null;
  created_by: string | null;
  /** Count of times this catalog item has been added to grocery list (for ranking). */
  grocery_add_count?: number | null;
  grocery_last_added_at?: string | null;
}

export interface InventoryRow {
  id: string;
  household_id: string;
  item_id: string;
  location: Location;
  quantity: number;
  unit: string | null;
  expiration_date: string | null;
  /** Date stock entered the freezer; null = unknown / not recorded. */
  frozen_at: string | null;
  /** Months from frozen_at to the best-quality date; null = not tracked. */
  freezer_duration_months: number | null;
  /** Computed best-quality-by date while frozen; cleared on thaw. */
  freezer_quality_date: string | null;
  /**
   * Bought already frozen — the original freezing date is unknown (frozen_at
   * stays null and no quality countdown is invented). Distinct from a freezer
   * row that simply isn't tracked. Cleared when the row leaves the freezer.
   */
  purchased_frozen: boolean;
  is_low: boolean;
  source: string | null;
  notes: string | null;
  added_by: string | null;
  created_at: string;
}

export interface InventoryWithItem extends InventoryRow {
  item: ItemRow | null;
}

/** Inner-joined inventory row: the item always exists. */
export type InventoryEntry = InventoryRow & { item: ItemRow };

export interface StoreRow {
  id: string;
  household_id: string;
  name: string;
  sort_order: number;
  use_aisles: boolean;
}

export interface StoreAisleRow {
  id: string;
  household_id: string;
  store_id: string;
  name: string;
  sort_order: number;
  category_id: string | null;
}

export interface HouseholdSettingsRow {
  household_id: string;
  /** Stores currently shown in the shopping list. Empty means "all stores". */
  selected_store_ids: string[];
  /** Mirrors `selected_store_ids[0]`; kept for older readers. */
  selected_store_id: string | null;
  grocery_view_mode: GroceryViewMode;
  default_location: Location;
}

/** Which store a grocery line is bought at. No row = "Any store". */
export interface GroceryItemStoreRow {
  household_id: string;
  grocery_item_id: string;
  store_id: string;
}

/** Durable per-catalog-item store memory (which stores you buy this item at). */
export interface ItemStoreRow {
  household_id: string;
  item_id: string;
  store_id: string;
}

export interface GroceryItemRow {
  id: string;
  household_id: string;
  item_id: string | null;
  name: string;
  quantity: number;
  unit: string | null;
  category_id: string | null;
  checked: boolean;
  sale_only: boolean;
  source: GrocerySource;
  created_by: string | null;
}

export interface RecipeRow {
  id: string;
  household_id: string;
  name: string;
  description: string;
  prep_time: number;
  cook_time: number;
  time: number;
  yields: number;
  source: string | null;
  tags: string[];
  recipe_type: RecipeType;
}

export interface RecipeIngredientRow {
  id: string;
  household_id: string;
  recipe_id: string;
  item_id: string | null;
  name: string;
  quantity_text: string;
  optional: boolean;
  on_shopping_list: boolean;
  sort_order: number;
}

/** Structured non-recipe day: eating out / meal kit / no cooking. */
export type MealKind = "eating_out" | "meal_kit" | "no_cook";

export type RecipeType = "cooking" | "no_cook";

export interface CustomMealRow {
  id: string;
  household_id: string;
  name: string;
  icon: string;
  classification: CustomMealClassification;
  created_at: string;
  updated_at: string;
}

export type CustomMealClassification = "cooking" | "no_cook";

export interface MealPlanDayRow {
  household_id: string;
  week_start: string;
  day_index: number;
  recipe_id: string | null;
  kind: MealKind | null;
  note: string | null;
  made_at: string | null;
  custom_meal_id: string | null;
  custom_meal_name: string | null;
  custom_meal_classification: CustomMealClassification | null;
}

export interface StockHoldRow {
  id: string;
  household_id: string;
  item_id: string;
  quantity: number;
  unit: string | null;
  week_start: string;
  day_index: number;
}

/** A named leftover — a standalone household reminder, not an inventory record. */
export interface LeftoverRow {
  id: string;
  household_id: string;
  name: string;
  created_at: string;
}

/** Per-user daily leftovers-reminder preferences (push notifications). */
export interface NotificationSettingsRow {
  user_id: string;
  enabled: boolean;
  /** Local wall-clock time as "HH:MM:SS" (PostgREST `time`), default 18:00. */
  local_time: string;
  /** IANA zone captured when the user saved the setting, e.g. "America/New_York". */
  timezone: string | null;
  generic_message: boolean;
  updated_at: string;
}

/** One browser/device push subscription owned by a user. */
export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type HomeMeal = MealPlanDayRow & {
  recipe: { id: string; name: string; time: number; tags: string[] } | null;
};

export const LOCATIONS: { value: Location; label: string; icon: string }[] = [
  { value: "pantry", label: "Pantry", icon: "package" },
  { value: "fridge", label: "Fridge", icon: "refrigerator" },
  { value: "freezer", label: "Freezer", icon: "snowflake" },
];
