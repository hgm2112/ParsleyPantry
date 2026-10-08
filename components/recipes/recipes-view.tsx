"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Clock, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { foodEmoji, tileGradient } from "@/lib/tiles";
import { cn } from "@/lib/utils";
import type { RecipeRow } from "@/lib/types";

export function RecipesView({
  recipes,
  ingredientCounts,
  itemIdsByRecipe,
  onlyItemIds,
  pantryStatus,
}: {
  recipes: RecipeRow[];
  ingredientCounts: Record<string, number>;
  itemIdsByRecipe?: Record<string, string[]>;
  onlyItemIds?: string[];
  pantryStatus?: Record<string, { covered: number; total: number }>;
}) {
  const [query, setQuery] = useState("");

  const itemFilter = onlyItemIds ?? [];
  const filtered = useMemo(() => {
    let list = recipes;
    if (onlyItemIds && onlyItemIds.length > 0) {
      const wanted = new Set(onlyItemIds);
      list = list.filter((recipe) =>
        (itemIdsByRecipe?.[recipe.id] ?? []).some((itemId) => wanted.has(itemId)),
      );
    }
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (recipe) =>
        recipe.name.toLowerCase().includes(needle) ||
        recipe.tags.some((tag) => tag.toLowerCase().includes(needle)),
    );
  }, [recipes, query, onlyItemIds, itemIdsByRecipe]);

  return (
    <div className="space-y-3">
      {itemFilter.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-semibold">
            Showing recipes that use your expiring foods.
          </span>
          <Link href="/recipes" className="font-semibold text-primary hover:underline">
            Show all →
          </Link>
        </div>
      ) : null}

      {recipes.length > 6 ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search recipes or tags"
            className="pl-8"
          />
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
          <BookOpen className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-semibold">
            {recipes.length === 0
              ? "No recipes yet"
              : itemFilter.length > 0
                ? "None of your recipes use those items yet"
                : "Nothing matches"}
          </p>
          {recipes.length === 0 ? (
            <p className="max-w-sm text-xs text-muted-foreground">
              Import from KitchenOwl (Settings → Import) or create one from
              scratch.
            </p>
          ) : itemFilter.length > 0 ? (
            <Link href="/recipes" className="text-sm font-semibold text-primary hover:underline">
              Show all recipes →
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((recipe) => {
            const count = ingredientCounts[recipe.id] ?? 0;
            return (
              <li key={recipe.id}>
                <Link
                  href={`/recipes/${recipe.id}`}
                  className="flex h-full flex-col gap-2 overflow-hidden rounded-xl border bg-card shadow-sm transition-colors hover:border-primary/50 hover:bg-accent/40"
                >
                  <span
                    className={cn(
                      "flex h-20 shrink-0 items-center justify-center bg-gradient-to-br text-3xl",
                      tileGradient(recipe.name),
                    )}
                    aria-hidden
                  >
                    {foodEmoji(recipe.name, recipe.tags)}
                  </span>
                  <span className="line-clamp-2 px-4 text-sm font-extrabold">
                    {recipe.name}
                  </span>
                  <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-4 text-xs text-muted-foreground">
                    {recipe.time > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {recipe.time}m
                      </span>
                    ) : null}
                    {recipe.yields > 1 ? (
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {recipe.yields}
                      </span>
                    ) : null}
                    <span>{count} ingredients</span>
                    {pantryStatus?.[recipe.id] && pantryStatus[recipe.id].total > 0 ? (
                      <span>✓ {pantryStatus[recipe.id].covered}/{pantryStatus[recipe.id].total}</span>
                    ) : null}
                  </div>
                  {recipe.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1 px-4 pb-4">
                      {recipe.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
