"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Lightbulb, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { addNewToTry, keepNewToTry } from "@/app/(app)/home/actions";
import { deleteRecipe } from "@/app/(app)/recipes/actions";
import type { RecipeOption } from "@/components/plan/day-dialog";
import type { NewToTryEntry } from "@/lib/types";

const DISPLAY_LIMIT = 5;

export function NewToTryWidget({
  rows,
  recipes,
  recipeTypeById,
}: {
  rows: NewToTryEntry[];
  recipes: RecipeOption[];
  recipeTypeById?: Map<string, string>;
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<NewToTryEntry | null>(
    null,
  );

  const addedIds = useMemo(() => new Set(rows.map((row) => row.id)), [rows]);

  // Picker candidates only — the widget itself never derives from tags.
  // Completed = has ingredients and not a no-cook placeholder, plus the
  // "New to try" tag (exact segment, case-insensitive).
  const candidates = useMemo(
    () =>
      recipes.filter((recipe) => {
        if (addedIds.has(recipe.id)) return false;
        if (!recipe.hasIngredients) return false;
        if ((recipeTypeById?.get(recipe.id) ?? "cooking") === "no_cook") {
          return false;
        }
        return recipe.tags.some(
          (tag) => tag.trim().toLowerCase() === "new to try",
        );
      }),
    [recipes, addedIds, recipeTypeById],
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sorted = [...candidates].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    if (!needle) return sorted;
    return sorted.filter(
      (recipe) =>
        recipe.name.toLowerCase().includes(needle) ||
        recipe.tags.some((tag) => tag.toLowerCase().includes(needle)),
    );
  }, [candidates, query]);

  async function handleAdd(recipe: RecipeOption) {
    if (addingId) return;
    setAddingId(recipe.id);
    const result = await addNewToTry(recipe.id);
    setAddingId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${recipe.name} added to New to Try`);
    setPickerOpen(false);
    setQuery("");
    router.refresh();
  }

  async function handleKeep(entry: NewToTryEntry) {
    if (busyId) return;
    setBusyId(entry.id);
    const result = await keepNewToTry(entry.id);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${entry.name} kept`);
    router.refresh();
  }

  const shown = rows.slice(0, DISPLAY_LIMIT);

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Lightbulb className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-extrabold">New to Try</h2>
        <span className="text-sm font-semibold text-muted-foreground">
          ({rows.length})
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {rows.length > DISPLAY_LIMIT ? (
            <Link
              href="/recipes?filter=new-to-try"
              className="text-sm font-semibold text-primary hover:underline"
            >
              View all →
            </Link>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPickerOpen(true)}
          >
            <Plus />
            Add a recipe
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Nothing new to try yet — pick a completed recipe you tagged
          &ldquo;New to try&rdquo;.
        </p>
      ) : (
        <ul className="space-y-1">
          {shown.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50"
            >
              <Link
                href={`/recipes/${entry.id}`}
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {entry.name}
                </span>
                {entry.time > 0 ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold uppercase text-primary">
                    {entry.time}m
                  </span>
                ) : null}
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Keep ${entry.name}`}
                title={`Keep ${entry.name}`}
                disabled={busyId !== null}
                onClick={() => void handleKeep(entry)}
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400"
              >
                {busyId === entry.id ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${entry.name}`}
                title={`Remove ${entry.name}`}
                disabled={busyId !== null}
                onClick={() => setPendingDelete(entry)}
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) setQuery("");
        }}
      >
        <DialogContent className="max-h-[85vh] gap-3 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add a recipe</DialogTitle>
            <DialogDescription>
              Pick a completed recipe with the &ldquo;New to try&rdquo; tag.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
                {candidates.length === 0
                  ? "No eligible recipes — tag a completed recipe “New to try” first."
                  : "No recipes match."}
              </li>
            ) : (
              matches.map((recipe) => (
                <li key={recipe.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/50 disabled:opacity-50"
                    onClick={() => void handleAdd(recipe)}
                    disabled={addingId !== null}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {recipe.name}
                    </span>
                    {recipe.time > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        {recipe.time}m
                      </span>
                    ) : null}
                    {addingId === recipe.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPickerOpen(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete recipe permanently?"
        description={
          pendingDelete
            ? `This will permanently delete "${pendingDelete.name}" from your Recipes library. This action cannot be undone.`
            : undefined
        }
        confirmLabel="Confirm Delete"
        destructive
        onConfirm={async () => {
          if (!pendingDelete) return;
          const target = pendingDelete;
          const result = await deleteRecipe(target.id);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`"${target.name}" deleted`);
          router.refresh();
        }}
      />
    </section>
  );
}
