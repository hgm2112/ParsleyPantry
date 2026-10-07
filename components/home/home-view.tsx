"use client";

import { Sparkles } from "lucide-react";
import { ParsleyMark, TAGLINE } from "@/components/brand";
import { WeekMeals } from "@/components/home/week-meals";
import { PantryPreview } from "@/components/home/pantry-preview";
import {
  ShoppingWidget,
  type ShoppingPreviewItem,
} from "@/components/home/shopping-widget";
import { SmartActions } from "@/components/home/smart-actions";
import { PantryInsights } from "@/components/home/pantry-insights";
import { MiniCalendar } from "@/components/home/mini-calendar";
import type {
  CategoryRow,
  HomeMeal,
  HouseholdSettingsRow,
  InventoryEntry,
  StoreAisleRow,
  StoreRow,
} from "@/lib/types";

function PromoCard() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h2 className="text-sm font-extrabold">Meal planning made simple</h2>
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
  stores,
  aisles,
  assignments,
  rememberedAisles,
  settings,
}: {
  meals: HomeMeal[];
  pantry: InventoryEntry[];
  categories: CategoryRow[];
  grocery: ShoppingPreviewItem[];
  stores: StoreRow[];
  aisles: StoreAisleRow[];
  assignments: { grocery_item_id: string; store_id: string; aisle_id: string }[];
  rememberedAisles: { item_id: string; store_id: string; aisle_id: string }[];
  settings: HouseholdSettingsRow | null;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="hidden lg:col-span-2 lg:col-start-1 lg:row-start-1 lg:block">
        <WeekMeals meals={meals} />
      </div>

      <div className="lg:col-start-3 lg:row-start-1">
        <SmartActions pantry={pantry} grocery={grocery} meals={meals} />
      </div>

      <div className="lg:col-start-1 lg:row-start-2">
        <PantryPreview rows={pantry} categories={categories} />
      </div>

      <div className="lg:col-start-2 lg:row-start-2">
        <ShoppingWidget
          items={grocery}
          categories={categories}
          stores={stores}
          aisles={aisles}
          assignments={assignments}
          rememberedAisles={rememberedAisles}
          settings={settings}
        />
      </div>

      <div className="space-y-4 lg:col-start-3 lg:row-start-2">
        <PantryInsights rows={pantry} />
        <MiniCalendar meals={meals} />
        <PromoCard />
      </div>
    </div>
  );
}
