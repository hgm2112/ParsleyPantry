"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChefHat, Loader2, RotateCcw, Search, Trash2, X } from "lucide-react";
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
  saveMealNote,
  setMealDay,
  unmarkMealMade,
} from "@/app/(app)/plan/actions";
import { MadeConfirmContent } from "@/components/plan/made-confirm";
import { dayLabel } from "@/lib/plan";
import { MEAL_KINDS, dayTitle, isPlanned, mealKindInfo } from "@/lib/meal-kind";
import type { MealKind } from "@/lib/types";
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
  onDone: () => void;
};

export function DayDialog({ weekStart, day, recipes, onDone }: Props) {
  const router = useRouter();
  const label = dayLabel(day.index, weekStart);
  const currentRecipeId = day.entry?.recipe_id ?? null;
  const currentRecipe = recipes.find((entry) => entry.id === currentRecipeId);

  const [note, setNote] = useState(day.entry?.note ?? "");
  const [kind, setKind] = useState<MealKind | null>(day.entry?.kind ?? null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  async function saveNote() {
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
          ? `Recipe replaced — ${kindLabel}`
          : `${kindLabel} planned for ${label.weekday}`,
      );
    } else {
      toast.success("Note saved");
    }
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

  return (
    <Dialog open onOpenChange={(open) => !open && onDone()}>
      <DialogContent className="max-h-[85vh] gap-3 overflow-y-auto">
        {confirmOpen ? (
          <MadeConfirmContent
            weekStart={weekStart}
            dayIndex={day.index}
            mealName={mealTitle}
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
                  className="w-full"
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
                <Label>Other plans</Label>
                <div className="flex flex-wrap gap-1.5">
                  {MEAL_KINDS.map((entry) => {
                    const active = kind === entry.kind;
                    const Icon = entry.Icon;
                    return (
                      <button
                        key={entry.kind}
                        type="button"
                        aria-pressed={active}
                        disabled={busy}
                        onClick={() => setKind(active ? null : entry.kind)}
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void saveNote()}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Check />}
                  Save
                </Button>
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
              <Button onClick={onDone} className="flex-1">
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
