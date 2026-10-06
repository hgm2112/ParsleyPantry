"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  Package,
  Settings,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/grocery", label: "Grocery", icon: ShoppingCart },
  { href: "/recipes", label: "Recipes", icon: BookOpen },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop top nav */}
      <header className="hidden md:block border-b bg-background/95 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
          <Link href="/inventory" className="flex items-center gap-2 font-semibold">
            <span className="rounded-md bg-green-700 text-white px-2 py-0.5 text-sm">
              PP
            </span>
            ParsleyPantry
          </Link>
          <nav className="flex items-center gap-1">
            {items.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive(pathname, href)
                    ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-5">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                isActive(pathname, href)
                  ? "text-green-700 dark:text-green-400"
                  : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
