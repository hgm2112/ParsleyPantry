"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Loader2,
  Pencil,
  Plus,
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
  createAisle,
  deleteAisle,
  deleteStore,
  moveAisle,
  reorderStoreAisles,
  setGrocerySettings,
  setStoreFollowCategories,
  updateAisle,
  updateStore,
} from "@/app/(app)/grocery/actions";
import type { StoreAisleRow, StoreRow } from "@/lib/types";

export function AisleEditor({
  store,
  aisles,
}: {
  store: StoreRow;
  aisles: StoreAisleRow[];
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
  const [followBusy, setFollowBusy] = useState(false);

  const following = store.follow_categories;

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

  async function toggleFollow(checked: boolean) {
    setFollowBusy(true);
    const result = await setStoreFollowCategories(store.id, checked);
    setFollowBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    reorder.reset();
    toast.success(
      checked
        ? `${store.name} now follows your categories`
        : `${store.name} manages its own aisles now`,
    );
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

  async function selectThisStore() {
    const result = await setGrocerySettings({
      selectedStoreId: store.id,
      groceryViewMode: "aisle",
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Shopping at ${store.name}`);
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
            className="h-8 max-w-56 font-medium"
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
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => void selectThisStore()}>
          <Check aria-hidden />
          <span className="sr-only">Use as active store</span>
        </Button>
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

      <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Follow my categories</p>
          <p className="text-xs text-muted-foreground">
            {following ? (
              <>
                Labels and order come from your categories —{" "}
                <Link href="/categories" className="underline">
                  reorder them there
                </Link>
                .
              </>
            ) : (
              "This store keeps its own aisle numbers and contents."
            )}
          </p>
        </div>
        <Switch
          checked={following}
          disabled={followBusy}
          onCheckedChange={(checked) => void toggleFollow(checked)}
          aria-label="Follow my categories"
        />
      </div>

      {following ? null : (
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
      )}

      {aisles.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-10 text-center">
          <p className="text-sm font-medium">No aisles yet</p>
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
              draggable={!following}
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
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {aisle.name}
                </span>
              )}

              {following ? null : (
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
              )}
            </SortableRow>
          ))}
        </SortableList>
      )}

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
