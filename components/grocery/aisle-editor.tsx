"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ListPlus,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Store,
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
  adoptCategoryAisles,
  createAisle,
  deleteAisle,
  deleteStore,
  moveAisle,
  reorderStoreAisles,
  resetStoreFromCategories,
  setGrocerySettings,
  updateAisle,
  updateStore,
} from "@/app/(app)/grocery/actions";
import type { HouseholdSettingsRow, StoreAisleRow, StoreRow } from "@/lib/types";

export function AisleEditor({
  store,
  aisles,
  settings,
  storeIds,
}: {
  store: StoreRow;
  aisles: StoreAisleRow[];
  settings: HouseholdSettingsRow | null;
  /** Every store id in household order — needed to read the view selection. */
  storeIds: string[];
}) {
  const router = useRouter();
  const [storeName, setStoreName] = useState(store.name);
  const [storeDirty, setStoreDirty] = useState(false);
  const [newAisle, setNewAisle] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deletingAisle, setDeletingAisle] = useState<StoreAisleRow | null>(null);
  const [storeDeleteOpen, setStoreDeleteOpen] = useState(false);
  const [seedBusy, setSeedBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const reorder = useRowReorder(aisles, async (ids) => {
    const result = await reorderStoreAisles(store.id, ids);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    router.refresh();
    return true;
  });

  async function saveStoreName() {
    if (!storeDirty || !storeName.trim()) return;
    setBusy(true);
    const result = await updateStore(store.id, { name: storeName.trim() });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setStoreDirty(false);
    toast.success("Store renamed");
    router.refresh();
  }

  async function submitAisle(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = newAisle.trim();
    if (!trimmed) return;
    setBusy(true);
    const result = await createAisle(store.id, trimmed);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setNewAisle("");
    reorder.reset();
    toast.success(`${trimmed} added`);
    router.refresh();
  }

  async function saveAisleName(aisle: StoreAisleRow) {
    const trimmed = editingName.trim();
    if (!trimmed || trimmed === aisle.name) {
      setEditingId(null);
      return;
    }
    const result = await updateAisle(aisle.id, { name: trimmed });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setEditingId(null);
    reorder.reset();
    router.refresh();
  }

  async function move(aisle: StoreAisleRow, direction: "up" | "down") {
    const result = await moveAisle(aisle.id, direction);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    reorder.reset();
    router.refresh();
  }

  async function removeAisle() {
    if (!deletingAisle) return;
    const result = await deleteAisle(deletingAisle.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Aisle removed");
    setDeletingAisle(null);
    reorder.reset();
    router.refresh();
  }

  async function seedAisles() {
    setSeedBusy(true);
    const result = await adoptCategoryAisles(store.id);
    setSeedBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    reorder.reset();
    toast.success(
      result.data.created > 0
        ? `Added ${result.data.created} aisles from your categories`
        : "Nothing to add — every seed category already has an aisle here",
    );
    router.refresh();
  }

  async function resetAisles() {
    const result = await resetStoreFromCategories(store.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    reorder.reset();
    toast.success(`${store.name} reset from your categories`);
    router.refresh();
  }

  async function removeStore() {
    const result = await deleteStore(store.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${store.name} deleted`);
    router.push("/grocery/stores");
    router.refresh();
  }

  // Mirrors what /grocery shows: no persisted selection reads as the first
  // store, otherwise the list of stores in view.
  const live = (settings?.selected_store_ids ?? []).filter((id) =>
    storeIds.includes(id),
  );
  const inViewList = live.length > 0 ? live : storeIds[0] ? [storeIds[0]] : [];
  const inView = inViewList.includes(store.id);

  async function toggleInView() {
    const next = inView
      ? inViewList.filter((id) => id !== store.id)
      : storeIds.filter((id) => inViewList.includes(id) || id === store.id);
    if (next.length === 0) {
      toast.message("Keep at least one store in view");
      return;
    }

    const result = await setGrocerySettings({
      selectedStoreIds: next,
      ...(inView ? {} : { groceryViewMode: "aisle" as const }),
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(inView ? `${store.name} hidden` : `${store.name} shown`);
    router.refresh();
  }

  async function setUseAisles(useAisles: boolean) {
    if (useAisles === store.use_aisles) return;
    const result = await updateStore(store.id, { useAisles });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      useAisles ? `${store.name} aisles enabled` : `${store.name} aisles disabled`,
    );
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href="/grocery/stores" />}
          aria-label="Back to stores"
        >
          <ArrowLeft />
        </Button>
        <div className="flex flex-1 items-center gap-1.5">
          <Store className="h-4 w-4 text-muted-foreground" />
          <Input
            value={storeName}
            onChange={(event) => {
              setStoreName(event.target.value);
              setStoreDirty(true);
            }}
            onBlur={() => void saveStoreName()}
            className="h-8 max-w-56 font-semibold"
            aria-label="Store name"
          />
          {storeDirty ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void saveStoreName()}
              disabled={busy}
              aria-label="Save store name"
            >
              <Check />
            </Button>
          ) : null}
          {inView ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              In view
            </span>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void toggleInView()}
        >
          {inView ? "Hide" : "Show"}
        </Button>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-sm text-muted-foreground">Aisles</span>
          <Switch
            checked={store.use_aisles}
            onCheckedChange={(checked) => void setUseAisles(checked)}
            size="sm"
            aria-label="Toggle aisles for this store"
          />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-destructive"
          onClick={() => setStoreDeleteOpen(true)}
          aria-label={`Delete ${store.name}`}
        >
          <Trash2 />
        </Button>
      </div>

      <div className="space-y-2 rounded-xl border px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold">From your categories</p>
          <p className="text-xs text-muted-foreground">
            Add the seed aisles this store is missing, or reset the whole
            list to match. What you change here stays until you reset it —{" "}
            <Link href="/categories" className="underline">
              manage categories
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={seedBusy}
            onClick={() => void seedAisles()}
          >
            {seedBusy ? (
              <Loader2 className="animate-spin" />
            ) : (
              <ListPlus />
            )}
            Add missing from my categories
          </Button>
          <Button variant="outline" size="sm" onClick={() => setResetOpen(true)}>
            <RotateCcw />
            Reset from my categories
          </Button>
        </div>
      </div>

      <form onSubmit={submitAisle} className="flex gap-2">
        <Input
          value={newAisle}
          onChange={(event) => setNewAisle(event.target.value)}
          placeholder="Add an aisle (e.g. 12 – Canned food)"
        />
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Plus />}
          Add
        </Button>
      </form>

      {aisles.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-10 text-center">
          <p className="text-sm font-semibold">No aisles yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            List the aisles in the order you walk past them — produce, dairy,
            cans, frozen…
          </p>
        </div>
      ) : (
        <SortableList
          ids={reorder.ids}
          dndProps={reorder.dndProps}
          className="divide-y rounded-xl border bg-background"
        >
          {reorder.displayed.map((aisle, index) => (
            <SortableRow
              key={aisle.id}
              id={aisle.id}
              dragLabel={`Drag to reorder ${aisle.name}`}
            >
              <span className="w-6 text-center text-xs tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              {editingId === aisle.id ? (
                <form
                  className="min-w-0 flex-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveAisleName(aisle);
                  }}
                >
                  <Input
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    autoFocus
                    className="h-8"
                    onBlur={() => void saveAisleName(aisle)}
                    aria-label={`Rename ${aisle.name}`}
                  />
                </form>
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {aisle.name}
                </span>
              )}

              <div className="flex shrink-0 items-center">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === 0}
                  onClick={() => void move(aisle, "up")}
                  aria-label={`Move ${aisle.name} up`}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === reorder.displayed.length - 1}
                  onClick={() => void move(aisle, "down")}
                  aria-label={`Move ${aisle.name} down`}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setEditingId(aisle.id);
                    setEditingName(aisle.name);
                  }}
                  aria-label={`Rename ${aisle.name}`}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive"
                  onClick={() => setDeletingAisle(aisle)}
                  aria-label={`Delete ${aisle.name}`}
                >
                  <Trash2 />
                </Button>
              </div>
            </SortableRow>
          ))}
        </SortableList>
      )}

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={`Reset ${store.name} from your categories?`}
        description="Aisle labels and order are overwritten with your seed categories. Manual extras stay at the end. You can't undo this from here."
        confirmLabel="Reset aisles"
        onConfirm={resetAisles}
      />

      <ConfirmDialog
        open={deletingAisle !== null}
        onOpenChange={(open) => !open && setDeletingAisle(null)}
        title={`Delete ${deletingAisle?.name ?? "aisle"}?`}
        description="Items assigned to it will go back to the unassigned group."
        confirmLabel="Delete aisle"
        destructive
        onConfirm={removeAisle}
      />

      <ConfirmDialog
        open={storeDeleteOpen}
        onOpenChange={setStoreDeleteOpen}
        title={`Delete ${store.name}?`}
        description="Its aisle list goes too. Grocery items are kept."
        confirmLabel="Delete store"
        destructive
        onConfirm={removeStore}
      />
    </div>
  );
}
