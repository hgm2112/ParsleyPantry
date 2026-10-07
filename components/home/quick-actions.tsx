"use client";

import Link from "next/link";
import {
  CalendarRange,
  Package,
  Search,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ACTIONS = [
  {
    href: "/inventory/add",
    label: "Add to Pantry",
    icon: Package,
    className:
      "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border-emerald-100",
  },
  {
    href: "/grocery",
    label: "Add to Shopping List",
    icon: ShoppingCart,
    className: "bg-rose-50 text-rose-800 hover:bg-rose-100 border-rose-100",
  },
  {
    href: "/plan",
    label: "Plan Meals",
    icon: CalendarRange,
    className: "bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-100",
  },
  {
    href: "/recipes",
    label: "Find Recipes",
    icon: Search,
    className:
      "bg-violet-50 text-violet-800 hover:bg-violet-100 border-violet-100",
  },
];

export function QuickActions() {
  return (
    <section className="flex h-full flex-col rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-extrabold">Quick Actions</h2>
      <div className="grid flex-1 grid-cols-2 gap-2.5 auto-rows-fr">
        {ACTIONS.map(({ href, label, icon: Icon, className }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-start justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-shadow hover:shadow-sm",
              className,
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="leading-tight">{label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
