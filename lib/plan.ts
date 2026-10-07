export function mondayOf(date: Date): string {
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const offset = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - offset);
  return utc.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Meal-plan day index (0 = Monday … 6 = Sunday) for an ISO date. */
export function dayIndexOf(isoDate: string): number {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return (date.getUTCDay() + 6) % 7;
}

/** Label for an exact ISO date (works for rolling, non-Monday windows). */
export function dateLabel(isoDate: string): {
  weekday: string;
  dayOfMonth: string;
  month: string;
} {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return {
    weekday: date.toLocaleDateString("en-US", {
      weekday: "short",
      timeZone: "UTC",
    }),
    dayOfMonth: String(date.getUTCDate()),
    month: date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
  };
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function dayLabel(index: number, weekStart: string): {
  weekday: string;
  dayOfMonth: string;
  month: string;
} {
  const date = new Date(`${addDays(weekStart, index)}T00:00:00Z`);
  return {
    weekday: DAY_LABELS[index] ?? "",
    dayOfMonth: String(date.getUTCDate()),
    month: date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
  };
}

export function weekTitle(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(`${addDays(weekStart, 6)}T00:00:00Z`);
  const sameMonth =
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCFullYear() === end.getUTCFullYear();
  const startPart = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const endPart = end.toLocaleDateString("en-US", {
    month: sameMonth ? undefined : "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${startPart} – ${endPart}`;
}
