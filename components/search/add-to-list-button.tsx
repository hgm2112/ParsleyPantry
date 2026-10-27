"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { addGroceryItem } from "@/app/(app)/grocery/actions";
import { cn } from "@/lib/utils";

/**
 * One-click "put this on the shopping list" control for a search result card.
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
  const [added, setAdded] = useState(false);

  async function add() {
    setBusy(true);
    const result = await addGroceryItem({
      itemId,
      name,
      unit: unit ?? null,
      categoryId: categoryId ?? null,
      quantity: 1,
      source: "manual",
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setAdded(true);
    if (result.data.created) {
      toast.success(`${result.data.name} added to your shopping list`);
      // The action only revalidates /grocery, so the "On your shopping list"
      // section above has to be re-rendered from here.
      router.refresh();
    } else {
      toast.message(`${result.data.name} is already on your list`);
    }
  }

  const label = added ? `${name} is on your shopping list` : `Add ${name} to shopping list`;

  return (
    <button
      type="button"
      disabled={busy || added}
      onClick={() => void add()}
      aria-label={label}
      title={label}
      className={cn(
        "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent hover:text-primary disabled:opacity-100",
        added && "border-primary/40 bg-primary/10 text-primary",
        className,
      )}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : added ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <ShoppingCart className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
