"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addDays, startOfToday, toDateString } from "@/lib/expiry";
import {
  FREEZER_FOOD_TYPES,
  FREEZER_GROUPS,
  FREEZER_UNKNOWN_KEY,
  computeFreezerQualityDate,
  foodTypeByKey,
} from "@/lib/freezer";
import type { Location } from "@/lib/types";
import { cn } from "@/lib/utils";

export const LOCATIONS: { value: Location; label: string }[] = [
  { value: "pantry", label: "Pantry" },
  { value: "fridge", label: "Fridge" },
  { value: "freezer", label: "Freezer" },
];

/** Quantity control shared by the add form and the Just Bought confirm sheet. */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  buttonMin,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  /** Lower bound the − button steps down to. */
  min?: number;
  /** Lower bound accepted while typing (defaults to 0 so 0.5 is typeable). */
  buttonMin?: number;
  className?: string;
}) {
  const floor = buttonMin ?? 0;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </Button>
      <Input
        type="number"
        min={floor}
        step="any"
        value={value}
        onChange={(event) => onChange(Math.max(floor, Number(event.target.value) || 0))}
        className="text-center"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Increase quantity"
        onClick={() => onChange(value + 1)}
      >
        <Plus />
      </Button>
    </div>
  );
}

/** Pantry / Fridge / Freezer segmented control. */
export function LocationPicker({
  value,
  onChange,
  className,
}: {
  value: Location;
  onChange: (value: Location) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {LOCATIONS.map((entry) => (
        <button
          key={entry.value}
          type="button"
          onClick={() => onChange(entry.value)}
          className={cn(
            "rounded-md border px-3 py-2 text-sm font-semibold transition-colors",
            value === entry.value
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-accent",
          )}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

/**
 * What the freezer fields mean for a batch being added:
 * - frozen false        → in the freezer but not tracked (no freeze info)
 * - frozen + "now"      → freezing today: frozen_at = today, quality date from
 *                          the food type's recommended months
 * - frozen + "purchased"→ bought already frozen: frozen_at stays null, no
 *                          countdown is invented
 */
export type FreezeValue = {
  frozen: boolean;
  mode: "now" | "purchased";
  /** FREEZER_UNKNOWN_KEY or a key from lib/freezer.ts. */
  foodType: string;
};

export type FreezeInput = {
  frozenAt?: string | null;
  freezerDurationMonths?: number | null;
  purchasedFrozen?: boolean;
  freezerFoodType?: string | null;
};

export function defaultFreezeValue(): FreezeValue {
  return { frozen: true, mode: "now", foodType: FREEZER_UNKNOWN_KEY };
}

/** Maps the UI state to addToInventory/updateInventory freeze inputs. */
export function freezeInputFor(value: FreezeValue, location: Location): FreezeInput {
  if (location !== "freezer" || !value.frozen) return {};
  if (value.mode === "purchased") {
    return {
      purchasedFrozen: true,
      frozenAt: null,
      freezerDurationMonths: null,
    };
  }
  const type = foodTypeByKey(value.foodType);
  const input: FreezeInput = {
    purchasedFrozen: false,
    frozenAt: toDateString(startOfToday()),
    freezerDurationMonths: type?.months ?? null,
  };
  if (type) input.freezerFoodType = type.key;
  return input;
}

function longDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const MODES: { value: FreezeValue["mode"]; label: string }[] = [
  { value: "now", label: "Freezing it now" },
  { value: "purchased", label: "Already frozen when purchased" },
];

/**
 * Frozen toggle + how it was frozen. Renders nothing outside the freezer so
 * pantry/fridge adds keep the plain location-only flow.
 */
export function FreezerFields({
  location,
  name,
  value,
  onChange,
}: {
  location: Location;
  /** Used to warn about food types with no validated duration. */
  name: string;
  value: FreezeValue;
  onChange: (next: FreezeValue) => void;
}) {
  if (location !== "freezer") return null;

  const type = value.mode === "now" ? foodTypeByKey(value.foodType) : null;
  const months = value.mode === "now" && type ? type.months : null;
  const qualityDate =
    value.mode === "now" && type && months != null
      ? computeFreezerQualityDate(toDateString(startOfToday()), months)
      : null;

  const preview =
    value.mode === "purchased"
      ? "No quality date — purchased frozen, original freezing date unknown. Record the date later from the batch's freezer details if you find it."
      : type && months != null && qualityDate
        ? `Best quality by ${longDate(qualityDate)} · ${months} month${months === 1 ? "" : "s"} from today`
        : "No quality date — pick a food type to track one.";

  const foodTypeItems = [
    { value: FREEZER_UNKNOWN_KEY, label: "Not sure — don't track a date" },
    ...Object.values(FREEZER_FOOD_TYPES).map((entry) => ({
      value: entry.key,
      label: entry.label,
    })),
  ];

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={value.frozen}
          onCheckedChange={(checked) =>
            onChange({ ...value, frozen: checked === true })
          }
        />
        Frozen
      </label>

      {value.frozen ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {MODES.map((entry) => (
              <button
                key={entry.value}
                type="button"
                onClick={() => onChange({ ...value, mode: entry.value })}
                className={cn(
                  "rounded-md border px-2 py-2 text-xs font-semibold transition-colors",
                  value.mode === entry.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {value.mode === "now" ? (
            <div className="space-y-1.5">
              <Label>What is it?</Label>
              <Select
                value={value.foodType}
                items={foodTypeItems}
                onValueChange={(next) =>
                  onChange({ ...value, foodType: next ?? FREEZER_UNKNOWN_KEY })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick a food type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FREEZER_UNKNOWN_KEY}>
                    Not sure — don&apos;t track a date
                  </SelectItem>
                  {FREEZER_GROUPS.map((group) => (
                    <SelectGroup key={group}>
                      <SelectLabel>{group}</SelectLabel>
                      {Object.values(FREEZER_FOOD_TYPES)
                        .filter((entry) => entry.group === group)
                        .map((entry) => (
                          <SelectItem key={entry.key} value={entry.key}>
                            {entry.label}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {type?.warning ? (
                <p className="text-xs text-orange-700 dark:text-orange-300">
                  {type.warning}
                </p>
              ) : null}
            </div>
          ) : null}

          <p className="rounded-lg border bg-muted/50 px-3 py-2 text-xs font-semibold">
            {preview}
          </p>

          <p className="text-xs text-muted-foreground">
            Refrigerated expiration date is kept as-is — the quality date never
            replaces it{name ? ` for ${name}` : ""}.
          </p>
        </div>
      ) : null}
    </div>
  );
}

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

type DateParts = { year: number | null; month: number | null; day: number | null };

function partsFromIso(value: string | null): DateParts {
  if (!value) return { year: null, month: null, day: null };
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return { year: null, month: null, day: null };
  return { year, month, day };
}

function isoFromParts(parts: DateParts): string | null {
  if (parts.year == null || parts.month == null || parts.day == null) return null;
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/**
 * Month / Day / Year dropdowns that emit an ISO date (or null while incomplete).
 * Days clamp to the selected month and the year list spans current−1…current+10.
 * Key callers by the value so an external change (chips) resets the dropdowns.
 */
export function DateSelect({
  value,
  onChange,
  className,
  disabled,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [parts, setParts] = useState<DateParts>(() => partsFromIso(value));

  const currentYear = startOfToday().getFullYear();
  const years: number[] = [];
  for (let year = currentYear + 10; year >= currentYear - 1; year -= 1) {
    years.push(year);
  }

  function commit(next: DateParts) {
    let day = next.day;
    if (next.month != null && day != null) {
      const maxDay = daysInMonth(next.year ?? currentYear, next.month);
      if (day > maxDay) day = maxDay;
    }
    const clamped: DateParts = { ...next, day };
    setParts(clamped);
    onChange(isoFromParts(clamped));
  }

  const monthItems = MONTH_LABELS.map((label, index) => ({
    value: String(index + 1),
    label,
  }));
  const maxDay = daysInMonth(parts.year ?? currentYear, parts.month ?? 1);
  const dayItems = Array.from({ length: maxDay }, (_, index) => ({
    value: String(index + 1),
    label: String(index + 1),
  }));
  const yearItems = years.map((year) => ({ value: String(year), label: String(year) }));

  return (
    <div className={cn("grid grid-cols-[1.6fr_0.8fr_1fr] gap-1.5", className)}>
      <Select
        value={parts.month != null ? String(parts.month) : null}
        items={monthItems}
        onValueChange={(next) => commit({ ...parts, month: next ? Number(next) : null })}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Month" />
        </SelectTrigger>
        <SelectContent>
          {monthItems.map((entry) => (
            <SelectItem key={entry.value} value={entry.value}>
              {entry.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={parts.day != null ? String(parts.day) : null}
        items={dayItems}
        onValueChange={(next) => commit({ ...parts, day: next ? Number(next) : null })}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Day" />
        </SelectTrigger>
        <SelectContent>
          {dayItems.map((entry) => (
            <SelectItem key={entry.value} value={entry.value}>
              {entry.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={parts.year != null ? String(parts.year) : null}
        items={yearItems}
        onValueChange={(next) => commit({ ...parts, year: next ? Number(next) : null })}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Year" />
        </SelectTrigger>
        <SelectContent>
          {yearItems.map((entry) => (
            <SelectItem key={entry.value} value={entry.value}>
              {entry.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** One dated quantity line: blank-by-default quantity + M/D/Y date + quick chips. */
export type ExpirationEntryValue = {
  id: string;
  quantity: string;
  date: string | null;
  /** Bumped by chip/clear clicks so the date dropdowns reset to the new value. */
  bump?: number;
};

export function newExpirationEntry(
  date: string | null = null,
  quantity = "",
): ExpirationEntryValue {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return { id, quantity, date, bump: 0 };
}

function formatTotal(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/**
 * What the per-row quantities count when the item is bought in packs:
 * rows are entered in packs, while stored stock is pieces (12 packets
 * per pack).
 */
export type QtyScale = {
  /** What one entered unit is called ("pack"). */
  noun: string;
  /** Pieces one entered unit equals (12 → "1 pack = 12 packets"). */
  piecesPerUnit: number;
  /** What a stored piece is called ("packets", "eggs"). */
  pieceNoun: string;
};

/** Collapses blank/zero rows and merges duplicate dates into dated batches. */
export function entriesToBatches(
  entries: ExpirationEntryValue[],
): { quantity: number; expirationDate: string | null }[] {
  const merged = new Map<string, { quantity: number; expirationDate: string | null }>();
  for (const entry of entries) {
    const quantity = Number(entry.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const key = entry.date ?? "__none__";
    const existing = merged.get(key);
    if (existing) existing.quantity += quantity;
    else merged.set(key, { quantity, expirationDate: entry.date });
  }
  return [...merged.values()];
}

const EXPIRY_CHIP =
  "rounded-full border-2 px-2 py-0.5 text-muted-foreground disabled:opacity-50";

/**
 * Repeatable expiration rows: a quantity per date, chips under each date, and a
 * read-only running total. `single` locks it to one row for edit/patch flows.
 */
export function ExpirationEntries({
  entries,
  onChange,
  single = false,
  disabled = false,
  qtyScale,
}: {
  entries: ExpirationEntryValue[];
  onChange: (entries: ExpirationEntryValue[]) => void;
  single?: boolean;
  disabled?: boolean;
  /** Set when rows count packs and stored stock counts pieces. */
  qtyScale?: QtyScale;
}) {
  const total = entries.reduce((sum, entry) => {
    const value = Number(entry.quantity);
    return Number.isFinite(value) && value > 0 ? sum + value : sum;
  }, 0);

  function update(id: string, patch: Partial<ExpirationEntryValue>) {
    onChange(entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }

  /** Chip/clear edits bump so the dropdowns remount even when the date is unchanged. */
  function setDate(id: string, date: string | null) {
    onChange(
      entries.map((entry) =>
        entry.id === id
          ? { ...entry, date, bump: (entry.bump ?? 0) + 1 }
          : entry,
      ),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label>Expiration</Label>
        {!single ? (
          <span className="text-xs text-muted-foreground">
            {qtyScale ? `${qtyScale.noun}s for each date` : "Quantity for each date"}
          </span>
        ) : null}
      </div>

      {entries.map((entry) => (
        <div key={entry.id} className="space-y-2 rounded-lg border bg-muted/20 p-2.5">
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              placeholder={qtyScale ? `Qty (${qtyScale.noun}s)` : "Qty"}
              aria-label="Quantity for this date"
              value={entry.quantity}
              onChange={(event) => update(entry.id, { quantity: event.target.value })}
              disabled={disabled}
              className="w-16 shrink-0 text-center"
            />
            <DateSelect
              key={`${entry.id}:${entry.date ?? "none"}:${entry.bump ?? 0}`}
              value={entry.date}
              onChange={(date) => update(entry.id, { date })}
              disabled={disabled}
              className="flex-1"
            />
            {!single && entries.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove this date"
                onClick={() => onChange(entries.filter((row) => row.id !== entry.id))}
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              className={EXPIRY_CHIP}
              onClick={() => setDate(entry.id, null)}
              disabled={disabled}
            >
              No expiry
            </button>
            <button
              type="button"
              className={EXPIRY_CHIP}
              onClick={() => setDate(entry.id, addDays(7))}
              disabled={disabled}
            >
              +7 days
            </button>
            <button
              type="button"
              className={EXPIRY_CHIP}
              onClick={() => setDate(entry.id, addDays(14))}
              disabled={disabled}
            >
              +14 days
            </button>
            <button
              type="button"
              className={EXPIRY_CHIP}
              onClick={() => setDate(entry.id, addDays(21))}
              disabled={disabled}
            >
              +21 days
            </button>
          </div>
        </div>
      ))}

      {!single ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full border-dashed"
          onClick={() => onChange([...entries, newExpirationEntry()])}
          disabled={disabled}
        >
          <Plus className="h-4 w-4" /> another date
        </Button>
      ) : null}

      {!single ? (
        <p className="w-fit rounded-md border bg-muted/40 px-3 py-1.5 text-sm font-semibold tabular-nums">
          Total Quantity: {formatTotal(total)}
          {qtyScale
            ? ` ${qtyScale.noun}${total === 1 ? "" : "s"}` +
              (qtyScale.piecesPerUnit !== 1
                ? ` (= ${formatTotal(total * qtyScale.piecesPerUnit)} ${qtyScale.pieceNoun})`
                : "")
            : null}
        </p>
      ) : null}
    </div>
  );
}
