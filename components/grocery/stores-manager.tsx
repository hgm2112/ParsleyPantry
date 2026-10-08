"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Plus, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  createStore,
  deleteStore,
  setGrocerySettings,
} from "@/app/(app)/grocery/actions";
import type { HouseholdSettingsRow, StoreRow } from "@/lib/types";

export function StoresManager({
  stores,
  aisles,
  settings,
}: {
  stores: StoreRow[];
  aisles: { store_id: string }[];
  settings: HouseholdSettingsRow | null;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<StoreRow | null>(null);

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
    toast.success(`${trimmed} created — add its aisles next`);
    setName("");
    router.push(`/grocery/stores/${result.data.store.id}`);
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
            Create your main store (Meijer, Kroger…) and give it an aisle list.
            The grocery list will sort by those aisles.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-background">
          {stores.map((store) => {
            const aisleCount = aisles.filter(
              (aisle) => aisle.store_id === store.id,
            ).length;
            const visible = inView.has(store.id);
            return (
              <li key={store.id} className="flex items-center gap-3 px-3 py-3">
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
                    {aisleCount} aisle{aisleCount === 1 ? "" : "s"}
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void toggleStore(store)}
                >
                  {visible ? "Hide" : "Show"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  render={<Link href={`/grocery/stores/${store.id}`} />}
                  aria-label={`Edit aisles for ${store.name}`}
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
