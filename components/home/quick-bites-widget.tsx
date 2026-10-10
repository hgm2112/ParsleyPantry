"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { parseQuantityText, toOunces } from "@/lib/stock";

type RecipeOption = {
  id: string;
  name: string;
  time: number;
  tags: string[];
};

type RecipeIngredient = {
  recipe_id: string;
  item_id: string;
  name: string;
  quantity_text: string;
  optional: boolean;
};

type InventoryEntry = {
  item_id: string;
  quantity: number;
  unit: string | null;
  item: {
    canonical_item_id: string | null;
    id: string;
  };
};

export function QuickBitesWidget({
  recipes,
  recipeIngredients,
  pantry,
}: {
  recipes: RecipeOption[];
  recipeIngredients: RecipeIngredient[];
  pantry: InventoryEntry[];
}) {
  const quickBitesRecipes = useMemo(() => {
    return recipes.filter((r) =>
      r.tags.some((t) => t.toLowerCase() === "quick bites"),
    );
  }, [recipes]);

  if (quickBitesRecipes.length === 0) {
    return null;
  }

  const pantryRoots = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of pantry) {
      map.set(row.item_id, row.item.canonical_item_id ?? row.item.id);
    }
    return map;
  }, [pantry]);

  const rootOf = (id: string) => {
    let current = id;
    for (let hop = 0; hop < 8; hop += 1) {
      const next = pantryRoots.get(current);
      if (!next || next === current) break;
      current = next;
    }
    return current;
  };

  const stockByItem: Record<string, number> = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of pantry) {
      const key = rootOf(row.item_id);
      map[key] = (map[key] ?? 0) + row.quantity;
    }
    return map;
  }, [pantry]);

  const stockUnitByItem: Record<string, string | null> = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const row of pantry) {
      const key = rootOf(row.item_id);
      if (map[key] == null) {
        map[key] = row.unit;
      } else if (map[key] !== row.unit) {
        map[key] = null;
      }
    }
    return map;
  }, [pantry]);

  const availableRecipes = useMemo(() => {
    const available: RecipeOption[] = [];

    for (const recipe of quickBitesRecipes) {
      const recipeIngs = recipeIngredients.filter(
        (ig) => ig.recipe_id === recipe.id,
      );

      if (recipeIngs.length === 0) continue;

      let allSufficient = true;
      for (const ig of recipeIngs) {
        if (ig.optional) continue;

        const effId = rootOf(ig.item_id);
        if (effId == null) {
          allSufficient = false;
          break;
        }

        const p = parseQuantityText(ig.quantity_text);
        const needed = toOunces(p.quantity, p.unit) ?? p.quantity;

        const haveRaw = stockByItem[effId] || 0;
        const haveUnit = stockUnitByItem[effId];
        const have = toOunces(haveRaw, haveUnit) ?? haveRaw;

        if (have < needed) {
          allSufficient = false;
          break;
        }
      }

      if (allSufficient) {
        available.push(recipe);
      }
    }

    return available;
  }, [quickBitesRecipes, recipeIngredients, pantry, rootOf, stockByItem, stockUnitByItem]);

  if (availableRecipes.length === 0) {
    return (
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-extrabold">Quick Bites</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          No quick bites recipes can be made right now — adjust your inventory
          or recipe tags.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Clock className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-extrabold">Quick Bites</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {availableRecipes.map((recipe) => (
          <div
            key={recipe.id}
            className="rounded-border bg-card p-3 hover:bg-card/80 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{recipe.name}</span>
              <span className="text-xs text-muted-foreground">
                {recipe.time > 0 ? `${recipe.time} min` : ""}
              </span>
            </div>
            <Link
              href={`/recipes?id=${recipe.id}`}
              className="text-xs text-primary hover:underline mt-1 block"
            >
              Open recipe
            </Link>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Link
          href="/recipes"
          className="text-sm font-semibold text-primary hover:underline"
        >
          View all →
        </Link>
      </div>
    </section>
  );
}