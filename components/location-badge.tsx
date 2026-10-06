import { Package, Refrigerator, Snowflake } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Location } from "@/lib/types";

const config: Record<
  Location,
  { label: string; icon: typeof Package; className: string }
> = {
  pantry: {
    label: "Pantry",
    icon: Package,
    className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
  fridge: {
    label: "Fridge",
    icon: Refrigerator,
    className: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  },
  freezer: {
    label: "Freezer",
    icon: Snowflake,
    className: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  },
};

export function LocationBadge({
  location,
  showLabel = true,
  className,
}: {
  location: Location;
  showLabel?: boolean;
  className?: string;
}) {
  const entry = config[location];
  const Icon = entry.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        entry.className,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {showLabel ? entry.label : null}
    </span>
  );
}

export function locationLabel(location: Location): string {
  return config[location].label;
}
