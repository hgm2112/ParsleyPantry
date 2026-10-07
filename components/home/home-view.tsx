"use client";

import { Sparkles } from "lucide-react";
import { ParsleyMark, TAGLINE } from "@/components/brand";
import { WeekMeals, type HomeMeal } from "@/components/home/week-meals";
import { PantryPreview } from "@/components/home/pantry-preview";
import {
  ShoppingWidget,
  type ShoppingPreviewItem,
} from "@/components/home/shopping-widget";
import { QuickActions } from "@/components/home/quick-actions";
import { Upcoming } from "@/components/home/upcoming";
import { MiniCalendar } from "@/components/home/mini-calendar";
import type { CategoryRow, InventoryEntry } from "@/lib/types";

function PromoCard() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h2 className="text-sm font-bold">Meal planning made simple</h2>
          <p className="mt-1 text-sm text-muted-foreground">{TAGLINE}</p>
        </div>
      </div>
      <ParsleyMark className="pointer-events-none absolute -right-3 -bottom-3 h-20 w-24 opacity-30" />
    </section>
  );
}

export function HomeView({
  meals,
  pantry,
  categories,
  grocery,
}: {
  meals: HomeMeal[];
  pantry: InventoryEntry[];
  categories: CategoryRow[];
  grocery: ShoppingPreviewItem[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 lg:col-start-1 lg:row-start-1">
        <WeekMeals meals={meals} />
      </div>

      <div className="lg:col-start-3 lg:row-start-1">
        <QuickActions />
      </div>

      <div className="lg:col-start-1 lg:row-start-2">
        <PantryPreview rows={pantry} categories={categories} />
      </div>

      <div className="lg:col-start-2 lg:row-start-2">
        <ShoppingWidget items={grocery} categories={categories} />
      </div>

      <div className="space-y-4 lg:col-start-3 lg:row-start-2">
        <Upcoming meals={meals} pantry={pantry} />
        <MiniCalendar meals={meals} />
        <PromoCard />
      </div>
    </div>
  );
}
