"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  SortableList,
  SortableRow,
  useRowReorder,
} from "@/components/sortable";
import {
  createCategory,
  deleteCategory,
  moveCategory,
  reorderCategories,
  setCategorySeedStores,
  updateCategory,
} from "@/app/(app)/categories/actions";
import type { CategoryRow } from "@/lib/types";
import { tintFor } from "@/lib/tints";
import { cn } from "@/lib/utils";

export function CategoriesView({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleting, setDeleting] = useState<CategoryRow | null>(null);

  const reorder = useRowReorder(categories, async (ids) => {
    const result = await reorderCategories(ids);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    router.refresh();
    return true;
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setBusy(true);
    const result = await createCategory(trimmed);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setNewName("");
    reorder.reset();
    toast.success(`${trimmed} added`);
    router.refresh();
  }

  async function saveName(category: CategoryRow) {
    const trimmed = editingName.trim();
    if (!trimmed || trimmed === category.name) {
      setEditingId(null);
      return;
    }
    const result = await updateCategory(category.id, { name: trimmed });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setEditingId(null);
    reorder.reset();
    router.refresh();
  }

  async function move(category: CategoryRow, direction: "up" | "down") {
    const result = await moveCategory(category.id, direction);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    reorder.reset();
    router.refresh();
  }

  async function toggleSeed(category: CategoryRow, seed: boolean) {
    const result = await setCategorySeedStores(category.id, seed);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      seed
        ? `${category.name} will seed store aisles`
        : `${category.name} won't seed store aisles`,
    );
    router.refresh();
  }

  async function remove() {
    if (!deleting) return;
    const result = await deleteCategory(deleting.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Category removed");
    setDeleting(null);
    reorder.reset();
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Add a category (e.g. 🥬 05 - Produce)"
        />
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Plus />}
          Add
        </Button>
      </form>

      {categories.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-10 text-center">
          <p className="text-sm font-medium">No categories yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Categories group your grocery list, inventory filters, and store
            aisles.
          </p>
        </div>
      ) : (
        <SortableList
          ids={reorder.ids}
          dndProps={reorder.dndProps}
          className="divide-y rounded-xl border bg-background"
        >
          {reorder.displayed.map((category, index) => (
            <SortableRow
              key={category.id}
              id={category.id}
              dragLabel={`Drag to reorder ${category.name}`}
            >
              <span className="w-6 text-center text-xs tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              {editingId === category.id ? (
                <form
                  className="min-w-0 flex-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveName(category);
                  }}
                >
                  <Input
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    autoFocus
                    className="h-8"
                    onBlur={() => void saveName(category)}
                    aria-label={`Rename ${category.name}`}
                  />
                </form>
              ) : (
                <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
                  <span
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      tintFor(category.name).dot,
                    )}
                    aria-hidden
                  />
                  <span className="truncate">{category.name}</span>
                </span>
              )}

              <div className="flex shrink-0 items-center">
                <Switch
                  checked={category.seed_stores}
                  onCheckedChange={(checked) => void toggleSeed(category, checked)}
                  aria-label={`Seed stores from ${category.name}`}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === 0}
                  onClick={() => void move(category, "up")}
                  aria-label={`Move ${category.name} up`}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === reorder.displayed.length - 1}
                  onClick={() => void move(category, "down")}
                  aria-label={`Move ${category.name} down`}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setEditingId(category.id);
                    setEditingName(category.name);
                  }}
                  aria-label={`Rename ${category.name}`}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive"
                  onClick={() => setDeleting(category)}
                  aria-label={`Delete ${category.name}`}
                >
                  <Trash2 />
                </Button>
              </div>
            </SortableRow>
          ))}
        </SortableList>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "category"}?`}
        description="Items keep existing without a category. Store aisles aren't affected."
        confirmLabel="Delete category"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
