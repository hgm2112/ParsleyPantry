"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  ClipboardPaste,
  ExternalLink,
  Loader2,
  Plus,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  addRecipeToGrocery,
  createRecipe,
  deleteRecipe,
  updateRecipe,
} from "@/app/(app)/recipes/actions";
import type { RecipeFormInput } from "@/app/(app)/recipes/actions";
import { ToGrocerySheet } from "@/components/recipes/to-grocery-sheet";
import { externalHttpUrl } from "@/lib/external-url";
import { splitNameAndQuantity, trimDecimal } from "@/lib/stock";
import { cn } from "@/lib/utils";
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
  nameToItemId?: Record<string, string>;
  /** item id → canonical root id (stock pools are root-keyed). */
  itemRoots?: Record<string, string>;
  /** If set (and starts with /), save/delete navigates back to it using router.back() when possible. */
  returnTo?: string;
};

/** Words that read as a unit when they follow a pasted amount. */
const UNIT_WORDS = new Set([
  "bag",
  "bags",
  "bottle",
  "bottles",
  "box",
  "boxes",
  "bunch",
  "bunches",
  "can",
  "cans",
  "clove",
  "cloves",
  "container",
  "containers",
  "cup",
  "cups",
  "dash",
  "dashes",
  "ear",
  "ears",
  "fillet",
  "fillets",
  "g",
  "gallon",
  "gallons",
  "gram",
  "grams",
  "handful",
  "handfuls",
  "head",
  "heads",
  "jar",
  "jars",
  "kg",
  "l",
  "lb",
  "lbs",
  "liter",
  "liters",
  "ml",
  "ounce",
  "ounces",
  "oz",
  "package",
  "packages",
  "packet",
  "packets",
  "piece",
  "pieces",
  "pint",
  "pints",
  "pkg",
  "pound",
  "pounds",
  "quart",
  "quarts",
  "scoop",
  "scoops",
  "sheet",
  "sheets",
  "slice",
  "slices",
  "sprig",
  "sprigs",
  "stalk",
  "stalks",
  "stick",
  "sticks",
  "strip",
  "strips",
  "tablespoon",
  "tablespoons",
  "teaspoon",
  "teaspoons",
  "tbsp",
  "tsp",
]);

/**
 * One pasted line → an ingredient row. A leading number (optionally followed
 * by a unit word) becomes the amount; everything else becomes the name.
 * Lines without a leading number stay name-only.
 */
function parsePastedLine(
  raw: string,
): { name: string; quantity_text: string } | null {
  const clean = raw.replace(/^\s*[-*•·]\s*/, "").trim();
  if (!clean) return null;

  const amountMatch = clean.match(
    /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?)\s+(.+)$/,
  );
  if (!amountMatch) return { name: clean, quantity_text: "" };

  const amount = amountMatch[1];
  let rest = amountMatch[2].trim();

  let unit = "";
  const unitMatch = rest.match(/^([A-Za-z]+)\.?\s+(.+)$/);
  if (unitMatch && UNIT_WORDS.has(unitMatch[1].toLowerCase())) {
    unit = unitMatch[1];
    rest = unitMatch[2].trim();
  }

  rest = rest.replace(/^of\s+/i, "").trim();
  if (!rest) return { name: clean, quantity_text: "" };

  return {
    name: rest,
    quantity_text: unit ? `${amount} ${unit}` : amount,
  };
}

type PantryTone = "pantry" | "missing" | "optional" | "unknown";

const DESKTOP_QUERY = "(min-width: 640px)";

function subscribeDesktop(callback: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getDesktopSnapshot() {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

function getDesktopServerSnapshot() {
  return false;
}

/** Live `sm` breakpoint match without a state-setting effect. */
function useIsDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    getDesktopSnapshot,
    getDesktopServerSnapshot,
  );
}

