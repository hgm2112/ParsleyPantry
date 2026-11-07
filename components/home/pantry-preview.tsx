"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Package, MoreHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { compareByExpiry } from "@/lib/expiry";
import { StockRow } from "@/components/home/stock-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  earliestEffective,
  groupByItem,
  scopedBatches,
  pickFefoBatch,
  toBatchSnapshot,
  type BatchSnapshot,
  type ItemGroup,
} from "@/lib/batches";
import {
  restoreBatches,
  updateInventory,
  deleteInventory,
} from "@/app/(app)/inventory/actions";
import type { InventoryEntry, Location } from "@/lib/types";

const LOCATION_FILTERS: { value: Location | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "pantry", label: "Pantry" },
  { value: "fridge", label: "Fridge" },
  { value: "freezer", label: "Freezer" },
];

export function PantryPreview({ rows }: { rows: InventoryEntry[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeLocation, setActiveLocation] = useState<Location | null>(null);
  const [undoItemId, setUndoItemId] = useState<string | null>(null);
  const [undoSnapshots, setUndoSnapshots] = useState<BatchSnapshot[] | null>(null);
  const undoTimeoutRef = useRef<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<null | {
    snapshots: BatchSnapshot[];
    itemId: string;
  }>(null);

  const groups = useMemo(() => groupByItem(rows), [rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups
      .filter((group) => {
        if (
          activeLocation &&
          !group.batches.some((batch) => batch.location === activeLocation)
        ) {
          return false;
        }
        if (!needle) return true;
        return group.item.name.toLowerCase().includes(needle);
      })
      .sort((a, b) =>
        compareByExpiry(
          earliestEffective(scopedBatches(a.batches, activeLocation ?? "all")),
          a.item.name,
          earliestEffective(scopedBatches(b.batches, activeLocation ?? "all")),
          b.item.name,
        ),
      );
  }, [groups, query, activeLocation]);

  const visible = filtered.slice(0, 7);

  function clearUndoTimeout() {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
  }

  function handleUndo() {
    if (!undoSnapshots || !undoItemId) return;
    clearUndoTimeout();
    void (async () => {
      const result = await restoreBatches({ snapshots: undoSnapshots });
      if (!result.ok) {
        // non-fatal for UI
      }
      setUndoItemId(null);
      setUndoSnapshots(null);
      router.refresh();
    })();
  }

  useEffect(() => {
    return () => clearUndoTimeout();
  }, []);

  function onActionComplete(snapshots: BatchSnapshot[], itemId: string) {
    clearUndoTimeout();
    setUndoItemId(itemId);
    setUndoSnapshots(snapshots);
    undoTimeoutRef.current = window.setTimeout(() => {
      setUndoItemId(null);
      setUndoSnapshots(null);
      undoTimeoutRef.current = null;
    }, 5000);
    router.refresh();
  }

  async function handleQuickMinus(group: ItemGroup) {
    const batch = pickFefoBatch(group.batches);
    if (!batch) return;
    const snap = toBatchSnapshot(batch);
    if (batch.quantity <= 1) {
      const res = await deleteInventory(batch.id);
      if (res.ok) {
        onActionComplete([snap], group.item.id);
      }
    } else {
      const res = await updateInventory({
        inventoryId: batch.id,
        quantity: batch.quantity - 1,
      });
      if (res.ok) {
        onActionComplete([snap], group.item.id);
      }
    }
  }

  async function handleQuickRemove(group: ItemGroup) {
    const batches = group.batches;
    if (batches.length === 0) return;
    const snapshots = batches.map(toBatchSnapshot);
    if (group.totalQuantity <= 1) {
      setConfirmRemove({ snapshots, itemId: group.item.id });
    } else {
      const results = await Promise.all(
        batches.map((b) => deleteInventory(b.id))
      );
      if (results.every((r) => r.ok)) {
        onActionComplete(snapshots, group.item.id);
      }
    }
  }

  async function confirmRemoveBatch() {
    if (!confirmRemove) return;
    const { snapshots, itemId } = confirmRemove;
    const results = await Promise.all(
      snapshots.map((s) => deleteInventory(s.id))
    );
    if (results.every((r) => r.ok)) {
      onActionComplete(snapshots, itemId);
    }
    setConfirmRemove(null);
  }

  return (
    <section className="flex flex-col rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Package className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-extrabold">Pantry</h2>
        <Link
          href="/inventory"
          className="ml-auto text-sm font-semibold text-primary hover:underline"
        >
          View all →
        </Link>
      </div>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search pantry items…"
          className="pl-8"
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {LOCATION_FILTERS.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => setActiveLocation(filter.value)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
              activeLocation === filter.value
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-accent",
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? "Your pantry is empty — add items from the Pantry page."
            : "Nothing matches."}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((group) => {
            const isUndoRow = group.item.id === undoItemId;
            const rowActions = isUndoRow ? (
              <button
                type="button"
                onClick={handleUndo}
                className="rounded border px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-accent"
              >
                Undo
              </button>
            ) : (() => {
              const showRemoveOne = group.totalQuantity > 1;
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Batch actions"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end">
                    {showRemoveOne && (
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => void handleQuickMinus(group)}
                      >
                        − Remove 1
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => void handleQuickRemove(group)}
                    >
                      <Trash2 className="h-4 w-4" /> Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })();
            return (
              <StockRow key={group.item.id} group={group} actions={rowActions} />
            );
          })}
        </ul>
      )}

      {undoItemId && undoSnapshots ? (
        <div className="mt-1 px-1 text-[10px]">
          <button
            type="button"
            onClick={handleUndo}
            className="text-primary hover:underline"
          >
            Undo
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!confirmRemove}
        onOpenChange={(o) => {
          if (!o) setConfirmRemove(null);
        }}
        title="Remove last unit?"
        description="This will delete the batch."
        confirmLabel="Remove"
        destructive
        onConfirm={() => void confirmRemoveBatch()}
      />
    </section>
  );
}
