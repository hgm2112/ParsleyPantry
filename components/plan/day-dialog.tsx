"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChefHat, Ellipsis, Loader2, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  clearMealDay,
  deleteCustomMeal,
  saveCustomMeal,
  saveMealNote,
  setCustomMealDay,
  setMealDay,
  unmarkMealMade,
} from "@/app/(app)/plan/actions";
import { MadeConfirmContent } from "@/components/plan/made-confirm";
import { dayLabel } from "@/lib/plan";
import { MEAL_KINDS, dayTitle, isPlanned, mealKindInfo, NOTE_TINT } from "@/lib/meal-kind";
import { tintFor } from "@/lib/tints";
import { BUILTIN_OTHER_MEALS, CUSTOM_MEAL_ICON_OPTIONS, type CustomMealIconId, customMealIcon } from "@/lib/custom-meal-icons";
import type { CustomMealClassification, CustomMealRow, MealKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { PlannedDay } from "@/components/plan/plan-view";

export type RecipeOption = {
  id: string;
  name: string;
  time: number;
  tags: string[];
  hasIngredients: boolean;
};

type Props = {
  weekStart: string;
  day: PlannedDay;
  recipes: RecipeOption[];
  customMeals?: CustomMealRow[];
  onDone: () => void;
};

export function DayDialog({ weekStart, day, recipes, customMeals, onDone }: Props) {
  const router = useRouter();
  const label = dayLabel(day.index, weekStart);
  const currentRecipeId = day.entry?.recipe_id ?? null;
  const currentRecipe = recipes.find((entry) => entry.id === currentRecipeId);

  const [note, setNote] = useState(day.entry?.note ?? "");
  const [kind, setKind] = useState<MealKind | null>(day.entry?.kind ?? null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [localCustomMeals, setLocalCustomMeals] = useState(() => customMeals ?? []);

  const [selectedCustomId, setSelectedCustomId] = useState(
    day.entry?.custom_meal_id ?? null,
  );
  const [selectedBuiltIn, setSelectedBuiltIn] = useState<string | null>(
    day.entry?.custom_meal_id
      ? null
      : day.entry?.custom_meal_classification && day.entry?.custom_meal_name
        ? day.entry.custom_meal_name
        : null,
  );

  const [managing, setManaging] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [manageName, setManageName] = useState("");
  const [manageIcon, setManageIcon] = useState<CustomMealIconId | null>(null);
  const [manageClassification, setManageClassification] =
    useState<CustomMealClassification | null>(null);
  const [manageBusy, setManageBusy] = useState(false);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? recipes.filter(
        (recipe) =>
          recipe.name.toLowerCase().includes(needle) ||
          recipe.tags.some((tag) => tag.toLowerCase().includes(needle)),
      )
    : recipes;
  const cooking = matches.filter((recipe) => recipe.hasIngredients);
  const noCooking = matches.filter((recipe) => !recipe.hasIngredients);
  const showHeadings = cooking.length > 0 && noCooking.length > 0;

  async function chooseRecipe(recipeId: string) {
    setBusy(true);
    const result = await setMealDay({
      weekStart,
      dayIndex: day.index,
      recipeId,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const recipe = recipes.find((entry) => entry.id === recipeId);
    toast.success(`${recipe?.name ?? "Meal"} planned for ${label.weekday}`);
    router.refresh();
    onDone();
  }

  async function removeRecipe() {
    setBusy(true);
    const result = await setMealDay({
      weekStart,
      dayIndex: day.index,
      recipeId: null,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Recipe removed (note kept)");
    router.refresh();
  }

  async function clearDay() {
    setBusy(true);
    const result = await clearMealDay({ weekStart, dayIndex: day.index });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${label.weekday} cleared`);
    router.refresh();
    onDone();
  }

  async function undoMade() {
    setBusy(true);
    const result = await unmarkMealMade({ weekStart, dayIndex: day.index });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      "Unmarked as made — pantry stock used when it was confirmed isn’t restored",
    );
    router.refresh();
  }


  const noteChanged = note.trim() !== (day.entry?.note ?? "").trim();
  const kindChanged = kind !== (day.entry?.kind ?? null);

  async function finish() {
    if (selectedCustomId || selectedBuiltIn) {
      let name = selectedBuiltIn ?? "";
      let classification: CustomMealClassification = "no_cook";
      if (selectedCustomId) {
        const meal = localCustomMeals.find((entry) => entry.id === selectedCustomId);
        if (!meal) return;
        name = meal.name;
        classification = meal.classification;
      } else if (selectedBuiltIn) {
        const builtin = builtinMeals.find((entry) => entry.name === selectedBuiltIn);
        if (!builtin) return;
        name = builtin.name;
        classification = builtin.classification;
      }
      setBusy(true);
      const result = await setCustomMealDay({
        weekStart,
        dayIndex: day.index,
        customMealId: selectedCustomId,
        name,
        classification,
        note,
      });
      setBusy(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(name + " planned for " + label.weekday);
      router.refresh();
      onDone();
      return;
    }
    if (noteChanged || kindChanged) {
      setBusy(true);
      const result = await saveMealNote({
        weekStart,
        dayIndex: day.index,
        note,
        kind,
      });
      setBusy(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (kind) {
        const kindLabel = mealKindInfo(kind)?.label ?? "Meal";
        toast.success(
          currentRecipe
            ? "Recipe replaced — " + kindLabel
            : kindLabel + " planned for " + label.weekday,
        );
      } else {
        toast.success("Note saved");
      }
      router.refresh();
      onDone();
    } else {
      onDone();
    }
  }


  function resetManage(open: boolean, entry?: CustomMealRow) {
    setManaging(open);
    if (entry) {
      setEditingId(entry.id);
      setManageName(entry.name);
      setManageIcon(entry.icon as CustomMealIconId);
      setManageClassification(entry.classification);
    } else {
      setEditingId(null);
      setManageName("");
      setManageIcon(null);
      setManageClassification(null);
    }
  }

  function openManage(entry?: CustomMealRow) {
    resetManage(true, entry);
  }

  async function saveManage() {
    if (!manageName.trim() || !manageIcon || !manageClassification) return;
    setManageBusy(true);
    const result = await saveCustomMeal({
      id: editingId,
      name: manageName,
      icon: manageIcon as CustomMealIconId,
      classification: manageClassification,
    });
    setManageBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const saved: CustomMealRow = {
      id: result.data.id,
      household_id: "",
      name: manageName.trim(),
      icon: manageIcon,
      classification: manageClassification,
      created_at: "",
      updated_at: "",
    };
    if (editingId) {
      setLocalCustomMeals((meals) =>
        meals.map((meal) => (meal.id === editingId ? { ...meal, ...saved } : meal)),
      );
    } else {
      setLocalCustomMeals((meals) => [...meals, saved]);
      setSelectedCustomId(result.data.id);
      setSelectedBuiltIn(null);
    }
    resetManage(false);
    toast.success(editingId ? "Meal updated" : "Meal added");
    router.refresh();
  }

  async function removeManagedMeal(id: string) {
    const result = await deleteCustomMeal({ id });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setLocalCustomMeals((meals) => meals.filter((meal) => meal.id !== id));
    if (selectedCustomId === id) setSelectedCustomId(null);
    toast.success("Meal removed");
    router.refresh();
  }

  const topCustomMeals = localCustomMeals.slice(0, 3);
  const builtinMeals = BUILTIN_OTHER_MEALS;

  function groupHeading(title: string) {
    return (
      <li className="bg-muted/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </li>
    );
  }

  function renderOption(recipe: RecipeOption) {
    return (
      <li key={recipe.id}>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/50"
          onClick={() => void chooseRecipe(recipe.id)}
          disabled={busy}
        >
          <span className="min-w-0 flex-1 truncate text-sm">
            {recipe.name}
            {recipe.id === currentRecipeId ? (
              <Check className="ml-1.5 inline h-3.5 w-3.5 text-primary" />
            ) : null}
          </span>
          {recipe.time > 0 ? (
            <span className="text-xs text-muted-foreground">
              {recipe.time}m
            </span>
          ) : null}
        </button>
      </li>
    );
  }

  const mealTitle = dayTitle(day.entry, currentRecipe?.name);
  const savedNote = day.entry?.note?.trim() ?? "";
  const description = mealTitle
    ? savedNote && savedNote !== mealTitle
      ? `${mealTitle} — ${savedNote}`
      : mealTitle
    : "Pick a recipe, or just leave a note";

  const kindInfoForCurrent = mealKindInfo(day.entry?.kind);
  const currentTint = currentRecipe
    ? tintFor(currentRecipe.name)
    : kindInfoForCurrent
      ? kindInfoForCurrent.tint
      : NOTE_TINT;

  return (
    <Dialog open onOpenChange={(open) => !open && onDone()}>
      <DialogContent className="max-h-[85vh] gap-3 overflow-y-auto">
        {confirmOpen ? (
          <MadeConfirmContent
            weekStart={weekStart}
            dayIndex={day.index}
            mealName={mealTitle}
            tint={currentTint}
            onCancel={() => setConfirmOpen(false)}
            onConfirmed={onDone}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {label.weekday} {label.month} {label.dayOfMonth}
              </DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {currentRecipe ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <span className="min-w-0 truncate text-sm font-semibold">
                    {currentRecipe.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void removeRecipe()}
                    disabled={busy}
                  >
                    <X /> Remove
                  </Button>
                </div>
              ) : null}

              {isPlanned(day.entry) && !day.entry?.made_at ? (
                <Button
                  variant="outline"
                  className={cn("w-full", currentTint.header)}
                  onClick={() => setConfirmOpen(true)}
                  disabled={busy}
                >
                  <ChefHat />
                  Mark as made
                </Button>
              ) : null}
              {day.entry?.made_at ? (
                <button
                  type="button"
                  onClick={() => void undoMade()}
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary/10 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" /> Made ✓
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="sr-only">— undo</span>
                </button>
              ) : null}

              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search recipes"
                  className="pl-8"
                />
              </div>

              <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border">
                {matches.length === 0 ? (
                  <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                    No recipes match.
                  </li>
                ) : (
                  <>
                    {showHeadings ? groupHeading("Cooking") : null}
                    {cooking.map(renderOption)}
                    {showHeadings ? groupHeading("No cooking") : null}
                    {noCooking.map(renderOption)}
                  </>
                )}
              </ul>

              <div className="space-y-2">
                <Label>Other Meals</Label>
                <div className="flex flex-wrap gap-1.5">
                  {builtinMeals.map((meal) => {
                    const active = selectedBuiltIn === meal.name;
                    const Icon = customMealIcon(meal.icon)!;
                    return (
                      <button
                        key={meal.name}
                        type="button"
                        aria-pressed={active}
                        disabled={busy}
                        onClick={() => {
                          setSelectedBuiltIn(active ? null : meal.name);
                          if (!active) setKind(null);
                        }}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {meal.name}
                      </button>
                    );
                  })}
                  {topCustomMeals.map((meal) => {
                    const active = selectedCustomId === meal.id;
                    const Icon = customMealIcon(meal.icon)!;
                    return (
                      <button
                        key={meal.id}
                        type="button"
                        aria-pressed={active}
                        disabled={busy}
                        onClick={() => {
                          setSelectedCustomId(active ? null : meal.id);
                          if (!active) setKind(null);
                        }}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {meal.name}
                      </button>
                    );
                  })}
                  {MEAL_KINDS.map((entry) => {
                    const active = kind === entry.kind;
                    const Icon = entry.Icon;
                    return (
                      <button
                        key={entry.kind}
                        type="button"
                        aria-pressed={active}
                        disabled={busy}
                        onClick={() => {
                          setKind(active ? null : entry.kind);
                          setSelectedBuiltIn(null);
                          setSelectedCustomId(null);
                        }}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {entry.label}
                      </button>
                    );
                  })}
                </div>
                {kind && currentRecipe ? (
                  <p className="text-xs text-muted-foreground">
                    Saving replaces &ldquo;{currentRecipe.name}&rdquo;.
                  </p>
                ) : null}
              </div>

              <p className="text-xs text-muted-foreground">
                Add a meal without a recipe or edit an existing planned meal.
              </p>

              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => openManage()} disabled={busy}>
                  <Plus /> Add a meal
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setManaging((value) => !value)} disabled={busy}>
                  <Ellipsis />
                </Button>
              </div>

              {managing ? (
                <div className="space-y-3 rounded-lg border p-3">
                  {localCustomMeals.length > 0 ? (
                    <div className="space-y-2">
                      <Label>Custom meals</Label>
                      <ul className="divide-y rounded-lg border">
                        {localCustomMeals.map((meal) => (
                          <li key={meal.id} className="flex items-center gap-2 px-3 py-2">
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-accent/50"
                              onClick={() => openManage(meal)}
                            >
                              {(() => {
                                const Icon = customMealIcon(meal.icon);
                                return Icon ? <Icon className="h-4 w-4 shrink-0" /> : null;
                              })()}
                              <span className="truncate text-sm font-semibold">{meal.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {meal.classification === "cooking" ? "Cooking" : "No Cooking"}
                              </span>
                            </button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeManagedMeal(meal.id)}>
                              <Trash2 />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="space-y-1">
                    <Label htmlFor="manage-name">Name</Label>
                    <Input id="manage-name" value={manageName} onChange={(event) => setManageName(event.target.value)} maxLength={80} />
                  </div>

                  <div className="space-y-1">
                    <Label>Icon</Label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {CUSTOM_MEAL_ICON_OPTIONS.map((entry) => {
                        const active = manageIcon === entry.id;
                        const Icon = entry.Icon;
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setManageIcon(entry.id)}
                            className={cn(
                              "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-xs",
                              active
                                ? "border-primary bg-primary/10 text-primary"
                                : "bg-background text-muted-foreground hover:bg-accent",
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            <span className="truncate">{entry.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label>Classification</Label>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant={manageClassification === "cooking" ? "default" : "outline"} onClick={() => setManageClassification("cooking")}>
                        Cooking
                      </Button>
                      <Button type="button" size="sm" variant={manageClassification === "no_cook" ? "default" : "outline"} onClick={() => setManageClassification("no_cook")}>
                        No Cooking
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Choose Cooking or No Cooking before saving.</p>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => resetManage(false)} disabled={manageBusy}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void saveManage()}
                      disabled={manageBusy || !manageName.trim() || !manageIcon || !manageClassification}
                    >
                      {manageBusy ? <Loader2 className="animate-spin" /> : <Check />}
                      Save and Close
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="day-note">Note</Label>
                <Textarea
                  id="day-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={
                    kind
                      ? (mealKindInfo(kind)?.placeholder ?? "Add details…")
                      : "Leftovers night…"
                  }
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="destructive"
                onClick={() => void clearDay()}
                disabled={busy}
              >
                <Trash2 /> Clear day
              </Button>
              <Button
                onClick={() => void finish()}
                disabled={busy}
                className="flex-1"
              >
                {busy ? <Loader2 className="animate-spin" /> : <Check />}
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
