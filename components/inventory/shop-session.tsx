"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Minus,
  Plus,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Scanner } from "@/components/scanner";
import { addDays, suggestExpiration } from "@/lib/expiry";
import { useStoredEnum } from "@/lib/use-local-storage";
import type { OffProduct } from "@/lib/off";
import {
  addToInventory,
  consumeInventory,
  resolveBarcode,
} from "@/app/(app)/inventory/actions";
import type { ItemRow, Location } from "@/lib/types";
import { cn } from "@/lib/utils";

type SessionEntry = {
  key: string;
  inventoryId: string;
  itemId: string;
  name: string;
  added: number;
  location: Location;
  expirationDate: string | null;
  at: number;
};

const LOCATIONS: { value: Location; label: string }[] = [
  { value: "pantry", label: "Pantry" },
  { value: "fridge", label: "Fridge" },
  { value: "freezer", label: "Freezer" },
];

const SOURCES = ["Meijer", "Kroger", "Amazon", "Costco", "Aldi", "Other"];

const LOCATION_KEY = "pp-shop-location";
const SOURCE_KEY = "pp-shop-source";

export function ShopSession({ defaultLocation }: { defaultLocation: Location }) {
  const router = useRouter();
  const [location, setLocation] = useStoredEnum<Location>(
    LOCATION_KEY,
    ["pantry", "fridge", "freezer"] as const,
    defaultLocation,
  );
  const [source, setSource] = useStoredEnum(
    SOURCE_KEY,
    SOURCES as readonly string[],
    "Meijer",
  );
  const [session, setSession] = useState<SessionEntry[]>([]);
  const [pending, setPending] = useState<{
    barcode: string;
    off: OffProduct | null;
  } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const busyRef = useRef(false);
  const flashTimer = useRef<number | undefined>(undefined);

  function showFlash(name: string) {
    setFlash(name);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1400);
  }

  useEffect(() => {
    return () => window.clearTimeout(flashTimer.current);
  }, []);

  async function addKnown(item: ItemRow) {
    const expirationDate =
      item.expiration_days != null ? addDays(item.expiration_days) : null;

    const result = await addToInventory({
      itemId: item.id,
      name: item.name,
      barcode: item.barcode,
      location,
      quantity: 1,
      source: source === "Other" ? null : source,
      expirationDate,
    });

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    const inventory = result.data.inventory;
    showFlash(item.name);
    setSession((current) => {
      const existing = current.find(
        (entry) => entry.inventoryId === inventory.id,
      );
      if (existing) {
        return current.map((entry) =>
          entry.key === existing.key
            ? { ...entry, added: entry.added + 1, at: Date.now() }
            : entry,
        );
      }
      return [
        {
          key: `${inventory.id}-${Date.now()}`,
          inventoryId: inventory.id,
          itemId: item.id,
          name: item.name,
          added: 1,
          location,
          expirationDate,
          at: Date.now(),
        },
        ...current,
      ];
    });

    toast.success(`Added ${item.name}`, {
      action: {
        label: "Undo",
        onClick: () => void undoEntry(inventory.id, 1),
      },
      duration: 5000,
    });
  }

  async function handleBarcode(code: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const result = await resolveBarcode(code);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { item, off } = result.data;
      if (item) {
        await addKnown(item);
      } else {
        setPending({ barcode: code, off });
      }
    } finally {
      busyRef.current = false;
    }
  }

  async function undoEntry(inventoryId: string, amount: number) {
    const result = await consumeInventory({
      inventoryId,
      amount,
      addToGrocery: false,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSession((current) =>
      current
        .map((entry) =>
          entry.inventoryId === inventoryId
            ? { ...entry, added: entry.added - amount }
            : entry,
        )
        .filter((entry) => entry.added > 0),
    );
  }

  async function bump(entry: SessionEntry, delta: 1 | -1) {
    if (delta === 1) {
      const result = await addToInventory({
        itemId: entry.itemId,
        name: entry.name,
        location: entry.location,
        quantity: 1,
        expirationDate: entry.expirationDate,
        source: source === "Other" ? null : source,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSession((current) =>
        current.map((row) =>
          row.key === entry.key
            ? { ...row, added: row.added + 1, at: Date.now() }
            : row,
        ),
      );
      showFlash(entry.name);
    } else {
      await undoEntry(entry.inventoryId, 1);
    }
  }

  const totalAdded = session.reduce((sum, entry) => sum + entry.added, 0);

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            render={<Link href="/inventory" />}
            aria-label="Back to inventory"
          >
            <ArrowLeft />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">I just bought these</h1>
            <p className="text-xs text-muted-foreground">
              Continuous scanner · keeps rolling between items
            </p>
          </div>
        </div>
        <Button size="sm" render={<Link href="/inventory" />}>
          <CheckCircle2 /> Done
        </Button>
      </div>

      <div className="space-y-2 rounded-xl border bg-background p-3">
        <div className="grid grid-cols-3 gap-2">
          {LOCATIONS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              onClick={() => setLocation(entry.value)}
              className={cn(
                "rounded-md border px-2 py-1.5 text-sm font-medium transition-colors",
                location === entry.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="shop-source" className="text-xs text-muted-foreground">
            Source
          </Label>
          <Select
            value={source}
            onValueChange={(value) => setSource(value ?? "Meijer")}
          >
            <SelectTrigger id="shop-source" className="h-8 w-40 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCES.map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {entry}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="ml-auto text-xs text-muted-foreground">
            {totalAdded} added this trip
          </span>
        </div>
      </div>

      <div className="relative">
        <Scanner
          active={!pending}
          onDetect={(code) => void handleBarcode(code)}
          className="h-[42vh] min-h-64 w-full"
        />
        {flash ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-white shadow-lg">
              <CheckCircle2 className="h-4 w-4" /> {flash} added
            </span>
          </div>
        ) : null}
      </div>

      <section className="rounded-xl border bg-background">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h2 className="text-sm font-medium">This trip</h2>
          {session.length > 0 ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setSession([])}
              className="text-muted-foreground"
            >
              Clear
            </Button>
          ) : null}
        </div>
        {session.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Scan your first item — the camera stays live between scans.
          </p>
        ) : (
          <ul className="divide-y">
            {session.map((entry) => (
              <li key={entry.key} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{entry.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {LOCATIONS.find((l) => l.value === entry.location)?.label}
                    {entry.expirationDate ? ` · exp ${entry.expirationDate}` : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  +{entry.added}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Remove one ${entry.name}`}
                  onClick={() => void bump(entry, -1)}
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Add one more ${entry.name}`}
                  onClick={() => void bump(entry, 1)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Undo ${entry.name}`}
                  onClick={() => void undoEntry(entry.inventoryId, entry.added)}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-xs text-muted-foreground">
        After shopping with Meijer Shop &amp; Scan, keep the camera rolling and
        tap Done when the cart is unloaded.
      </p>

      {pending ? (
        <UnknownItemSheet
          barcode={pending.barcode}
          off={pending.off}
          location={location}
          source={source}
          onClose={() => setPending(null)}
          onSaved={(name, inventoryId, itemId, expirationDate) => {
            setSession((current) => [
              {
                key: `${inventoryId}-${Date.now()}`,
                inventoryId,
                itemId,
                name,
                added: 1,
                location,
                expirationDate,
                at: Date.now(),
              },
              ...current,
            ]);
            showFlash(name);
            setPending(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function UnknownItemSheet({
  barcode,
  off,
  location,
  source,
  onClose,
  onSaved,
}: {
  barcode: string;
  off: OffProduct | null;
  location: Location;
  source: string;
  onClose: () => void;
  onSaved: (
    name: string,
    inventoryId: string,
    itemId: string,
    expirationDate: string | null,
  ) => void;
}) {
  const [name, setName] = useState(off?.name ?? "");
  const [quantity, setQuantity] = useState(1);
  const [expiryTouched, setExpiryTouched] = useState(false);
  const [manualExpiry, setManualExpiry] = useState("");
  const [busy, setBusy] = useState(false);

  const suggestion = suggestExpiration(off?.categories ?? [], off?.name ?? name);
  const expirationDate = expiryTouched
    ? manualExpiry
    : suggestion
      ? addDays(suggestion.days)
      : "";

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Give the item a name");
      return;
    }
    setBusy(true);
    const result = await addToInventory({
      name: trimmed,
      barcode,
      location,
      quantity,
      expirationDate: expirationDate || null,
      source: source === "Other" ? null : source,
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    const inventory = result.data.inventory;
    onSaved(
      inventory.item?.name ?? trimmed,
      inventory.id,
      inventory.item_id,
      inventory.expiration_date,
    );
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="gap-3">
        <SheetHeader>
          <SheetTitle>New item</SheetTitle>
          <SheetDescription>
            {barcode}
            {off?.brands ? ` · ${off.brands}` : ""} — not in your pantry yet.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-2 px-4">
          <Label htmlFor="unknown-name">Name</Label>
          <Input
            id="unknown-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="What did you buy?"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3 px-4">
          <div className="space-y-2">
            <Label>Quantity</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Decrease quantity"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              >
                −
              </Button>
              <span className="flex-1 text-center text-lg font-semibold tabular-nums">
                {quantity}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Increase quantity"
                onClick={() => setQuantity((value) => value + 1)}
              >
                <Plus />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="unknown-expiry">Expiration</Label>
            <Input
              id="unknown-expiry"
              type="date"
              value={expirationDate}
              onChange={(event) => {
                setExpiryTouched(true);
                setManualExpiry(event.target.value);
              }}
            />
            {suggestion ? (
              <button
                type="button"
                className="text-xs font-medium text-primary"
                onClick={() => {
                  setExpiryTouched(true);
                  setManualExpiry(addDays(suggestion.days));
                }}
              >
                Use {suggestion.days}d ({suggestion.reason})
              </button>
            ) : null}
          </div>
        </div>

        <SheetFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={save} disabled={busy} className="flex-1">
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
            Add &amp; keep scanning
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
