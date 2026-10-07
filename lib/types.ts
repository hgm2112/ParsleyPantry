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

export interface ItemRow {
  id: string;
  household_id: string;
  name: string;
  category_id: string | null;
  icon: string | null;
  barcode: string | null;
  default_location: Location;
  expiration_days: number | null;
  low_threshold: number | null;
  auto_restock: boolean;
  unit: string | null;
  created_by: string | null;
}

export interface InventoryRow {
  id: string;
  household_id: string;
  item_id: string;
  location: Location;
  quantity: number;
  unit: string | null;
  expiration_date: string | null;
  is_low: boolean;
  source: string | null;
  notes: string | null;
  added_by: string | null;
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
  selected_store_id: string | null;
  grocery_view_mode: GroceryViewMode;
  default_location: Location;
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
}

export interface RecipeIngredientRow {
  id: string;
  household_id: string;
  recipe_id: string;
  item_id: string | null;
  name: string;
  quantity_text: string;
  optional: boolean;
  sort_order: number;
}

export interface MealPlanDayRow {
  household_id: string;
  week_start: string;
  day_index: number;
  recipe_id: string | null;
  note: string | null;
}

export type HomeMeal = MealPlanDayRow & {
  recipe: { id: string; name: string; time: number; tags: string[] } | null;
};

export const LOCATIONS: { value: Location; label: string; icon: string }[] = [
  { value: "pantry", label: "Pantry", icon: "package" },
  { value: "fridge", label: "Fridge", icon: "refrigerator" },
  { value: "freezer", label: "Freezer", icon: "snowflake" },
];
