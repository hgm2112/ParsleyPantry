"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { tintFor } from "@/lib/tints";
import { updateGroceryItem } from "@/app/(app)/grocery/actions";
import { Button } from "@/components/ui/button";
import type { CategoryRow } from "@/lib/types";

export type ShoppingPreviewItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  checked: boolean;
  category_id: string | null;
};

export function ShoppingWidget({
  items,
  categories,
}: {
  items: ShoppingPreviewItem[];
  categories: CategoryRow[];
}) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const resolved = items.map((item) => ({
    ...item,
    checked: overrides[item.id] ?? item.checked,
  }));

  const total = resolved.length;
  const checkedCount = resolved.filter((item) => item.checked).length;
  const percent = total === 0 ? 0 : Math.round((checkedCount / total) * 100);

  const groups = useMemo(() => {
    const nameById = new Map(
      categories.map((category) => [category.id, category.name]),
    );
    const byCategory = new Map<string | null, ShoppingPreviewItem[]>();
    for (const item of resolved) {
      const list = byCategory.get(item.category_id) ?? [];
      list.push(item);
      byCategory.set(item.category_id, list);
    }
    return [...byCategory.entries()].map(([categoryId, groupItems]) => ({
      key: categoryId ?? "uncategorized",
      title: categoryId ? (nameById.get(categoryId) ?? "Other") : "Other",
      items: groupItems.sort((a, b) => Number(a.checked) - Number(b.checked)),
    }));
  }, [resolved, categories]);

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

  return (
    <section className="flex h-full flex-col rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <ShoppingCart className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">Shopping List</h2>
        <Link
          href="/grocery"
          className="ml-auto text-sm font-medium text-primary hover:underline"
        >
          Open →
        </Link>
      </div>

      {total === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing on the list yet.
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
            <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
              {checkedCount} of {total} · {percent}%
            </span>
          </div>

          <div className="space-y-2.5 overflow-y-auto">
            {groups.map((group) => {
              const tint = tintFor(group.title);
              return (
                <div
                  key={group.key}
                  className={cn(
                    "overflow-hidden rounded-xl border",
                    tint.header,
                  )}
                >
                  <div className="flex items-center justify-between px-3 py-1.5 text-xs font-semibold">
                    <span>{group.title}</span>
                    <span className="opacity-70">
                      {group.items.filter((item) => !item.checked).length} left
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
