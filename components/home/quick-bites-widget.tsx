"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ChefHat, Clock } from "lucide-react";
import { CookRecipeDialog } from "@/components/home/cook-recipe-dialog";
import {
  addNeed,
  addStockToPool,
  emptyDemand,
  emptyPool,
  pantryNeed,
  poolCovers,
  type PantryDemand,
  type PantryPool,
} from "@/lib/meal-summary";

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
  const [cookTarget, setCookTarget] = useState<RecipeOption | null>(null);

  const quickBitesRecipes = useMemo(() => {
    return recipes.filter((r) =>
      r.tags.some((t) => t.toLowerCase() === "quick bites"),
    );
  }, [recipes]);

  const pantryRoots = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of pantry) {
      map.set(row.item_id, row.item.canonical_item_id ?? row.item.id);
    }
    return map;
  }, [pantry]);

  const rootOf = useCallback(
    (id: string) => {
      let current = id;
      for (let hop = 0; hop < 8; hop += 1) {
        const next = pantryRoots.get(current);
        if (!next || next === current) break;
        current = next;
      }
      return current;
    },
    [pantryRoots],
  );

  const stockPools = useMemo(() => {
    const map = new Map<string, PantryPool>();
    for (const row of pantry) {
      const key = rootOf(row.item_id);
      const pool = map.get(key) ?? emptyPool();
      addStockToPool(pool, row.quantity, row.unit);
      map.set(key, pool);
    }
    return map;
  }, [pantry, rootOf]);

  const availableRecipes = useMemo(() => {
    const available: RecipeOption[] = [];

    for (const recipe of quickBitesRecipes) {
      const recipeIngs = recipeIngredients.filter(
        (ig) => ig.recipe_id === recipe.id,
      );

      if (recipeIngs.length === 0) continue;

      // Same coverage rule as /plan: weights in ounces with container sizes
      // expanded, everything else in container counts. Count needs fall back
      // to covered on any weight stock (symmetric to weight needs).
      const demandByRoot = new Map<string, PantryDemand>();
      let matched = true;
      for (const ig of recipeIngs) {
        if (ig.optional) continue;
        const rootId = rootOf(ig.item_id);
        if (rootId == null) {
          matched = false;
          break;
        }
        const demand = demandByRoot.get(rootId) ?? emptyDemand();
        addNeed(demand, pantryNeed(ig.quantity_text));
        demandByRoot.set(rootId, demand);
      }

      const allSufficient =
        matched &&
        Array.from(demandByRoot.entries()).every(([rootId, demand]) =>
          poolCovers(stockPools.get(rootId), demand),
        );

      if (allSufficient) {
        available.push(recipe);
      }
    }

    return available;
  }, [quickBitesRecipes, recipeIngredients, rootOf, stockPools]);

  if (quickBitesRecipes.length === 0) {
    return null;
  }

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
        <Link
          href="/recipes"
          className="ml-auto text-sm font-semibold text-primary hover:underline"
        >
          View all →
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-2 gap-4">
        {availableRecipes.map((recipe) => (
          <button
            key={recipe.id}
            type="button"
            onClick={() => setCookTarget(recipe)}
            title="Deduct this recipe's ingredients from your pantry"
            className="group block w-full rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary/50 hover:shadow-sm"
          >
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold group-hover:text-primary">
                {recipe.name}
              </p>
              {recipe.time > 0 && (
                <span className="mt-0.5 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold uppercase text-primary">
                  {recipe.time}m
                </span>
              )}
              <ChefHat className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
          </button>
        ))}
      </div>

      {cookTarget ? (
        <CookRecipeDialog
          key={cookTarget.id}
          recipeId={cookTarget.id}
          recipeName={cookTarget.name}
          onOpenChange={(open) => {
            if (!open) setCookTarget(null);
          }}
        />
      ) : null}
    </section>
  );
}