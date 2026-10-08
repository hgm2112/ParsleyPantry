"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { addRecipeToGrocery } from "@/app/(app)/recipes/actions";
import type { RecipeIngredientRow } from "@/lib/types";

/**
 * Pick which ingredients go onto the shopping list. Selection initializes
 * from each row's remembered `on_shopping_list` and is persisted on confirm.
 * The parent mounts this only while open, so state re-inits every time.
 */
export function ToGrocerySheet({
  onOpenChange,
  recipeId,
  ingredients,
}: {
  onOpenChange: (open: boolean) => void;
  recipeId: string;
  ingredients: RecipeIngredientRow[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        ingredients
          .filter((ingredient) => ingredient.on_shopping_list)
          .map((ingredient) => ingredient.id),
      ),
  );
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    setBusy(true);
    const result = await addRecipeToGrocery(recipeId, [...selected]);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const { added, skipped } = result.data;
    toast.success(
      added === 0 && skipped > 0
        ? "All of it is already on the list"
        : `${added} ingredient${added === 1 ? "" : "s"} added to the list${skipped ? ` · ${skipped} already there` : ""}`,
    );
    router.refresh();
    onOpenChange(false);
  }

  if (ingredients.length === 0) {
    return (
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85vh] gap-3 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add to grocery list</SheetTitle>
            <SheetDescription>
              This recipe has no ingredients yet — add them below and save
              first.
            </SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] gap-3 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add to grocery list</SheetTitle>
          <SheetDescription>
            Pick what goes to the store — spices and small amounts can stay
            off. Your choice is remembered for this recipe.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              {selected.size} of {ingredients.length} selected
            </span>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSelected(new Set(ingredients.map((entry) => entry.id)))
                }
              >
                All
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                None
              </Button>
            </div>
          </div>

          <ul className="space-y-1.5">
            {ingredients.map((ingredient) => (
              <li key={ingredient.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 py-2 transition-colors hover:border-primary/50">
                  <Checkbox
                    checked={selected.has(ingredient.id)}
                    onCheckedChange={() => toggle(ingredient.id)}
                    aria-label={`Add ${ingredient.name} to grocery list`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {ingredient.name}
                    {ingredient.optional ? (
                      <span className="ml-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
                        opt
                      </span>
                    ) : null}
                  </span>
                  {ingredient.quantity_text ? (
                    <span className="max-w-28 shrink-0 truncate text-xs text-muted-foreground">
                      {ingredient.quantity_text}
                    </span>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
        </div>

        <SheetFooter className="border-t">
          <Button
            type="button"
            onClick={() => void send()}
            disabled={busy || selected.size === 0}
            className="w-full sm:w-auto"
          >
            {busy ? (
              <Loader2 className="animate-spin" />
            ) : (
              <ShoppingCart />
            )}
            Add {selected.size} to grocery list
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
