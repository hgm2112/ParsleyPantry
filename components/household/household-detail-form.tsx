"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addHouseholdItemToGrocery,
  deleteHouseholdItem,
  listHouseholdCanonicalCandidates,
  setHouseholdCanonical,
  updateHouseholdItem,
} from "@/app/(app)/household/actions";
import {
  HOUSEHOLD_CATEGORIES,
  HOUSEHOLD_STORAGE_LOCATIONS,
} from "@/lib/types";
import type { HouseholdItemRow } from "@/lib/types";

export function HouseholdDetailForm({ item }: { item: HouseholdItemRow }) {
  const router = useRouter();
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unit, setUnit] = useState(item.unit ?? "");
  const [category, setCategory] = useState(item.category);
  const [storage, setStorage] = useState(item.storage_location);
  const [lowThreshold, setLowThreshold] = useState(
    item.low_threshold != null ? String(item.low_threshold) : "",
  );
  const [notes, setNotes] = useState(item.notes ?? "");
  const [barcode, setBarcode] = useState(item.barcode ?? "");
  const [canonicalName, setCanonicalName] = useState("");
  const [canonicalOptions, setCanonicalOptions] = useState<
    { id: string; name: string }[]
  >([]);
  const [canonicalBusy, setCanonicalBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const result = await listHouseholdCanonicalCandidates();
      if (!alive || !result.ok) return;
      setCanonicalOptions(result.data.items);
      if (item.canonical_household_item_id) {
        const found = result.data.items.find(
          (entry) => entry.id === item.canonical_household_item_id,
        );
        if (found) setCanonicalName(found.name);
      }
    })();
    return () => {
      alive = false;
    };
  }, [item.canonical_household_item_id, item.id]);

  async function save() {
    if (busy) return;
    if (!name.trim()) {
      toast.error("Give the item a name");
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    if (qty <= 0) {
      await handleDelete();
      return;
    }
    setBusy(true);
    const result = await updateHouseholdItem(item.id, {
      name: name.trim(),
      quantity: qty,
      unit: unit.trim() || null,
      category,
      storageLocation: storage,
      lowThreshold: lowThreshold ? Number(lowThreshold) : null,
      notes: notes.trim() || null,
      barcode: barcode.trim() || null,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    // Cache Components keeps this route mounted when hidden, so mirror the
    // saved row back into local state rather than leaving stale draft values.
    const saved = result.data.item;
    setName(saved.name);
    setQuantity(String(saved.quantity));
    setUnit(saved.unit ?? "");
    setCategory(saved.category);
    setStorage(saved.storage_location);
    setLowThreshold(saved.low_threshold != null ? String(saved.low_threshold) : "");
    setNotes(saved.notes ?? "");
    setBarcode(saved.barcode ?? "");
    toast.success("Item saved");
    router.push("/household");
    router.refresh();
  }

  async function handleDelete() {
    if (busy) return;
    setBusy(true);
    const result = await deleteHouseholdItem(item.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${item.name} removed`);
    router.push("/household");
    router.refresh();
  }

  async function saveCanonical() {
    if (canonicalBusy) return;
    setCanonicalBusy(true);
    const result = await setHouseholdCanonical(
      item.id,
      canonicalName.trim() || null,
    );
    setCanonicalBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.data.canonicalName
        ? `Matches as ${result.data.canonicalName}`
        : "Match cleared",
    );
    router.refresh();
  }

  async function handleGrocery() {
    const result = await addHouseholdItemToGrocery(item.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.data.created
        ? `${result.data.name} added to shopping list`
        : "Already on the grocery list",
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href="/household" />}
          aria-label="Back to Household"
        >
          <ArrowLeft />
        </Button>
        <div>
          <h1 className="text-lg font-extrabold">{item.name}</h1>
          <p className="text-xs text-muted-foreground">
            Household supply
          </p>
        </div>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="space-y-2 rounded-xl border bg-background p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min={0}
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Input id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="rolls, boxes…" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOUSEHOLD_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Storage location</Label>
              <Select value={storage} onValueChange={(v) => setStorage(v as typeof storage)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOUSEHOLD_STORAGE_LOCATIONS.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {loc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="threshold">Running low at or below (optional)</Label>
            <Input
              id="threshold"
              type="number"
              min={0}
              step="any"
              value={lowThreshold}
              onChange={(e) => setLowThreshold(e.target.value)}
              placeholder="e.g. 4"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="barcode">Barcode</Label>
            <Input id="barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="canonical">Matches as (generic)</Label>
            <div className="flex gap-2">
              <Input
                id="canonical"
                list="household-canonical-options"
                value={canonicalName}
                onChange={(e) => setCanonicalName(e.target.value)}
                placeholder="e.g. Aluminum Foil"
                autoComplete="off"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 shrink-0 px-2.5"
                disabled={canonicalBusy}
                onClick={() => void saveCanonical()}
              >
                {canonicalBusy ? <Loader2 className="animate-spin" /> : null}
                Save
              </Button>
            </div>
            <datalist id="household-canonical-options">
              {canonicalOptions.map((option) => (
                <option key={option.id} value={option.name} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">
              Variants collapse to this generic on the shopping list (e.g.
              Reynolds Wrap → Aluminum Foil).
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" className="flex-1" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Save
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={() => void handleGrocery()}>
            Add to shopping list
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void handleDelete()}>
            <Trash2 />
            Remove
          </Button>
        </div>
      </form>
    </div>
  );
}
