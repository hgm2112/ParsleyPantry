import { Ban, Package, UtensilsCrossed, type LucideIcon } from "lucide-react";
import type { MealKind, MealPlanDayRow } from "@/lib/types";

export type MealKindMeta = {
  kind: MealKind;
  label: string;
  Icon: LucideIcon;
  /** Tint triple in the same shape as lib/tints. */
  tint: { header: string; icon: string; dot: string };
  /** Note placeholder while this kind is selected. */
  placeholder: string;
};

export const MEAL_KINDS: MealKindMeta[] = [
  {
    kind: "eating_out",
    label: "Eating out",
    Icon: UtensilsCrossed,
    tint: {
      header: "bg-amber-50 border-amber-200 text-amber-900",
      icon: "text-amber-600",
      dot: "bg-amber-500",
    },
    placeholder: "Pizza from Sal's…",
  },
  {
    kind: "meal_kit",
    label: "Meal kit",
    Icon: Package,
    tint: {
      header: "bg-sky-50 border-sky-200 text-sky-900",
      icon: "text-sky-600",
      dot: "bg-sky-500",
    },
    placeholder: "What's in the kit?",
  },
  {
    kind: "no_cook",
    label: "No cooking",
    Icon: Ban,
    tint: {
      header: "bg-lime-50 border-lime-200 text-lime-900",
      icon: "text-lime-600",
      dot: "bg-lime-500",
    },
    placeholder: "Cereal night…",
  },
];

/** Neutral tint for plain note-only days (no recipe, no kind). */
export const NOTE_TINT: MealKindMeta["tint"] = {
  header: "bg-muted border-border text-foreground",
  icon: "text-muted-foreground",
  dot: "bg-muted-foreground",
};

export function mealKindInfo(
  kind: MealKind | null | undefined,
): MealKindMeta | null {
  return MEAL_KINDS.find((entry) => entry.kind === kind) ?? null;
}

/** Primary title for a day: recipe name > kind label > note > null. */
export function dayTitle(
  entry: Pick<MealPlanDayRow, "kind" | "note"> | null | undefined,
  recipeName?: string | null,
): string | null {
  if (recipeName) return recipeName;
  const info = mealKindInfo(entry?.kind);
  if (info) return info.label;
  return entry?.note?.trim() || null;
}

/** A day counts as planned when a recipe, a kind, or a note is set. */
export function isPlanned(
  entry: Pick<MealPlanDayRow, "recipe_id" | "kind" | "note"> | null | undefined,
): boolean {
  return Boolean(entry?.recipe_id || entry?.kind || entry?.note?.trim());
}
