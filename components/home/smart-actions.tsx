"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { daysUntil } from "@/lib/expiry";
import { isLowStock } from "@/lib/stock";
import { foodEmoji } from "@/lib/tiles";
import { mondayOf } from "@/lib/plan";
import { useToday } from "@/lib/use-now";
import { addGroceryItem } from "@/app/(app)/grocery/actions";
import type { HomeMeal } from "@/lib/types";
import type { ShoppingPreviewItem } from "@/components/home/shopping-widget";
import type { InventoryEntry } from "@/lib/types";

const EXPIRING_DAYS = 5;

type Card = {
  key: string;
  emoji: string;
  line: ReactNode;
  action: ReactNode;
  tint: string;
};

type Props = {
  pantry: InventoryEntry[];
  grocery: ShoppingPreviewItem[];
  meals: HomeMeal[];
};

export function SmartActions({ pantry, grocery, meals }: Props) {
  const today = useToday();
  const [busy, setBusy] = useState(false);
  const [lowOnList, setLowOnList] = useState<boolean | null>(null);

  const expiring = pantry.filter((row) => {
    const days = daysUntil(row.expiration_date);
    return days !== null && days <= EXPIRING_DAYS;
  });

  const unchecked = grocery.filter((item) => !item.checked).length;

  const lowRow =
    [...pantry]
      .filter((row) => isLowStock(row, row.item))
      .sort((a, b) => a.quantity - b.quantity)[0] ?? null;

  const weekStart = mondayOf(new Date(`${today}T00:00:00Z`));
  const todayIndex = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) /
      86_400_000,
  );
  const todayEntry =
    meals.find(
      (meal) => meal.week_start === weekStart && meal.day_index === todayIndex,
    ) ?? null;
  const dinnerPlanned = Boolean(
    todayEntry && (todayEntry.recipe_id || todayEntry.note),
  );

  const lowAlreadyListed =
    lowRow !== null &&
    (lowOnList ??
      grocery.some(
        (item) => item.item_id === lowRow.item_id && !item.checked,
      ));

  const cards: Card[] = [];

  if (expiring.length > 0) {
    const count = expiring.length;
    cards.push({
      key: "expiring",
      emoji: "🥑",
      line: `${count} food${count === 1 ? "" : "s"} expire${count === 1 ? "s" : ""} soon`,
      action: (
        <Link href={`/recipes?items=${expiring.map((row) => row.item_id).join(",")}`}>
          Plan a meal using them →
        </Link>
      ),
      tint: "border-amber-200 bg-amber-50 text-amber-900",
    });
  }

  if (unchecked > 0) {
    cards.push({
      key: "shopping",
      emoji: "🛒",
      line: `${unchecked} item${unchecked === 1 ? "" : "s"} on your shopping list`,
      action: <Link href="/grocery">Continue shopping →</Link>,
      tint: "border-emerald-200 bg-emerald-50 text-emerald-900",
    });
  }

  if (lowRow) {
    const out = lowRow.quantity <= 0;
    const listed = lowAlreadyListed;
    async function addToList() {
      if (!lowRow) return;
      setBusy(true);
      const result = await addGroceryItem({
        name: lowRow.item.name,
        itemId: lowRow.item_id,
        categoryId: lowRow.item.category_id,
        quantity: 1,
        unit: lowRow.unit ?? lowRow.item.unit,
        source: "low_stock",
      });
      setBusy(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.data.created) {
        setLowOnList(true);
        toast.success(`${lowRow.item.name} added to your shopping list`);
      } else {
        setLowOnList(true);
        toast.message(`${lowRow.item.name} is already on your list`);
      }
    }
    cards.push({
      key: "low",
      emoji: foodEmoji(lowRow.item.name),
      line: out
        ? `${lowRow.item.name} is out of stock`
        : `${lowRow.item.name} is running low`,
      action: listed ? (
        <Link href="/grocery">View shopping list →</Link>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void addToList()}
          className="disabled:opacity-60"
        >
          {busy ? "Adding…" : "Add to shopping list →"}
        </button>
      ),
      tint: "border-rose-200 bg-rose-50 text-rose-900",
    });
  }

  if (!dinnerPlanned) {
    cards.push({
      key: "dinner",
      emoji: "🍽️",
      line: "Dinner isn't planned",
      action: <Link href={`/plan?week=${weekStart}`}>Pick a meal →</Link>,
      tint: "border-violet-200 bg-violet-50 text-violet-900",
    });
  }

  if (cards.length === 0) {
    cards.push({
      key: "all-good",
      emoji: "🎉",
      line: "All caught up — nothing needs your attention",
      action: (
        <span className="flex flex-wrap gap-x-3">
          <Link href="/inventory/add">Add to Pantry →</Link>
          <Link href="/recipes">Find Recipes →</Link>
        </span>
      ),
      tint: "border-primary/30 bg-primary/5 text-foreground",
    });
  }

  return (
    <section className="flex h-full flex-col rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-extrabold">Smart Actions</h2>
      <div className="flex flex-1 flex-col gap-2.5">
        {cards.map((card) => (
          <div
            key={card.key}
            className={cn(
              "flex flex-1 items-center gap-3 rounded-xl border p-3",
              card.tint,
            )}
          >
            <span className="text-2xl" aria-hidden>
              {card.emoji}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug">{card.line}</p>
              <p className="mt-0.5 text-xs font-semibold">
                <span className="[&_a]:text-primary [&_a:hover]:underline [&_button]:text-primary [&_button:hover]:underline [&_button]:cursor-pointer">
                  {card.action}
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
