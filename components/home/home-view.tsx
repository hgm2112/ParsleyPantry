"use client";

import Link from "next/link";
import { BookOpen, Clock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { foodEmoji, tileGradient } from "@/lib/tiles";
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
import type { CategoryRow, InventoryEntry, RecipeRow } from "@/lib/types";

function PopularRecipes({ recipes }: { recipes: RecipeRow[] }) {
  if (recipes.length === 0) return null;
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">Popular Recipes</h2>
        <Link
          href="/recipes"
          className="ml-auto text-sm font-medium text-primary hover:underline"
        >
          View all →
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {recipes.map((recipe) => (
          <li key={recipe.id}>
            <Link
              href={`/recipes/${recipe.id}`}
              className="group block overflow-hidden rounded-xl border bg-background transition-colors hover:border-primary/50 hover:shadow-sm"
            >
              <div
                className={cn(
                  "flex h-20 items-center justify-center bg-gradient-to-br text-3xl",
                  tileGradient(recipe.name),
                )}
                aria-hidden
              >
                {foodEmoji(recipe.name, recipe.tags)}
              </div>
              <div className="p-2.5">
                <p className="line-clamp-2 text-xs font-medium leading-snug group-hover:text-primary">
                  {recipe.name}
                </p>
                {recipe.time > 0 ? (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {recipe.time} min
                  </p>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

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
  recipes,
}: {
  meals: HomeMeal[];
  pantry: InventoryEntry[];
  categories: CategoryRow[];
  grocery: ShoppingPreviewItem[];
  recipes: RecipeRow[];
}) {
  return (
    <div className="space-y-4">
      <WeekMeals meals={meals} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <PantryPreview rows={pantry} categories={categories} />
          <PopularRecipes recipes={recipes} />
        </div>
        <div className="space-y-4">
          <QuickActions />
          <Upcoming meals={meals} pantry={pantry} />
          <ShoppingWidget items={grocery} categories={categories} />
          <MiniCalendar meals={meals} />
          <PromoCard />
        </div>
      </div>
    </div>
  );
}
