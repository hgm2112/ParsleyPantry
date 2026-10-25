"use client";

import { useEffect, useRef, useState, use } from "react";
import Link from "next/link";
import { io } from "next/cache";
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
import { useStoredEnum, useStoredJson } from "@/lib/use-local-storage";
import type { OffProduct } from "@/lib/off";
import {
  addToInventory,
  consumeInventory,
  resolveBarcode,
} from "@/app/(app)/inventory/actions";
import {
  LOCATIONS,
  LocationPicker,
  ExpirationEntries,
  FreezerFields,
  entriesToBatches,
  freezeInputFor,
  newExpirationEntry,
  type ExpirationEntryValue,
  type FreezeInput,
  type FreezeValue,
} from "@/components/inventory/entry-fields";
import {
  FREEZER_UNKNOWN_KEY,
  foodTypeByKey,
  guessFreezerFoodType,
} from "@/lib/freezer";
import { packUnitLabel } from "@/lib/stock";
import type { ItemRow, Location } from "@/lib/types";

/**
 * One line of the current trip. Lives in localStorage so the trip survives
 * navigating to the add form (or the item list) and coming back.
 */
type TripEntry = {
  key: string;
  inventoryId: string;
  itemId: string;
  name: string;
  /** Pieces added for this line (a pack item adds its full pack size). */
  added: number;
  /** Pieces one more "+1" tap adds (pack size for pack items, else 1). */
  packStep: number;
  location: Location;
  expirationDate: string | null;
  /** Exact freeze inputs used when this line was last saved (re-sent on +1). */
  freezeInput: FreezeInput;
  at: number;
};

const SOURCES = ["Meijer", "Kroger", "Amazon", "Costco", "Aldi", "Other"];

const LOCATION_KEY = "pp-shop-location";
const SOURCE_KEY = "pp-shop-source";
export const TRIP_KEY = "pp-shop-session";

const LOCATION_VALUES = ["pantry", "fridge", "freezer"] as const;

function isFreezeInput(value: unknown): value is FreezeInput {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;
  return (
    (input.frozenAt === undefined ||
      input.frozenAt === null ||
      typeof input.frozenAt === "string") &&
    (input.freezerDurationMonths === undefined ||
      input.freezerDurationMonths === null ||
      typeof input.freezerDurationMonths === "number") &&
    (input.purchasedFrozen === undefined ||
      typeof input.purchasedFrozen === "boolean") &&
    (input.freezerFoodType === undefined ||
      input.freezerFoodType === null ||
      typeof input.freezerFoodType === "string")
  );
}

function isTrip(value: unknown): value is TripEntry[] {
  if (!Array.isArray(value)) return false;
  return value.every((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const row = entry as Record<string, unknown>;
    return (
      typeof row.key === "string" &&
      typeof row.inventoryId === "string" &&
      typeof row.itemId === "string" &&
      typeof row.name === "string" &&
      typeof row.added === "number" &&
      // Trips saved before pack sizes existed lack packStep — treated as 1.
      (row.packStep === undefined ||
        (typeof row.packStep === "number" && row.packStep >= 1)) &&
      typeof row.location === "string" &&
      (LOCATION_VALUES as readonly string[]).includes(row.location) &&
      (row.expirationDate === null || typeof row.expirationDate === "string") &&
      isFreezeInput(row.freezeInput) &&
      typeof row.at === "number"
    );
  });
}

/** One batch saved from a scan (a scan may add several dated batches). */
type SavedAdd = {
  inventoryId: string;
  itemId: string;
  name: string;
  /** Pieces this add put in stock (a pack item stores its full pack size). */
  amount: number;
  /** Pieces one +1 tap adds (pack size for pack items, else 1). */
  packStep: number;
  location: Location;
  expirationDate: string | null;
  freezeInput: FreezeInput;
};

