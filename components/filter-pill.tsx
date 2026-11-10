"use client";

import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type FilterOption = {
  value: string;
  label: string;
  count: number;
};

type Tone = "primary" | "emerald" | "amber";

const PILL_BASE =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

const PILL_IDLE =
  "border-border bg-background text-muted-foreground hover:bg-accent";

const PILL_ACTIVE: Record<Tone, string> = {
  primary: "border-primary bg-primary text-primary-foreground",
  emerald: "border-emerald-600 bg-emerald-600 text-white",
  amber: "border-amber-600 bg-amber-600 text-white",
};

const COUNT_CLASS = "text-xs tabular-nums opacity-80";

/** Far-left reset pill: shown pressed when no filters are active. */
export function AllFilterPill({
  count,
  active,
  onClick,
}: {
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(PILL_BASE, active ? PILL_ACTIVE.primary : PILL_IDLE)}
    >
      All
      <span className={COUNT_CLASS}>{count}</span>
    </button>
  );
}

/** Standalone on/off pill (e.g. Low stock). */
export function ToggleFilterPill({
  label,
  count,
  active,
  tone = "amber",
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  tone?: Tone;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(PILL_BASE, active ? PILL_ACTIVE[tone] : PILL_IDLE)}
    >
      {label}
      <span className={COUNT_CLASS}>{count}</span>
    </button>
  );
}

/**
 * Single-select pill with a dropdown of options and per-option counts.
 * Selecting "All …" clears just this filter; the far-left All pill resets
 * every filter.
 */
export function FilterPill({
  label,
  allLabel,
  options,
  value,
  totalCount,
  tone = "primary",
  onChange,
}: {
  label: string;
  allLabel: string;
  options: FilterOption[];
  value: string | null;
  /** Count shown when nothing is selected (all items). */
  totalCount: number;
  tone?: Tone;
  onChange: (value: string | null) => void;
}) {
  const selected = options.find((option) => option.value === value) ?? null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Filter by ${label.toLowerCase()}`}
            className={cn(PILL_BASE, selected ? PILL_ACTIVE[tone] : PILL_IDLE)}
          />
        }
      >
        {selected ? selected.label : label}
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem
          onClick={() => onChange(null)}
          className={cn(!selected && "bg-muted font-medium")}
        >
          {allLabel}
          <span className="ml-auto pl-3 text-xs tabular-nums text-muted-foreground">
            {totalCount}
          </span>
        </DropdownMenuItem>
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              value === option.value && "bg-muted font-medium",
            )}
          >
            <span className="truncate">{option.label}</span>
            <span className="ml-auto pl-3 text-xs tabular-nums text-muted-foreground">
              {option.count}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
