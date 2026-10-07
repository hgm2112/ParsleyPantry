"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  clearMealDay,
  saveMealNote,
  setMealDay,
} from "@/app/(app)/plan/actions";
import { dayLabel } from "@/lib/plan";
import type { PlannedDay } from "@/components/plan/plan-view";

type Props = {
  weekStart: string;
  day: PlannedDay;
  recipes: { id: string; name: string; time: number; tags: string[] }[];
  onDone: () => void;
};

export function DaySheet({ weekStart, day, recipes, onDone }: Props) {
  const router = useRouter();
  const label = dayLabel(day.index, weekStart);
  const currentRecipeId = day.entry?.recipe_id ?? null;
  const currentRecipe = recipes.find((entry) => entry.id === currentRecipeId);

  const [note, setNote] = useState(day.entry?.note ?? "");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? recipes.filter(
        (recipe) =>
          recipe.name.toLowerCase().includes(needle) ||
          recipe.tags.some((tag) => tag.toLowerCase().includes(needle)),
      )
    : recipes;

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
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Note saved");
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

  return (
    <Sheet open onOpenChange={(open) => !open && onDone()}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto gap-3">
        <SheetHeader>
          <SheetTitle>
            {label.weekday} {label.month} {label.dayOfMonth}
          </SheetTitle>
          <SheetDescription>
            {currentRecipe
              ? currentRecipe.name
              : "Pick a recipe, or just leave a note"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 px-4">
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
              matches.map((recipe) => (
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
              ))
            )}
          </ul>

          <div className="space-y-2">
            <Label htmlFor="day-note">Note (no recipe needed)</Label>
            <Textarea
              id="day-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Leftovers night…"
              rows={2}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void saveNote()}
              disabled={busy}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
              Save note
            </Button>
          </div>
        </div>

        <SheetFooter className="gap-2 sm:gap-0">
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
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
