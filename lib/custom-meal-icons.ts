import {
  Apple,
  Beef,
  Cake,
  Coffee,
  Fish,
  House,
  Package,
  Pizza,
  Refrigerator,
  Salad,
  Sandwich,
  UtensilsCrossed,
  Wine,
  type LucideIcon,
} from "lucide-react";
import type { CustomMealClassification } from "@/lib/types";

export const CUSTOM_MEAL_ICON_OPTIONS = [
  { id: "utensils", label: "Takeout", Icon: UtensilsCrossed },
  { id: "pizza", label: "Pizza", Icon: Pizza },
  { id: "refrigerator", label: "Leftovers", Icon: Refrigerator },
  { id: "sandwich", label: "Sandwich", Icon: Sandwich },
  { id: "package", label: "Meal box", Icon: Package },
  { id: "salad", label: "Salad", Icon: Salad },
  { id: "coffee", label: "Coffee", Icon: Coffee },
  { id: "house", label: "Home", Icon: House },
  { id: "apple", label: "Produce", Icon: Apple },
  { id: "beef", label: "Beef", Icon: Beef },
  { id: "fish", label: "Seafood", Icon: Fish },
  { id: "cake", label: "Dessert", Icon: Cake },
  { id: "wine", label: "Drinks", Icon: Wine },
] as const;

export type CustomMealIconId = (typeof CUSTOM_MEAL_ICON_OPTIONS)[number]["id"];

/** Built-in Other Meals kept as application code (not DB rows). */
export const BUILTIN_OTHER_MEALS: {
  name: string;
  icon: CustomMealIconId;
  classification: CustomMealClassification;
}[] = [
  { name: "Takeout", icon: "utensils", classification: "no_cook" },
  { name: "Pizza", icon: "pizza", classification: "no_cook" },
  { name: "Leftovers", icon: "refrigerator", classification: "cooking" },
];

export const DEFAULT_CUSTOM_MEAL_ICON_LABEL: Record<string, LucideIcon> =
  Object.fromEntries(
    CUSTOM_MEAL_ICON_OPTIONS.map((entry) => [entry.id, entry.Icon]),
  );

export function customMealIcon(
  icon: string | null | undefined,
): LucideIcon | null {
  if (!icon) return null;
  return DEFAULT_CUSTOM_MEAL_ICON_LABEL[icon] ?? null;
}
