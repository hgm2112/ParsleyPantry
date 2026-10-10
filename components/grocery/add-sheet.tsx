"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  addGroceryItem,
  addManyGroceryItems,
} from "@/app/(app)/grocery/actions";
import type { AddGroceryInput } from "@/app/(app)/grocery/actions";
import { parseQuantityText } from "@/lib/stock";
import { groupByItem, type ItemGroup } from "@/lib/batches";
import type { CategoryRow, InventoryEntry } from "@/lib/types";
import type { GroceryRecipe } from "@/components/grocery/grocery-view";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inventory: InventoryEntry[];
  recipes: GroceryRecipe[];
  categories: CategoryRow[];
  onAdded: () => void;
};

export function AddGrocerySheet({
  open,
  onOpenChange,
  inventory,
  recipes,
  categories,
  onAdded,
}: Props) {
  const [search, setSearch] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualQuantity, setManualQuantity] = useState("1");
  const [manualUnit, setManualUnit] = useState("");
  const [manualCategory, setManualCategory] = useState("__none");
  const [busy, setBusy] = useState(false);
  const [recipeBusy, setRecipeBusy] = useState<string | null>(null);

  const filteredInventory = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const groups = groupByItem(inventory).filter((group) => {
      if (!needle) return true;
      return (
        group.item.name.toLowerCase().includes(needle) ||
        (group.item.barcode ?? "").includes(needle)
      );
    });
    return groups.sort((a, b) => a.item.name.localeCompare(b.item.name));
  }, [inventory, search]);

  async function addFromInventory(group: ItemGroup) {
    const result = await addGroceryItem({
      itemId: group.item.canonical_item_id ?? group.item.id,
      name: group.item.name,
      quantity: 1,
      unit: group.item.unit,
      source: "manual",
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.data.created
        ? `${group.item.name} added to list`
        : `${group.item.name} is already on the list`,
    );
    onAdded();
  }

  async function addFromRecipe(recipe: GroceryRecipe) {
    setRecipeBusy(recipe.id);
    const inputs: AddGroceryInput[] = recipe.recipe_ingredients
      .filter((ingredient) => ingredient.on_shopping_list)
      .map((ingredient) => {
        const parsed = parseQuantityText(ingredient.quantity_text);
        return {
          itemId: ingredient.item_id,
          name: ingredient.name,
          quantity: parsed.quantity,
          unit: parsed.unit,
          source: "recipe",
        };
      });

    const result = await addManyGroceryItems(inputs);
    setRecipeBusy(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const { added, skipped } = result.data;
    toast.success(
      added === 0 && skipped > 0
        ? "Everything from that recipe is already on the list"
        : `${added} ingredient${added === 1 ? "" : "s"} from ${recipe.name} added${skipped ? ` · ${skipped} already listed` : ""}`,
    );
    onAdded();
  }

  async function addManual(event: React.FormEvent) {
    event.preventDefault();
    const name = manualName.trim();
    if (!name) return;
    setBusy(true);
    const result = await addGroceryItem({
      name,
      quantity: Number(manualQuantity) || 1,
      unit: manualUnit.trim() || null,
      categoryId: manualCategory === "__none" ? null : manualCategory,
      source: "manual",
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.data.created ? `${name} added` : `${name} is already on the list`,
    );
    setManualName("");
    setManualQuantity("1");
    setManualUnit("");
    onAdded();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto gap-3">
        <SheetHeader>
          <SheetTitle>Add to grocery list</SheetTitle>
          <SheetDescription>
            Pull from pantry stock, a recipe, or type it in.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="inventory" className="px-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="recipe">Recipe</TabsTrigger>
            <TabsTrigger value="manual">Manual</TabsTrigger>
          </TabsList>

          <TabsContent value="inventory" className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search your pantry"
                className="pl-8"
              />
            </div>
            <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
              {filteredInventory.length === 0 ? (
                <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                  No pantry items match.
                </li>
              ) : (
                filteredInventory.map((group) => (
                  <li
                    key={group.item.id}
                    className="flex items-center gap-2 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {group.item.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {group.totalQuantity} left · {group.locations.join(", ")}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void addFromInventory(group)}
                    >
                      <Plus /> Add
                    </Button>
                  </li>
                ))
              )}
            </ul>
          </TabsContent>

          <TabsContent value="recipe" className="space-y-2">
            <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
              {recipes.length === 0 ? (
                <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                  No recipes yet — create one first.
                </li>
              ) : (
                recipes.map((recipe) => (
                  <li
                    key={recipe.id}
                    className="flex items-center gap-2 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {recipe.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {recipe.recipe_ingredients.length} ingredients
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={recipeBusy === recipe.id}
                      onClick={() => void addFromRecipe(recipe)}
                    >
                      {recipeBusy === recipe.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Plus />
                      )}
                      Add all
                    </Button>
                  </li>
                ))
              )}
            </ul>
          </TabsContent>

          <TabsContent value="manual" className="space-y-3">
            <form onSubmit={addManual} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="manual-name">Item</Label>
                <Input
                  id="manual-name"
                  value={manualName}
                  onChange={(event) => setManualName(event.target.value)}
                  placeholder="Sourdough bread"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="manual-qty">Quantity</Label>
                  <Input
                    id="manual-qty"
                    type="number"
                    min="0"
                    step="any"
                    value={manualQuantity}
                    onChange={(event) => setManualQuantity(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-unit">Unit</Label>
                  <Input
                    id="manual-unit"
                    value={manualUnit}
                    onChange={(event) => setManualUnit(event.target.value)}
                    placeholder="ea…"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={manualCategory}
                  items={[
                    { value: "__none", label: "None" },
                    ...categories.map((category) => ({
                      value: category.id,
                      label: category.name,
                    })),
                  ]}
                  onValueChange={(value) => setManualCategory(value ?? "__none")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Plus />}
                Add to list
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
