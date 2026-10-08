"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Plus, ShoppingCart, Tag } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { tintFor } from "@/lib/tints";
import {
  buildItemStores,
  buildStoreSections,
  visibleForStores,
} from "@/lib/grocery-groups";
import {
  clearCheckedGrocery,
  restoreGroceryItems,
  updateGroceryItem,
} from "@/app/(app)/grocery/actions";
import { Button } from "@/components/ui/button";
import type {
  CategoryRow,
  GrocerySource,
  HouseholdSettingsRow,
  StoreAisleRow,
  StoreRow,
} from "@/lib/types";

export type ShoppingPreviewItem = {
  id: string;
  item_id: string | null;
  name: string;
  quantity: number;
  unit: string | null;
  checked: boolean;
  sale_only: boolean;
  category_id: string | null;
  source: GrocerySource;
  item: { id: string; category_id: string | null } | null;
};

export function ShoppingWidget({
  items,
  categories,
  stores,
  aisles,
  assignments,
  rememberedAisles,
  itemStores,
  settings,
}: {
  items: ShoppingPreviewItem[];
  categories: CategoryRow[];
  stores: StoreRow[];
  aisles: StoreAisleRow[];
  assignments: { grocery_item_id: string; store_id: string; aisle_id: string }[];
  rememberedAisles: { item_id: string; store_id: string; aisle_id: string }[];
  itemStores: { grocery_item_id: string; store_id: string }[];
  settings: HouseholdSettingsRow | null;
}) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const resolved = items.map((item) => ({
    ...item,
    checked: overrides[item.id] ?? item.checked,
  }));

  const mode = settings?.grocery_view_mode ?? "aisle";

  // Same view rule as /grocery: the stores in view, never a blank list.
  const sectionStores = useMemo(() => {
    const live = (settings?.selected_store_ids ?? []).filter((id) =>
      stores.some((entry) => entry.id === id),
    );
    const active = stores.filter((entry) =>
      (live.length > 0 ? live : stores[0] ? [stores[0].id] : []).includes(
        entry.id,
      ),
    );
    return active.length > 0 ? active : stores;
  }, [stores, settings]);

  const itemStoreMap = useMemo(() => buildItemStores(itemStores), [itemStores]);

  const visible = useMemo(
    () =>
      visibleForStores(
        resolved,
        itemStoreMap,
        sectionStores.map((entry) => entry.id),
      ),
    [resolved, itemStoreMap, sectionStores],
  );

  const sections = useMemo(
    () =>
      buildStoreSections<ShoppingPreviewItem>({
        items: visible,
        mode,
        stores: sectionStores,
        aisles,
        itemStores: itemStoreMap,
        assignments,
        rememberedAisles,
        categories,
      }),
    [
      visible,
      mode,
      sectionStores,
      aisles,
      itemStoreMap,
      assignments,
      rememberedAisles,
      categories,
    ],
  );

  const total = visible.length;
  const checkedCount = visible.filter((item) => item.checked).length;
  const percent = total === 0 ? 0 : Math.round((checkedCount / total) * 100);
  const showHeaders = sections.length > 1;

  async function toggle(item: ShoppingPreviewItem) {
    const next = !item.checked;
    setOverrides((current) => ({ ...current, [item.id]: next }));
    setBusyId(item.id);
    const result = await updateGroceryItem({ id: item.id, checked: next });
    setBusyId(null);
    if (!result.ok) {
      setOverrides((current) => {
        const copy = { ...current };
        delete copy[item.id];
        return copy;
      });
      toast.error(result.error);
    }
  }

  async function restoreCleared(removed: ShoppingPreviewItem[]) {
    const result = await restoreGroceryItems(
      removed.map((item) => ({
        id: item.id,
        item_id: item.item_id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category_id: item.category_id,
        sale_only: item.sale_only,
        source: item.source,
      })),
    );
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Restored");
    router.refresh();
  }

  async function clearChecked() {
    const removed = visible.filter((item) => item.checked);
    if (removed.length === 0) return;
    const result = await clearCheckedGrocery(removed.map((item) => item.id));
    if (!result.ok) {
      toast.error(result.error);
      router.refresh();
      return;
    }
    toast.success(
      `Cleared ${removed.length} item${removed.length === 1 ? "" : "s"}`,
      {
        duration: 10000,
        action: {
          label: "Undo",
          onClick: () => void restoreCleared(removed),
        },
      },
    );
    router.refresh();
  }

  return (
    <section className="flex h-full flex-col rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <ShoppingCart className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-extrabold">Shopping List</h2>
        <Link
          href="/grocery"
          className="ml-auto text-sm font-semibold text-primary hover:underline"
        >
          Open →
        </Link>
      </div>

      {total === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {resolved.length === 0
            ? "Nothing on the list yet."
            : "Nothing here for the stores in view."}
        </p>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="whitespace-nowrap text-xs font-semibold text-muted-foreground">
              {checkedCount} of {total} · {percent}%
            </span>
          </div>

          <div className="space-y-2.5 overflow-y-auto">
            {sections.map((section) => (
              <div key={section.key} className="space-y-2.5">
                {showHeaders ? (
                  <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                    {section.title}
                  </p>
                ) : null}
                {section.groups.map((group) => {
                  const tint = tintFor(group.title);
                  return (
                    <div
                      key={group.key}
                      className={cn(
                        "overflow-hidden rounded-xl border",
                        tint.header,
                      )}
                    >
                      <div className="flex items-center justify-between px-3 py-1.5 text-xs font-extrabold">
                        <span>{group.title}</span>
                        <span className="opacity-70">
                          {group.items.filter((item) => !item.checked).length}{" "}
                          left
                        </span>
                      </div>
                      <ul className="divide-y divide-black/5 bg-background">
                        {group.items.map((item) => (
                          <li key={item.id}>
                            <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent/40">
                              <input
                                type="checkbox"
                                checked={item.checked}
                                disabled={busyId === item.id}
                                onChange={() => void toggle(item)}
                                className="size-4 shrink-0 accent-primary"
                              />
                              <span
                                className={cn(
                                  "min-w-0 flex-1 truncate",
                                  item.checked &&
                                    "text-muted-foreground line-through",
                                )}
                              >
                                {item.name}
                              </span>
                              {item.sale_only ? (
                                <Tag
                                  className="h-3.5 w-3.5 shrink-0 text-amber-600"
                                  aria-label="Only buy if on sale"
                                />
                              ) : null}
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {item.quantity}
                                {item.unit ? ` ${item.unit}` : ""}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {checkedCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full"
              onClick={() => void clearChecked()}
            >
              Clear {checkedCount} checked
            </Button>
          ) : null}

          <Button
            render={<Link href="/grocery" />}
            className="mt-3 w-full"
            size="lg"
          >
            <Plus className="h-4 w-4" /> Add Item
          </Button>
        </>
      )}
    </section>
  );
}