export function ShopSession({ defaultLocation }: { defaultLocation: Location }) {
  const router = useRouter();
  const [location, setLocation] = useStoredEnum<Location>(
    LOCATION_KEY,
    LOCATION_VALUES,
    defaultLocation,
  );
  const [source, setSource] = useStoredEnum(
    SOURCE_KEY,
    SOURCES as readonly string[],
    "Meijer",
  );
  const [trip, setTrip] = useStoredJson<TripEntry[]>(TRIP_KEY, [], isTrip);
  const [confirm, setConfirm] = useState<{
    item: ItemRow;
    off: OffProduct | null;
    barcode: string;
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

  /**
   * Fold a saved add into the trip: repeat scans of the same inventory row
   * accumulate instead of duplicating lines.
   */
  function recordAdd(input: {
    inventoryId: string;
    itemId: string;
    name: string;
    location: Location;
    expirationDate: string | null;
    freezeInput: FreezeInput;
    amount: number;
    /** Pieces one +1 tap adds for this line (pack size for pack items). */
    packStep: number;
  }) {
    setTrip((current) => {
      const existing = current.find(
        (entry) => entry.inventoryId === input.inventoryId,
      );
      if (existing) {
        return current.map((entry) =>
          entry.key === existing.key
            ? {
                ...entry,
                added: entry.added + input.amount,
                packStep: input.packStep,
                location: input.location,
                expirationDate: input.expirationDate,
                freezeInput: input.freezeInput,
                at: Date.now(),
              }
            : entry,
        );
      }
      return [
        {
          key: `${input.inventoryId}-${Date.now()}`,
          inventoryId: input.inventoryId,
          itemId: input.itemId,
          name: input.name,
          added: input.amount,
          packStep: input.packStep,
          location: input.location,
          expirationDate: input.expirationDate,
          freezeInput: input.freezeInput,
          at: Date.now(),
        },
        ...current,
      ];
    });
  }

  /**
   * Scanning never changes stock: it either pauses the camera for a quick
   * confirm (item already in your pantry) or hands off to the shared add form
   * (anything new). Stock moves only when one of those saves.
   */
  async function handleBarcode(code: string) {
    if (busyRef.current) return;
    const clean = code.trim();
    if (clean.length < 4) {
      toast.error(
        "That code doesn't look like a barcode — try scanning it again.",
      );
      return;
    }
    busyRef.current = true;
    try {
      const result = await resolveBarcode(clean);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { item, off } = result.data;
      if (item) {
        setConfirm({ item, off, barcode: clean });
      } else {
        router.push(
          `/inventory/add?barcode=${encodeURIComponent(clean)}&scan=${Date.now()}`,
        );
      }
    } catch {
      toast.error("Lookup failed — check your connection and try again.");
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
    setTrip((current) =>
      current
        .map((entry) =>
          entry.inventoryId === inventoryId
            ? { ...entry, added: entry.added - amount }
            : entry,
        )
        .filter((entry) => entry.added > 0),
    );
  }

  async function bump(entry: TripEntry, delta: 1 | -1) {
    if (delta === 1) {
      const result = await addToInventory({
        itemId: entry.itemId,
        name: entry.name,
        location: entry.location,
        quantity: 1,
        expirationDate: entry.expirationDate,
        source: source === "Other" ? null : source,
        ...entry.freezeInput,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setTrip((current) =>
        current.map((row) =>
          row.key === entry.key
            ? { ...row, added: row.added + entry.packStep, at: Date.now() }
            : row,
        ),
      );
      showFlash(entry.name);
    } else {
      await undoEntry(entry.inventoryId, entry.packStep);
    }
  }

  function finishTrip() {
    setTrip([]);
    router.push("/inventory");
  }

  const totalAdded = trip.reduce((sum, entry) => sum + entry.added, 0);

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
            <h1 className="text-lg font-extrabold">I just bought these</h1>
            <p className="text-xs text-muted-foreground">
              Continuous scanner · keeps rolling between items
            </p>
          </div>
        </div>
        <Button size="sm" onClick={finishTrip}>
          <CheckCircle2 /> Done
        </Button>
      </div>

      <div className="space-y-2 rounded-xl border bg-background p-3">
        <LocationPicker value={location} onChange={setLocation} />
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
          active={!confirm}
          onDetect={(code) => void handleBarcode(code)}
          className="h-[42vh] min-h-64 w-full"
        />
        {flash ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-white shadow-lg">
              <CheckCircle2 className="h-4 w-4" /> {flash} added
            </span>
          </div>
        ) : null}
      </div>

      <section className="rounded-xl border bg-background">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h2 className="text-sm font-semibold">This trip</h2>
          {trip.length > 0 ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setTrip([])}
              className="text-muted-foreground"
            >
              Clear
            </Button>
          ) : null}
        </div>
        {trip.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Scan your first item — the camera stays live between scans.
          </p>
        ) : (
          <ul className="divide-y">
            {trip.map((entry) => (
              <li key={entry.key} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{entry.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {LOCATIONS.find((l) => l.value === entry.location)?.label}
                    {entry.freezeInput.purchasedFrozen
                      ? " · purchased frozen"
                      : entry.freezeInput.frozenAt
                        ? ` · frozen ${entry.freezeInput.frozenAt}`
                        : ""}
                    {entry.expirationDate
                      ? ` · exp ${entry.expirationDate}`
                      : ""}
                  </p>
                </div>
                <span className="text-sm font-extrabold tabular-nums">
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
        tap Done when the cart is unloaded — the trip is kept on this device
        until then.
      </p>

      {confirm ? (
        <ConfirmItemSheet
          item={confirm.item}
          off={confirm.off}
          barcode={confirm.barcode}
          location={location}
          source={source}
          onClose={() => setConfirm(null)}
          onSaved={(saved) => {
            for (const row of saved) recordAdd(row);
            const name = saved[0]?.name ?? confirm.item.name;
            showFlash(name);
            setConfirm(null);
            toast.success(`Added ${name}`, {
              action: {
                label: "Undo",
                onClick: () =>
                  saved.forEach((row) => void undoEntry(row.inventoryId, row.amount)),
              },
              duration: 5000,
            });
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Quick confirm for a barcode that already exists in the pantry: quantity,
 * expiry, location and freezer state in one sheet, then back to scanning.
 */
function ConfirmItemSheet({
  item,
  off,
  barcode,
  location: initialLocation,
  source,
  onClose,
  onSaved,
}: {
  item: ItemRow;
  off: OffProduct | null;
  barcode: string;
  location: Location;
  source: string;
  onClose: () => void;
  onSaved: (saved: SavedAdd[]) => void;
}) {
  use(io());
  const [location, setLocation] = useState<Location>(initialLocation);
  const [entries, setEntries] = useState<ExpirationEntryValue[]>(() => [
    newExpirationEntry(),
  ]);
  const [freeze, setFreeze] = useState<FreezeValue>(() => ({
    frozen: true,
    mode: "now",
    foodType:
      foodTypeByKey(item.freezer_food_type)?.key ??
      guessFreezerFoodType(item.name) ??
      FREEZER_UNKNOWN_KEY,
  }));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const qtyScale = item.pack_size != null && item.pack_size > 1
    ? {
        noun: "pack",
        piecesPerUnit: item.pack_size,
        pieceNoun: packUnitLabel(item),
      }
    : undefined;
  const packStep = qtyScale?.piecesPerUnit ?? 1;

  async function save() {
    const batches = entriesToBatches(entries);
    if (batches.length === 0) {
      toast.error("Enter a quantity");
      return;
    }
    // Ref guard: a double tap must not add twice.
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const freezeInput = freezeInputFor(freeze, location);
    let result: Awaited<ReturnType<typeof addToInventory>>;
    try {
      result = await addToInventory({
        itemId: item.id,
        name: item.name,
        barcode: item.barcode ?? barcode,
        location,
        batches,
        source: source === "Other" ? null : source,
        ...freezeInput,
      });
    } catch {
      toast.error("Could not add item — check your connection and try again.");
      return;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    const inventories = result.data.inventories;
    onSaved(
      inventories.map((inventory, index) => ({
        inventoryId: inventory.id,
        itemId: inventory.item_id,
        name: inventory.item?.name ?? item.name,
        amount: batches[index]?.quantity ?? inventory.quantity,
        packStep,
        location,
        expirationDate: inventory.expiration_date,
        freezeInput,
      })),
    );
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="gap-3">
        <SheetHeader>
          <SheetTitle>{item.name}</SheetTitle>
          <SheetDescription>
            {barcode}
            {off?.brands ? ` · ${off.brands}` : ""} — already in your pantry.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4">
          <div className="space-y-2">
            <Label>Location</Label>
            <LocationPicker value={location} onChange={setLocation} />
          </div>

          <ExpirationEntries
            entries={entries}
            onChange={setEntries}
            qtyScale={qtyScale}
          />

          <FreezerFields
            location={location}
            name={item.name}
            value={freeze}
            onChange={setFreeze}
          />
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
