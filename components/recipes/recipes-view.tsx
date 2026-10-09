"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { tileGradient } from "@/lib/tiles";
import { cn } from "@/lib/utils";
import type { RecipeRow } from "@/lib/types";

export function RecipesView({
  recipes,
  itemIdsByRecipe,
  onlyItemIds,
  pantryStatus,
}: {
  recipes: RecipeRow[];
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
        <div className="overflow-hidden rounded-xl border">
          <div className="grid grid-cols-[minmax(0,1fr)_60px] sm:grid-cols-[minmax(0,1fr)_60px_50px_70px] bg-muted/50 px-3 py-1 text-[10px] font-semibold text-muted-foreground border-b">
            <div>Recipes</div>
            <div className="text-center hidden sm:block">Time</div>
            <div className="text-center hidden sm:block">Size</div>
            <div className="text-center">Have?</div>
          </div>
          {filtered.map((recipe) => {
            const ps = pantryStatus?.[recipe.id];
            const have = ps && ps.total > 0 ? `${ps.covered}/${ps.total}` : "";
            const grad = tileGradient(recipe.name);
            return (
              <Link
                key={recipe.id}
                href={`/recipes/${recipe.id}`}
                className="block border-b border-border last:border-b-0 hover:ring-2 hover:ring-inset hover:ring-foreground/20 transition-all"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_60px] sm:grid-cols-[minmax(0,1fr)_60px_50px_70px] items-center px-3 py-1.5 text-sm">
                  <div
                    className={cn(
                      "flex items-center gap-2 min-w-0 -ml-3 pl-3 relative",
                    )}
                  >
                    <div
                      className={cn(
                        "absolute inset-0 bg-gradient-to-r pointer-events-none",
                        grad.split(" ")[0],
                        "to-transparent opacity-50",
                      )}
                    />
                    <span className="font-semibold truncate">{recipe.name}</span>
                    {recipe.tags.length > 0 && (
                      <span className="flex gap-1 text-[9px] text-muted-foreground shrink-0">
                        {recipe.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="rounded-full border-2 bg-card px-1.5 py-0.5 border-border">
                            {tag}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  <div className="text-center tabular-nums text-muted-foreground hidden sm:block">
                    {recipe.time > 0 ? `${recipe.time}m` : ""}
                  </div>
                  <div className="text-center tabular-nums hidden sm:block">
                    {recipe.yields > 1 ? recipe.yields : ""}
                  </div>
                  <div className="text-center tabular-nums font-medium">{have}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
