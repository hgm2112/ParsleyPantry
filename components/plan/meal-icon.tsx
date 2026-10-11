"use client";

import Image from "next/image";
import type { KeyboardEvent } from "react";
import { Check, ChefHat, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOTE_TINT, mealKindInfo } from "@/lib/meal-kind";
import { tintFor } from "@/lib/tints";
import type { MealPlanDayRow } from "@/lib/types";

/**
 * Round tinted icon shared by the dinners widget and /plan day cards:
 * today (unmade) = ChefHat, made = white Check, recipe = knifefork svg.
 * `onMark` is optional — without it (plan cards) the today circle is
 * decorative and the card's own click handler takes over.
 */
export function MealIcon({
  iso,
  today,
  meal,
  recipe,
  onMark,
  size = "lg",
}: {
  iso: string;
  today: string;
  meal: Pick<MealPlanDayRow, "kind" | "made_at"> | null;
  recipe: { name: string } | null;
  onMark?: (event: {
    stopPropagation: () => void;
    preventDefault: () => void;
  }) => void;
  size?: "lg" | "sm";
}) {
  const kindInfo = mealKindInfo(meal?.kind);
  const KindIcon = kindInfo?.Icon;
  const tint = recipe
    ? tintFor(recipe.name)
    : kindInfo
      ? kindInfo.tint
      : NOTE_TINT;
  const box = size === "lg" ? "size-12" : "size-9";
  const icon = size === "lg" ? "h-7 w-7" : "h-4 w-4";
  const image = size === "lg" ? "h-9" : "h-5";

  if (iso === today && !meal?.made_at) {
    return (
      <span
        {...(onMark
          ? {
              role: "button",
              tabIndex: 0,
              "aria-label": "Mark today's dinner as made",
              onClick: onMark,
              onKeyDown: (event: KeyboardEvent) => {
                if (event.key === "Enter" || event.key === " ") {
                  onMark(event);
                }
              },
              className: cn(
                "relative flex shrink-0 cursor-pointer items-center justify-center rounded-full transition-shadow hover:ring-2 hover:ring-white/80",
                box,
                tint.dot,
              ),
            }
          : {
              "aria-hidden": true,
              className: cn(
                "relative flex shrink-0 items-center justify-center rounded-full",
                box,
                tint.dot,
              ),
            })}
      >
        <ChefHat className={cn(icon, "text-white")} />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full",
        box,
        tint.dot,
      )}
      aria-hidden
    >
      {meal?.made_at ? (
        <Check className={cn(icon, "text-white")} aria-label="Made" />
      ) : recipe ? (
        <Image
          src="/knifefork2.svg"
          alt=""
          width={792}
          height={720}
          unoptimized
          className={cn(image, "w-auto select-none brightness-0 invert")}
        />
      ) : KindIcon ? (
        <KindIcon className={cn(icon, "text-white")} />
      ) : (
        <StickyNote className={cn(icon, "text-white")} />
      )}
    </span>
  );
}
