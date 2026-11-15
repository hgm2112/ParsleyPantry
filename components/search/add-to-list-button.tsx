"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { addOrIncrementGroceryItem } from "@/app/(app)/grocery/actions";
import { cn } from "@/lib/utils";

/**
 * Repeatable "add to shopping list" control for a search result card. Each tap
 * adds 1 (or adds another 1 if it's already on the list) so you can add more
 * without leaving search. A brief checkmark confirms the tap, then it returns
 * to the cart.
 *
 * The surrounding cards use a stretched-link overlay (`after:absolute
 * after:inset-0`), so the button carries `relative z-10` to stay clickable
 * without swallowing the card's own navigation.
 */
export function AddToListButton({
  itemId,
  name,
  unit,
  categoryId,
  className,
}: {
  itemId: string;
  name: string;
  unit?: string | null;
  categoryId?: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const inFlight = useRef(false);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimer.current != null) window.clearTimeout(flashTimer.current);
    };
  }, []);

  function showFlash() {
    setFlash(true);
    if (flashTimer.current != null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => {
      setFlash(false);
      flashTimer.current = null;
    }, 1200);
  }

  async function add() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const result = await addOrIncrementGroceryItem({
      itemId,
      name,
      unit: unit ?? null,
      categoryId: categoryId ?? null,
      quantity: 1,
      source: "manual",
    });
    setBusy(false);
    inFlight.current = false;
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    showFlash();
    if (result.data.created) {
      toast.success(`${result.data.name} added to your shopping list`);
    } else {
      toast.success(
        `${result.data.name} — now ${result.data.quantity} on your shopping list`,
      );
    }
    // Re-render search sections (e.g. "On your shopping list") with fresh data.
    router.refresh();
  }

  const label = `Add ${name} to shopping list`;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void add()}
      aria-label={label}
      title={label}
      className={cn(
        "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent hover:text-primary",
        flash && "border-primary/40 bg-primary/10 text-primary",
        className,
      )}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : flash ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <ShoppingCart className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