function PantryChip({
  tone,
  have,
  className,
}: {
  tone: PantryTone;
  have: number;
  className?: string;
}) {
  if (tone === "unknown") return null;
  const label =
    tone === "pantry"
      ? `In pantry · ${trimDecimal(have)}`
      : tone === "optional"
        ? "Optional"
        : "Need to buy";
  return (
    <span
      className={cn(
        "shrink-0 justify-self-start rounded-md px-2 py-1 text-[11px] font-semibold whitespace-nowrap",
        tone === "pantry"
          ? "bg-primary/10 text-primary"
          : tone === "optional"
            ? "bg-muted text-muted-foreground"
            : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        className,
      )}
    >
      {label}
    </span>
  );
}

export function RecipeEditor({
  recipe,
  ingredients,
  stockByItem,
  nameToItemId,
  itemRoots,
  returnTo,
}: Props) {
  const router = useRouter();
  const isEdit = recipe !== null;

  function navigateAfterSaveOrDelete() {
    if (returnTo && returnTo.startsWith("/")) {
      // Prefer history back so the user lands exactly where they were
      // (including scroll/selection state on the plan).
      router.back();
    } else {
      router.push(returnTo && returnTo.startsWith("/") ? returnTo : "/recipes");
    }
    router.refresh();
  }

  /** Raw linked/name-resolved id → canonical matching key. */
  function matchingKey(raw: string | null | undefined, name: string): string | null {
    if (raw) return itemRoots?.[raw] ?? raw;
    const { name: cleanName } = splitNameAndQuantity(name);
    const byName = cleanName.trim().toLowerCase();
    const resolved = byName ? nameToItemId?.[byName] : undefined;
    return resolved ?? null;
  }

  const [name, setName] = useState(recipe?.name ?? "");
  const [description, setDescription] = useState(recipe?.description ?? "");
  const [prepTime, setPrepTime] = useState(String(recipe?.prep_time ?? 0));
  const [cookTime, setCookTime] = useState(String(recipe?.cook_time ?? 0));
  const [yields, setYields] = useState(String(recipe?.yields ?? 1));
  const [source, setSource] = useState(recipe?.source ?? "");
  const [tagsText, setTagsText] = useState((recipe?.tags ?? []).join(", "));
  const [recipeType, setRecipeType] = useState<"cooking" | "no_cook">(recipe?.recipe_type === "no_cook" ? "no_cook" : "cooking");
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
  const [detailsOpen, setDetailsOpen] = useState<boolean | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  // Details is collapsed on phones but open by default on wider screens.
  const isDesktop = useIsDesktop();
  const detailsExpanded = detailsOpen ?? isDesktop;

  function updateRow(index: number, patch: Partial<IngredientDraft>) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  }

  /** Live pantry status for a draft row (chips + grouping). */
  function rowStatus(row: IngredientDraft): {
    tone: PantryTone;
    have: number;
  } {
    if (!row.name.trim()) return { tone: "unknown", have: 0 };
    if (!stockByItem) return { tone: "unknown", have: 0 };
    const key = matchingKey(row.item_id, row.name);
    const have = key ? (stockByItem[key] ?? 0) : 0;
    if (have > 0) return { tone: "pantry", have };
    return { tone: row.optional ? "optional" : "missing", have };
  }

  const namedRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.name.trim().length > 0);
  const blankRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.name.trim().length === 0);

  let covered = 0;
  let tracked = 0;
  for (const { row } of namedRows) {
    if (row.optional) continue;
    tracked += 1;
    if (rowStatus(row).tone === "pantry") covered += 1;
  }
  const missingCount = Math.max(0, tracked - covered);
  const optionalCount = namedRows.filter(({ row }) => row.optional).length;
  const progressPct = tracked > 0 ? Math.round((covered / tracked) * 100) : 0;

  // Group strictly by real pantry status: optional items that aren't stocked
  // get their own band so they never read as "In your pantry" or as missing.
  const missingRows = namedRows.filter(
    ({ row }) => rowStatus(row).tone === "missing",
  );
  const pantryRows = namedRows.filter(
    ({ row }) => rowStatus(row).tone === "pantry",
  );
  const optionalOutRows = namedRows.filter(
    ({ row }) => rowStatus(row).tone === "optional",
  );

  const pastedLines = pasteText
    .split("\n")
    .map(parsePastedLine)
    .filter((line): line is { name: string; quantity_text: string } =>
      Boolean(line),
    );

  // One flat list so a row keeps its DOM node (and input focus) when typing a
  // name moves it from the blank area into the "Need to buy" group.
  type IngredientListItem =
    | {
        kind: "heading";
        key: string;
        tone: "missing" | "pantry" | "optional";
        label: string;
      }
    | { kind: "row"; key: string; row: IngredientDraft; index: number };

  const ingredientList: IngredientListItem[] = [];
  if (stockByItem) {
    const pushRows = (items: { row: IngredientDraft; index: number }[]) => {
      for (const { row, index } of items) {
        ingredientList.push({ kind: "row", key: `row-${index}`, row, index });
      }
    };
    if (missingRows.length > 0) {
      ingredientList.push({
        kind: "heading",
        key: "heading-missing",
        tone: "missing",
        label: `Need to buy · ${missingRows.length}`,
      });
      pushRows(missingRows);
    }
    if (pantryRows.length > 0) {
      ingredientList.push({
        kind: "heading",
        key: "heading-pantry",
        tone: "pantry",
        label: `In your pantry · ${pantryRows.length}`,
      });
      pushRows(pantryRows);
    }
    if (optionalOutRows.length > 0) {
      ingredientList.push({
        kind: "heading",
        key: "heading-optional",
        tone: "optional",
        label: `Optional · not in pantry · ${optionalOutRows.length}`,
      });
      pushRows(optionalOutRows);
    }
    pushRows(blankRows);
  } else {
    rows.forEach((row, index) => {
      ingredientList.push({ kind: "row", key: `row-${index}`, row, index });
    });
  }

  function addBlankRow() {
    setRows((current) => [
      ...current,
      {
        name: "",
        quantity_text: "",
        optional: false,
        on_shopping_list: true,
        item_id: null,
      },
    ]);
  }

  function applyPaste() {
    if (pastedLines.length === 0) return;
    setRows((current) => [
      ...current,
      ...pastedLines.map((line) => ({
        name: line.name,
        quantity_text: line.quantity_text,
        optional: false,
        on_shopping_list: true,
        item_id: null,
      })),
    ]);
    setPasteText("");
    setPasteOpen(false);
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
      recipe_type: recipeType,
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
      navigateAfterSaveOrDelete();
      return;
    }

    const result = await createRecipe(input);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${input.name} created`);
    // Next.js preserves this page (Activity) instead of unmounting on
    // navigation, so clear the fields or the next /recipes/new visit shows
    // this recipe still pre-filled. Same pattern as the inventory add form.
    setName("");
    setDescription("");
    setPrepTime("0");
    setCookTime("0");
    setYields("1");
    setSource("");
    setTagsText("");
    setRecipeType("cooking");
    setRows([]);
    setPasteText("");
    setDetailsOpen(null);
    navigateAfterSaveOrDelete();
  }

  async function remove() {
    if (!recipe) return;
    const result = await deleteRecipe(recipe.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Recipe deleted");
    navigateAfterSaveOrDelete();
  }

  async function handleAddMissing() {
    if (!recipe || !stockByItem) return;
    const missingIds = ingredients
      .filter((ingredient) => {
        if (ingredient.optional) return false;
        const key = matchingKey(ingredient.item_id, ingredient.name);
        if (!key) return true;
        return (stockByItem[key] ?? 0) <= 0;
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

  const sourceUrl = externalHttpUrl(source);
  const summaryLead = `${covered} of ${tracked} in pantry`;
  const summaryExtras = [
    missingCount > 0 ? `${missingCount} to buy` : null,
    optionalCount > 0 ? `${optionalCount} optional` : null,
  ].filter(Boolean);
  const detailsSummary =
    [
      (Number(prepTime) || 0) > 0 ? `Prep ${prepTime}` : null,
      (Number(cookTime) || 0) > 0 ? `Cook ${cookTime}` : null,
      `Yields ${Number(yields) || 1}`,
      source.trim() || null,
    ]
      .filter(Boolean)
      .join(" · ") || "Prep, cook, source, tags";

  const grocerySecondary = isEdit ? (
    <Button
      type="button"
      variant="outline"
      onClick={() => setGroceryOpen(true)}
      className="h-11 shrink-0 sm:h-8"
    >
      Choose items…
    </Button>
  ) : null;

  const groceryPrimary = isEdit ? (
    <Button
      type="button"
      onClick={() => void handleAddMissing()}
      disabled={busy || missingCount === 0}
      className="h-11 shrink-0 sm:h-8"
      title={
        missingCount === 0
          ? "Everything needed is in your pantry"
          : "Adds the saved ingredients that are not in your pantry"
      }
    >
      <ShoppingCart />
      {missingCount === 0 ? "Nothing missing" : `Add ${missingCount} missing to list`}
    </Button>
  ) : null;

  // Shorter label in the phone bar so it fits beside "Choose items…".
  const groceryPrimaryMobile = isEdit ? (
    <Button
      type="button"
      onClick={() => void handleAddMissing()}
      disabled={busy || missingCount === 0}
      className="h-11 min-w-0 flex-1 sm:hidden"
    >
      <ShoppingCart />
      {missingCount === 0 ? "Nothing missing" : `Add ${missingCount} missing`}
    </Button>
  ) : null;

  function renderRow(row: IngredientDraft, index: number, key: string) {
    const status = rowStatus(row);
    return (
      <li
        key={key}
        className="mt-2 rounded-lg border border-border/60 p-2 sm:mt-0 sm:rounded-none sm:border-0 sm:border-b sm:border-border/50 sm:p-0 sm:py-2 sm:last:border-b-0"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_130px_150px_auto_auto]">
          <Input
            value={row.name}
            onChange={(event) =>
              updateRow(index, { name: event.target.value })
            }
            placeholder="Black beans"
            aria-label={`Ingredient ${index + 1} name`}
            className="col-start-1 row-start-1 h-11 sm:col-auto sm:row-auto sm:h-8"
          />
          <Input
            value={row.quantity_text}
            onChange={(event) =>
              updateRow(index, { quantity_text: event.target.value })
            }
            placeholder="Amount"
            aria-label={`Ingredient ${index + 1} amount`}
            className="col-start-1 row-start-2 h-11 w-[130px] justify-self-start placeholder:text-muted-foreground/60 sm:col-auto sm:row-auto sm:h-8 sm:w-full"
          />
          <PantryChip
            tone={status.tone}
            have={status.have}
            className="col-start-2 row-start-1 sm:col-auto sm:row-auto"
          />
          <div className="col-start-2 row-start-2 flex items-center justify-self-end gap-1 sm:contents">
            <label
              className="flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1 text-xs text-muted-foreground sm:h-7"
              title="Optional ingredient — never added to the grocery list"
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
              <span>Optional</span>
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-11 w-11 shrink-0 text-muted-foreground hover:text-foreground sm:h-7 sm:w-7 sm:justify-self-end"
              onClick={() =>
                setRows((current) => current.filter((_, i) => i !== index))
              }
              aria-label={`Remove ingredient ${index + 1}`}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <>
      <form onSubmit={save} className="mx-auto max-w-[880px] space-y-4 pb-10 md:pb-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="h-11 w-11 shrink-0 sm:h-7 sm:w-7"
            render={
              <Link
                href={
                  returnTo && returnTo.startsWith("/") ? returnTo : "/recipes"
                }
              />
            }
            aria-label="Back"
          >
            <ArrowLeft />
          </Button>
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
          >
            <Link
              href="/recipes"
              className="rounded transition-colors hover:text-foreground"
            >
              Recipes
            </Link>
            <span aria-hidden>/</span>
            <span className="truncate font-medium text-foreground">
              {isEdit ? "Edit recipe" : "New recipe"}
            </span>
          </nav>
        </div>
        <Button type="submit" disabled={busy} className="h-11 shrink-0 sm:h-8">
          {busy ? <Loader2 className="animate-spin" /> : null}
          {isEdit ? "Save changes" : "Create recipe"}
        </Button>
      </div>

      <section className="space-y-3 rounded-xl border p-4">
        <div className="space-y-2">
          <Label
            htmlFor="recipe-name"
            className="text-xs font-semibold text-muted-foreground"
          >
            Name
          </Label>
          <Input
            id="recipe-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Weeknight chili"
            autoFocus={!isEdit}
            className="h-11 text-lg font-semibold sm:h-10 md:text-xl"
          />
        </div>

        <div
          role="group"
          aria-label="Recipe type"
          className="grid grid-cols-2 gap-1 rounded-lg border p-1 sm:inline-grid"
        >
          {(
            [
              { value: "cooking", label: "Cooking recipe" },
              { value: "no_cook", label: "No-cook placeholder" },
            ] as const
          ).map((option) => {
            const selected = recipeType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setRecipeType(option.value)}
                className={cn(
                  "flex h-11 items-center justify-center rounded-md px-2 text-xs font-semibold whitespace-nowrap transition-colors sm:h-8 sm:px-5 sm:text-sm",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </section>

      {recipeType === "cooking" ? (
        <section className="space-y-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
            <div className="min-w-0 flex-1 space-y-1.5">
              <h2 className="text-sm font-extrabold">Ingredients</h2>
              {stockByItem && tracked > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold sm:text-sm">
                    {summaryLead}
                    {summaryExtras.length > 0 ? (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {summaryExtras.join(" · ")}
                      </span>
                    ) : null}
                  </p>
                  <div
                    className="h-1.5 max-w-md overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label="Ingredients in pantry"
                    aria-valuemin={0}
                    aria-valuemax={tracked}
                    aria-valuenow={covered}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {namedRows.length} ingredient
                  {namedRows.length === 1 ? "" : "s"} listed
                </p>
              )}
            </div>
            {isEdit ? (
              <div className="hidden shrink-0 items-center gap-2 sm:flex">
                {grocerySecondary}
                {groceryPrimary}
              </div>
            ) : null}
          </div>

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No ingredients yet. Add one below, or paste a list you copied
              from a recipe.
            </p>
          ) : (
            <div className="space-y-1">
              <div className="hidden items-center gap-2 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase sm:grid sm:grid-cols-[minmax(0,1fr)_130px_150px_auto_auto]">
                <span>Ingredient</span>
                <span>Amount</span>
                <span>Pantry</span>
                <span aria-hidden />
                <span aria-hidden />
              </div>
              <ul className="space-y-0">
                {ingredientList.map((item) =>
                  item.kind === "heading" ? (
                    <li
                      key={item.key}
                      className={cn(
                        "mt-4 rounded-md px-3 py-1.5 first:mt-0",
                        item.tone === "missing"
                          ? "bg-amber-500/10 text-amber-800 dark:text-amber-300"
                          : item.tone === "optional"
                            ? "bg-muted/40 text-muted-foreground"
                            : "bg-muted/70 text-muted-foreground",
                      )}
                    >
                      <h3 className="text-[10px] font-semibold tracking-wide uppercase sm:text-[11px]">
                        {item.label}
                      </h3>
                    </li>
                  ) : (
                    renderRow(item.row, item.index, item.key)
                  ),
                )}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={addBlankRow}
              className="h-11 sm:h-8"
            >
              <Plus /> Add ingredient
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPasteOpen(true)}
              className="h-11 sm:h-8"
            >
              <ClipboardPaste /> Paste a list
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Amounts like &ldquo;2 cups&rdquo; or &ldquo;6 oz&rdquo; carry over to
            the grocery list.
          </p>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          No-cook recipe — ingredients are hidden, and the pantry is left
          alone.
        </section>
      )}

      <section className="rounded-xl border">
        <button
          type="button"
          onClick={() => setDetailsOpen(!detailsExpanded)}
          aria-expanded={detailsExpanded}
          className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted/40"
        >
          <span className="text-sm font-extrabold">Details</span>
          <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{detailsSummary}</span>
            <ChevronDown
              className={cn(
                "size-4 transition-transform",
                detailsExpanded && "rotate-180",
              )}
            />
          </span>
        </button>

        {detailsExpanded ? (
          <div className="space-y-3 border-t p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-2">
                <Label
                  htmlFor="recipe-prep"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  Prep (min)
                </Label>
                <Input
                  id="recipe-prep"
                  type="number"
                  min="0"
                  value={prepTime}
                  onChange={(event) => setPrepTime(event.target.value)}
                  className="h-11 [appearance:textfield] sm:h-8 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="recipe-cook"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  Cook (min)
                </Label>
                <Input
                  id="recipe-cook"
                  type="number"
                  min="0"
                  value={cookTime}
                  onChange={(event) => setCookTime(event.target.value)}
                  className="h-11 [appearance:textfield] sm:h-8 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="recipe-yields"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  Yields
                </Label>
                <Input
                  id="recipe-yields"
                  type="number"
                  min="1"
                  value={yields}
                  onChange={(event) => setYields(event.target.value)}
                  className="h-11 [appearance:textfield] sm:h-8 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="recipe-source"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  Source
                </Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id="recipe-source"
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    placeholder="Will"
                    className="h-11 sm:h-8"
                  />
                  {sourceUrl ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="h-11 w-11 shrink-0 sm:h-7 sm:w-7"
                      aria-label="Open source link in a new tab"
                      title={sourceUrl}
                      onClick={() =>
                        window.open(sourceUrl, "_blank", "noopener,noreferrer")
                      }
                    >
                      <ExternalLink />
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label
                  htmlFor="recipe-tags"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  Tags
                </Label>
                <Input
                  id="recipe-tags"
                  value={tagsText}
                  onChange={(event) => setTagsText(event.target.value)}
                  placeholder="quick, vegetarian (comma separated)"
                  className="h-11 sm:h-8"
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="recipe-description"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  Note (optional)
                </Label>
                <Input
                  id="recipe-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Where it came from, tweaks…"
                  className="h-11 sm:h-8"
                />
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <div className="flex items-center justify-between gap-2">
        {isEdit ? (
          <Button
            type="button"
            variant="destructive"
            className="h-11 sm:h-8"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 /> Delete
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={busy} className="h-11 sm:h-8">
          {busy ? <Loader2 className="animate-spin" /> : null}
          {isEdit ? "Save changes" : "Create recipe"}
        </Button>
      </div>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Paste a list</DialogTitle>
            <DialogDescription>
              One ingredient per line. A leading number becomes the amount —
              &ldquo;2 cans black beans&rdquo; becomes amount 2 cans, name black
              beans.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            rows={8}
            placeholder={"2 cans black beans\n1 onion\n1 lb ground beef\nSalt to taste"}
            aria-label="Ingredients to paste"
          />
          <p className="text-xs text-muted-foreground">
            {pastedLines.length} ingredient
            {pastedLines.length === 1 ? "" : "s"} found
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPasteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={applyPaste}
              disabled={pastedLines.length === 0}
            >
              Add {pastedLines.length} row{pastedLines.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {isEdit && recipeType === "cooking" ? (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t bg-background/95 px-4 py-2.5 backdrop-blur sm:hidden">
          <div className="mx-auto flex max-w-[880px] items-center gap-2 pr-14">
            {grocerySecondary}
            {groceryPrimaryMobile}
          </div>
        </div>
      ) : null}
    </>
  );
}
