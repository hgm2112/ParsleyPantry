"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  addRecipeToGrocery,
  createRecipe,
  deleteRecipe,
  updateRecipe,
} from "@/app/(app)/recipes/actions";
import type { RecipeFormInput } from "@/app/(app)/recipes/actions";
import { ToGrocerySheet } from "@/components/recipes/to-grocery-sheet";
import { parseQuantityText, splitNameAndQuantity, toOunces, trimDecimal } from "@/lib/stock";
import type { RecipeIngredientRow, RecipeRow } from "@/lib/types";

type IngredientDraft = {
  name: string;
  quantity_text: string;
  optional: boolean;
  on_shopping_list: boolean;
  item_id?: string | null;
};

type Props = {
  recipe: RecipeRow | null;
  ingredients: RecipeIngredientRow[];
  stockByItem?: Record<string, number>;
  stockUnitByItem?: Record<string, string | null>;
  nameToItemId?: Record<string, string>;
};

export function RecipeEditor({ recipe, ingredients, stockByItem, stockUnitByItem, nameToItemId }: Props) {
  const router = useRouter();
  const isEdit = recipe !== null;

  const [name, setName] = useState(recipe?.name ?? "");
  const [description, setDescription] = useState(recipe?.description ?? "");
  const [prepTime, setPrepTime] = useState(String(recipe?.prep_time ?? 0));
  const [cookTime, setCookTime] = useState(String(recipe?.cook_time ?? 0));
  const [yields, setYields] = useState(String(recipe?.yields ?? 1));
  const [source, setSource] = useState(recipe?.source ?? "");
  const [tagsText, setTagsText] = useState((recipe?.tags ?? []).join(", "));
  const [rows, setRows] = useState<IngredientDraft[]>(
    ingredients.map((ingredient) => ({
      name: ingredient.name,
      quantity_text: ingredient.quantity_text,
      optional: ingredient.optional,
      on_shopping_list: ingredient.on_shopping_list,
      item_id: ingredient.item_id,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [groceryOpen, setGroceryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function updateRow(index: number, patch: Partial<IngredientDraft>) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  }

  function buildInput(): RecipeFormInput {
    return {
      name: name.trim(),
      description: description.trim(),
      prep_time: Number(prepTime) || 0,
      cook_time: Number(cookTime) || 0,
      yields: Number(yields) || 1,
      source: source.trim() || null,
      tags: tagsText
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      ingredients: rows
        .filter((row) => row.name.trim())
        .map((row) => ({
          name: row.name.trim(),
          quantity_text: row.quantity_text.trim(),
          optional: row.optional,
          on_shopping_list: row.on_shopping_list,
        })),
    };
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Give the recipe a name");
      return;
    }
    setBusy(true);
    const input = buildInput();

    if (recipe) {
      const result = await updateRecipe(recipe.id, input);
      setBusy(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Recipe saved");
      router.refresh();
      return;
    }

    const result = await createRecipe(input);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${input.name} created`);
    router.push(`/recipes/${result.data.id}`);
    router.refresh();
  }

  async function remove() {
    if (!recipe) return;
    const result = await deleteRecipe(recipe.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Recipe deleted");
    router.push("/recipes");
    router.refresh();
  }

  async function handleAddMissing() {
    if (!recipe || !stockByItem) return;
    const missingIds = ingredients
      .filter((ingredient) => {
        if (!ingredient.item_id) return false;
        const p = parseQuantityText(ingredient.quantity_text);
        const needed = toOunces(p.quantity, p.unit) ?? p.quantity;
        const haveRaw = stockByItem[ingredient.item_id] || 0;
        const haveUnit = stockUnitByItem?.[ingredient.item_id] ?? null;
        const have = toOunces(haveRaw, haveUnit) ?? haveRaw;
        return have < needed;
      })
      .map((ingredient) => ingredient.id);
    if (missingIds.length === 0) {
      toast.success("You have everything needed in your pantry");
      return;
    }
    setBusy(true);
    const result = await addRecipeToGrocery(recipe.id, missingIds);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const { added, skipped } = result.data;
    toast.success(
      added === 0 && skipped > 0
        ? "All missing items are already on the list"
        : `${added} missing ingredient${added === 1 ? "" : "s"} added to the list${skipped ? ` · ${skipped} already there` : ""}`,
    );
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          render={<Link href="/recipes" />}
          aria-label="Back to recipes"
        >
          <ArrowLeft />
        </Button>
        <div className="flex items-center gap-2">
          {isEdit ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleAddMissing()}
                disabled={busy}
              >
                <ShoppingCart />
                Add only the missing ones
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setGroceryOpen(true)}
              >
                <ShoppingCart />
                Select for grocery list
              </Button>
            </>
          ) : null}
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {isEdit ? "Save" : "Create recipe"}
          </Button>
        </div>
      </div>

      <section className="space-y-3 rounded-xl border p-4">
        <div className="space-y-2">
          <Label htmlFor="recipe-name">Name</Label>
          <Input
            id="recipe-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Weeknight chili"
            autoFocus={!isEdit}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="recipe-description">Notes</Label>
          <Textarea
            id="recipe-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Steps, tweaks, where the recipe came from…"
            rows={4}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="recipe-prep">Prep (min)</Label>
            <Input
              id="recipe-prep"
              type="number"
              min="0"
              value={prepTime}
              onChange={(event) => setPrepTime(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recipe-cook">Cook (min)</Label>
            <Input
              id="recipe-cook"
              type="number"
              min="0"
              value={cookTime}
              onChange={(event) => setCookTime(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recipe-yields">Yields</Label>
            <Input
              id="recipe-yields"
              type="number"
              min="1"
              value={yields}
              onChange={(event) => setYields(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recipe-source">Source</Label>
            <Input
              id="recipe-source"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder="Will"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="recipe-tags">Tags</Label>
          <Input
            id="recipe-tags"
            value={tagsText}
            onChange={(event) => setTagsText(event.target.value)}
            placeholder="quick, vegetarian (comma separated)"
          />
        </div>
      </section>

      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold">Ingredients</h2>
          <span className="text-xs text-muted-foreground">
            {rows.filter((row) => row.name.trim()).length} listed
            {stockByItem && (() => {
              let covered = 0;
              let total = 0;
              for (const row of rows) {
                if (row.name.trim()) {
                  const key = row.name.trim().toLowerCase();
                  const effId = nameToItemId?.[key] ?? row.item_id ?? null;
                  if (effId) {
                    total += 1;
                    const p = parseQuantityText(row.quantity_text);
                    const needed = toOunces(p.quantity, p.unit) ?? p.quantity;
                    const haveRaw = stockByItem[effId] || 0;
                    const haveUnit = stockUnitByItem?.[effId] ?? null;
                    const have = toOunces(haveRaw, haveUnit) ?? haveRaw;
                    if (have >= needed) covered += 1;
                  }
                }
              }
              return total > 0 ? ` · ✓ ${covered}/${total}` : "";
            })()}
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          Enter amounts like &ldquo;2 cups&rdquo; or &ldquo;6 oz&rdquo; — the
          number and unit carry over to the grocery list.
        </p>

        <div className="space-y-2">
          {rows.map((row, index) => (
            <div
              key={index}
              className="grid grid-cols-[1fr_5rem_auto_auto_auto] items-center gap-2"
            >
              <Input
                value={row.name}
                onChange={(event) => updateRow(index, { name: event.target.value })}
                placeholder="Black beans"
                aria-label={`Ingredient ${index + 1} name`}
              />
              <Input
                value={row.quantity_text}
                onChange={(event) =>
                  updateRow(index, { quantity_text: event.target.value })
                }
                placeholder="2 cans"
                aria-label={`Ingredient ${index + 1} amount`}
              />
              {stockByItem ? (() => {
                const { name: cleanName } = splitNameAndQuantity(row.name);
                const key = cleanName.trim().toLowerCase();
                const effId = nameToItemId?.[key] ?? row.item_id ?? null;
                if (effId) {
                  const p = parseQuantityText(row.quantity_text);
                  const neededRaw = p.quantity;
                  const needed = toOunces(neededRaw, p.unit) ?? neededRaw;
                  const haveRaw = stockByItem[effId] || 0;
                  const haveUnit = stockUnitByItem?.[effId] ?? null;
                  const have = toOunces(haveRaw, haveUnit) ?? haveRaw;
                  const sufficient = have >= needed;
                  const displayHave = trimDecimal(haveRaw);
                  return (
                    <span
                      className={`text-xs ${sufficient ? "text-emerald-600" : "text-muted-foreground"}`}
                      title={sufficient ? `Have ${haveRaw}` : `Have ${haveRaw} (need ${row.quantity_text})`}
                    >
                      {sufficient ? "✓ " : ""}{displayHave}
                    </span>
                  );
                }
                return null;
              })() : null}
              <label
                className="flex cursor-pointer items-center gap-1.5 px-1 text-xs text-muted-foreground"
                title="Optional ingredient"
              >
                <Checkbox
                  checked={row.optional}
                  onCheckedChange={(checked) => {
                    const optional = checked === true;
                    updateRow(index, {
                      optional,
                      on_shopping_list: !optional,
                    });
                  }}
                  aria-label={`Ingredient ${index + 1} optional`}
                />
                <span className="hidden sm:inline">opt</span>
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-destructive"
                onClick={() =>
                  setRows((current) => current.filter((_, i) => i !== index))
                }
                aria-label={`Remove ingredient ${index + 1}`}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setRows((current) => [
              ...current,
              { name: "", quantity_text: "", optional: false, on_shopping_list: true, item_id: null },
            ])
          }
        >
          <Plus /> Add ingredient
        </Button>
      </section>

      <div className="flex items-center justify-between gap-2">
        {isEdit ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 /> Delete
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {isEdit ? "Save changes" : "Create recipe"}
        </Button>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${recipe?.name ?? "recipe"}?`}
        description="Its ingredients go with it. Anything already on the grocery list stays."
        confirmLabel="Delete recipe"
        destructive
        onConfirm={remove}
      />

      {groceryOpen && recipe ? (
        <ToGrocerySheet
          onOpenChange={(open) => {
            if (!open) setGroceryOpen(false);
          }}
          recipeId={recipe.id}
          ingredients={ingredients}
        />
      ) : null}
    </form>
  );
}
