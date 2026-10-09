"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, ChevronUp, Loader2, Pencil, Plus, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import {
  createAisle,
  createStore,
  deleteAisle,
  deleteStore,
  reorderStoreAisles,
  setGrocerySettings,
  updateAisle,
  updateStore,
} from "@/app/(app)/grocery/actions";
import {
  SortableList,
  SortableRow,
  useRowReorder,
} from "@/components/sortable";
import type { HouseholdSettingsRow, StoreAisleRow, StoreRow } from "@/lib/types";

export function StoresManager({
  stores,
  aisles,
  settings,
}: {
  stores: StoreRow[];
  aisles: StoreAisleRow[];
  settings: HouseholdSettingsRow | null;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<StoreRow | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Mirrors what the list shows: an empty selection reads as the first store
  // (and from there as every store), same as on /grocery.
  const inView = new Set(
    (() => {
      const live = (settings?.selected_store_ids ?? []).filter((id) =>
        stores.some((entry) => entry.id === id),
      );
      if (live.length > 0) return live;
      return stores[0] ? [stores[0].id] : [];
    })(),
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    const result = await createStore(trimmed);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${trimmed} created`);
    setName("");
    router.refresh();
  }

  /** Toggles a store in and out of the shopping list's view. */
  async function toggleStore(store: StoreRow) {
    const hiding = inView.has(store.id);
    const next = stores
      .map((entry) => entry.id)
      .filter((id) => (hiding ? inView.has(id) && id !== store.id : inView.has(id) || id === store.id));
    if (next.length === 0) {
      toast.message("Keep at least one store in view");
      return;
    }

    const result = await setGrocerySettings({
      selectedStoreIds: next,
      ...(hiding ? {} : { groceryViewMode: "aisle" as const }),
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      hiding
        ? `${store.name} hidden from the list`
        : `Showing ${store.name}`,
    );
    router.refresh();
  }

  /** Sets a store's use_aisles flag (for use with on/off switch). */
  async function setUseAisles(store: StoreRow, useAisles: boolean) {
    if (useAisles === store.use_aisles) return;
    const result = await updateStore(store.id, { useAisles });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(useAisles ? `${store.name} aisles enabled` : `${store.name} aisles disabled`);
    router.refresh();
  }

  async function removeStore() {
    if (!deleting) return;
    const result = await deleteStore(deleting.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${deleting.name} deleted`);
    setDeleting(null);
    router.refresh();
  }

  function toggleExpanded(storeId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(storeId)) {
        next.delete(storeId);
      } else {
        next.add(storeId);
      }
      return next;
    });
  }

  async function reorderInlineAisles(storeId: string, ids: string[]) {
    const result = await reorderStoreAisles(storeId, ids);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    router.refresh();
    return true;
  }

  // Basic inline aisle editor component (for expanded sections)
  function AisleInline({ storeId, storeAisles }: { storeId: string; storeAisles: StoreAisleRow[] }) {
    const [localNew, setLocalNew] = useState("");
    const [localBusy, setLocalBusy] = useState(false);

    const reorder = useRowReorder(storeAisles, (ids) => reorderInlineAisles(storeId, ids));

    async function handleAdd(e?: React.FormEvent) {
      if (e) e.preventDefault();
      const trimmed = localNew.trim();
      if (!trimmed) return;
      setLocalBusy(true);
      const result = await createAisle(storeId, trimmed);
      setLocalBusy(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setLocalNew("");
      toast.success(`${trimmed} added`);
      router.refresh();
    }

    async function handleRename(aisle: StoreAisleRow) {
      const newName = prompt("New name for aisle", aisle.name);
      if (!newName || newName === aisle.name) return;
      const result = await updateAisle(aisle.id, { name: newName.trim() });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Aisle renamed");
      router.refresh();
    }

    async function handleDelete(aisle: StoreAisleRow) {
      if (!confirm(`Delete "${aisle.name}"?`)) return;
      const result = await deleteAisle(aisle.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Aisle removed");
      router.refresh();
    }

    return (
      <div>
        <form onSubmit={handleAdd} className="flex gap-2 mb-2">
          <Input
            value={localNew}
            onChange={(e) => setLocalNew(e.target.value)}
            placeholder="Add an aisle"
            className="h-8 text-sm"
          />
          <Button type="submit" size="sm" disabled={localBusy}>
            {localBusy ? <Loader2 className="animate-spin h-3 w-3" /> : <Plus className="h-3 w-3" />}
            Add
          </Button>
        </form>

        {storeAisles.length === 0 ? (
          <p className="text-xs text-muted-foreground">No aisles yet.</p>
        ) : (
          <SortableList
            ids={reorder.ids}
            dndProps={reorder.dndProps}
            className="divide-y rounded border bg-background text-sm"
          >
            {reorder.displayed.map((aisle, index) => (
              <SortableRow key={aisle.id} id={aisle.id} dragLabel={`Drag ${aisle.name}`}>
                <span className="w-5 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                <span className="flex-1 truncate text-sm">{aisle.name}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => void handleRename(aisle)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive"
                    onClick={() => void handleDelete(aisle)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </SortableRow>
            ))}
          </SortableList>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New store (e.g. Meijer – Ann Arbor)"
        />
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Plus />}
          Add store
        </Button>
      </form>

      {stores.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-10 text-center">
          <Store className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-semibold">No stores yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create stores and choose whether each one uses aisles or a flat list.
          </p>
        </div>
       ) : (
        <ul className="divide-y rounded-xl border bg-background">
          {stores.map((store) => {
            const storeAisles = aisles.filter((a) => a.store_id === store.id);
            const aisleCount = storeAisles.length;
            const visible = inView.has(store.id);
            const useAisles = store.use_aisles;
            const isExpanded = expanded.has(store.id);

            return (
              <li key={store.id} className="px-3 py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        {store.name}
                      </span>
                      {visible ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                          In view
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {useAisles ? `${aisleCount} aisle${aisleCount === 1 ? "" : "s"}` : "No aisles"}
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void toggleStore(store)}
                  >
                    {visible ? "Hide" : "Show"}
                  </Button>
                  <Switch
                    checked={useAisles}
                    onCheckedChange={(checked) => void setUseAisles(store, checked)}
                    size="sm"
                    aria-label={`Toggle aisles for ${store.name}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => toggleExpanded(store.id)}
                    aria-label={isExpanded ? "Collapse aisles" : "Expand aisles"}
                  >
                    {isExpanded ? <ChevronUp /> : <ChevronDown />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    render={<Link href={`/grocery/stores/${store.id}`} />}
                    aria-label={`Open focused editor for ${store.name}`}
                  >
                    <ArrowRight />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive"
                    onClick={() => setDeleting(store)}
                    aria-label={`Delete ${store.name}`}
                  >
                    <Trash2 />
                  </Button>
                </div>

                {isExpanded && (
                  <div className="mt-3 border-t pt-3 pl-2">
                    <AisleInline storeId={store.id} storeAisles={storeAisles} />
                    <div className="mt-2 text-[10px] text-muted-foreground">
                      Basic inline editing. For seed/reset/full tools, open the focused editor →
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "store"}?`}
        description="Its aisle list goes too. Grocery items are kept."
        confirmLabel="Delete store"
        destructive
        onConfirm={removeStore}
      />
    </div>
  );
}
