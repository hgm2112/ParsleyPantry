"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  Store,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  SortableList,
  SortableRow,
  useRowReorder,
} from "@/components/sortable";
import {
  createCategory,
  deleteCategory,
  reorderCategories,
  updateCategory,
} from "@/app/(app)/categories/actions";
import type { CategoryRow, StoreAisleRow, StoreRow } from "@/lib/types";
import { tintFor } from "@/lib/tints";
import { cn } from "@/lib/utils";

/**
 * Full id order after reordering the visible subset: seeded (aisle)
 * categories keep their slots so the coverage check in reorderCategories
 * passes and their relative order is untouched.
 */
function mergedOrder(all: CategoryRow[], visibleIds: string[]): string[] {
  const queue = [...visibleIds];
  return all.map((category) =>
    category.seed_stores ? category.id : (queue.shift() as string),
  );
}

export function CategoriesView({
  categories,
  stores,
  aisles,
}: {
  categories: CategoryRow[];
  stores: StoreRow[];
  aisles: StoreAisleRow[];
}) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleting, setDeleting] = useState<CategoryRow | null>(null);
  const [openStoreId, setOpenStoreId] = useState<string | null>(null);

  const visible = useMemo(
    () => categories.filter((category) => !category.seed_stores),
    [categories],
  );

  const aislesByStore = useMemo(() => {
    const map = new Map<string, StoreAisleRow[]>();
    for (const aisle of aisles) {
      const list = map.get(aisle.store_id) ?? [];
      list.push(aisle);
      map.set(aisle.store_id, list);
    }
    return map;
  }, [aisles]);

  const reorder = useRowReorder(visible, async (ids) => {
    const result = await reorderCategories(mergedOrder(categories, ids));
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
    const ids = reorder.displayed.map((entry) => entry.id);
    const index = ids.indexOf(category.id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= ids.length) return;
    [ids[index], ids[swapWith]] = [ids[swapWith], ids[index]];
    const result = await reorderCategories(mergedOrder(categories, ids));
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    reorder.reset();
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
    <div className="space-y-6">
      {stores.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-extrabold">Stores</h2>
          <div className="divide-y rounded-xl border bg-background">
            {stores.map((store) => {
              const storeAisles = aislesByStore.get(store.id) ?? [];
              const open = openStoreId === store.id;
              return (
                <div key={store.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-accent/40"
                    onClick={() => setOpenStoreId(open ? null : store.id)}
                    aria-expanded={open}
                  >
                    <Store className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {store.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {storeAisles.length} aisle
                      {storeAisles.length === 1 ? "" : "s"}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </button>
                  {open ? (
                    <div className="border-t bg-muted/30 px-3 py-2">
                      {storeAisles.length === 0 ? (
                        <p className="py-1 text-xs text-muted-foreground">
                          No aisles yet.
                        </p>
                      ) : (
                        <ul className="divide-y divide-black/5">
                          {storeAisles.map((aisle) => (
                            <li key={aisle.id} className="py-1.5 text-sm">
                              {aisle.name}
                            </li>
                          ))}
                        </ul>
                      )}
                      <Link
                        href={`/grocery/stores/${store.id}`}
                        className="mt-1 inline-block text-xs font-semibold text-primary hover:underline"
                      >
                        Manage aisles →
                      </Link>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-extrabold">Categories</h2>
        <form onSubmit={submit} className="flex gap-2">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Add a category (e.g. Snacks)"
          />
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
            Add
          </Button>
        </form>

        {visible.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-10 text-center">
            <p className="text-sm font-semibold">No categories yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Categories group your grocery list and inventory filters.
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
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold">
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
      </section>

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
