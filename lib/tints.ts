/**
 * Stable pastel tint per category/aisle label, mirroring the mockup's
 * colored group headers (Produce = green, Dairy = purple, Pantry = amber…).
 */

export type Tint = {
  /** Header background + border classes. */
  header: string;
  /** Muted icon/text color. */
  icon: string;
  /** Solid swatch color for dots/chips. */
  dot: string;
};

const TINTS: Tint[] = [
  {
    header:
      "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950 dark:border-emerald-900 dark:text-emerald-200",
    icon: "text-emerald-600 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  {
    header:
      "bg-violet-50 border-violet-200 text-violet-900 dark:bg-violet-950 dark:border-violet-900 dark:text-violet-200",
    icon: "text-violet-600 dark:text-violet-300",
    dot: "bg-violet-500",
  },
  {
    header:
      "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950 dark:border-amber-900 dark:text-amber-200",
    icon: "text-amber-600 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  {
    header:
      "bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-950 dark:border-sky-900 dark:text-sky-200",
    icon: "text-sky-600 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  {
    header:
      "bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950 dark:border-rose-900 dark:text-rose-200",
    icon: "text-rose-600 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  {
    header:
      "bg-lime-50 border-lime-200 text-lime-900 dark:bg-lime-950 dark:border-lime-900 dark:text-lime-200",
    icon: "text-lime-600 dark:text-lime-300",
    dot: "bg-lime-500",
  },
  {
    header:
      "bg-purple-50 border-purple-200 text-purple-900 dark:bg-purple-950 dark:border-purple-900 dark:text-purple-200",
    icon: "text-purple-600 dark:text-purple-300",
    dot: "bg-purple-500",
  },
  {
    header:
      "bg-cyan-50 border-cyan-200 text-cyan-900 dark:bg-cyan-950 dark:border-cyan-900 dark:text-cyan-200",
    icon: "text-cyan-600 dark:text-cyan-300",
    dot: "bg-cyan-500",
  },
];

/** Well-known labels get semantically matching tints first. */
const PREFERRED: Record<string, number> = {
  produce: 0,
  fruits: 0,
  vegetables: 0,
  bakery: 2,
  bread: 2,
  pantry: 2,
  "meat & seafood": 4,
  meat: 4,
  seafood: 4,
  dairy: 1,
  "dairy & eggs": 1,
  eggs: 1,
  frozen: 3,
  drinks: 3,
  beverages: 3,
  snacks: 5,
  sweets: 5,
  household: 6,
  other: 7,
};

export function tintFor(label: string): Tint {
  const key = label.trim().toLowerCase();
  const preferred = PREFERRED[key];
  if (preferred !== undefined) return TINTS[preferred];

  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash << 5) - hash + key.charCodeAt(index);
    hash |= 0;
  }
  return TINTS[Math.abs(hash) % TINTS.length];
}
