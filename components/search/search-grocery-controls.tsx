"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  deleteGroceryItem,
  updateGroceryItem,
} from "@/app/(app)/grocery/actions";

/**
 * Inline [- X +] stepper + delete for a shopping-list line found by global
 * search. Mirrors the controls inside the grocery page's ItemDialog so a line
 * can be adjusted without leaving the results.
 *
 * The quantity changes on screen immediately (optimistic) and is reverted if
 * the server rejects the write. The grocery action revalidates /grocery; the
 * local refresh keeps this results page in sync too.
 */
export function SearchGroceryControls({
  id,
  name,
  quantity,
  unit,
}: {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
}) {
  const router = useRouter();
  const [qty, setQty] = useState(quantity);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inFlight = useRef(false);

  async function changeQty(delta: number) {
    if (inFlight.current) return;
    const previous = qty;
    const next = Math.max(0, previous + delta);
    if (next === previous) return;

    setQty(next);
    setBusy(true);
    inFlight.current = true;
    const result = await updateGroceryItem({ id, quantity: next });
    inFlight.current = false;
    setBusy(false);

    if (!result.ok) {
      setQty(previous);
      toast.error(result.error);
    }
    router.refresh();
  }

  async function remove() {
    setDeleting(true);
    const result = await deleteGroceryItem(id);
    setDeleting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${name} removed from your shopping list`);
    router.refresh();
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={`Decrease ${name}`}
        disabled={busy || deleting || qty <= 0}
        onClick={() => void changeQty(-1)}
      >
        <Minus />
      </Button>
      <span className="w-5 text-center text-sm font-extrabold tabular-nums">
        {qty}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={`Increase ${name}`}
        disabled={busy || deleting}
        onClick={() => void changeQty(1)}
      >
        <Plus />
      </Button>
      {unit ? (
        <span className="text-xs text-muted-foreground">{unit}</span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${name} from your shopping list`}
        className="text-destructive hover:text-destructive"
        disabled={busy || deleting}
        onClick={() => setConfirmOpen(true)}
      >
        {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remove from shopping list?"
        description={`"${name}" will be removed from your list.`}
        confirmLabel="Remove"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
