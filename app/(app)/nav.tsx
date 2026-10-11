"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  ChartColumn,
  House,
  Package,
  Search,
  Settings,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFullscreen, setFullscreen } from "@/lib/fullscreen";
import { useHour } from "@/lib/use-now";
import { LogoMark, TAGLINE, Wordmark, brandClassName } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-switch";

const sidebarItems = [
  { href: "/home", label: "Home", icon: House },
  { href: "/plan", label: "Meal plan", icon: CalendarDays },
  { href: "/inventory", label: "Pantry", icon: Package },
  { href: "/grocery", label: "Shopping list", icon: ShoppingCart },
  { href: "/recipes", label: "Recipes", icon: BookOpen },
  { href: "/stats", label: "Stats", icon: ChartColumn },
  { href: "/settings", label: "Settings", icon: Settings },
];

const mobileItems = [
  { href: "/home", label: "Home", icon: House },
  { href: "/inventory", label: "Pantry", icon: Package },
  { href: "/grocery", label: "Shopping", icon: ShoppingCart },
  { href: "/recipes", label: "Recipes", icon: BookOpen },
  { href: "/plan", label: "Plan", icon: CalendarDays },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function greetingFor(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Time-of-day greeting; hour comes from the client snapshot post-hydration. */
export function Greeting({ name }: { name: string | null }) {
  const hour = useHour();
  return (
    <span>
      {greetingFor(hour)}, {name ?? "you"}
    </span>
  );
}

export function SearchForm({ className }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form
      onSubmit={submit}
      role="search"
      className={cn("relative w-full max-w-md", className)}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search for recipes, ingredients, or meals…"
        className="h-9 w-full rounded-full border border-input bg-muted/60 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/40"
      />
    </form>
  );
}

export function NavFallback() {
  return (
    <>
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col border-r bg-sidebar">
        <div className="flex h-16 items-center px-5">
          <span className="h-6 w-36 rounded bg-muted" />
        </div>
        <div className="flex-1 space-y-1 px-3">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="h-9 rounded-lg bg-muted/60" />
          ))}
        </div>
      </aside>
      <header className="md:pl-60 border-b bg-background/95 backdrop-blur sticky top-0 z-40">
        <div className="flex h-14 items-center gap-4 px-4">
          <span className="h-9 w-full max-w-md rounded-full bg-muted" />
        </div>
      </header>
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 border-t bg-background/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid h-full grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center justify-center">
              <span className="h-5 w-5 rounded bg-muted" />
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}

function SidebarNav({ pathname }: { pathname: string }) {
  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col border-r bg-sidebar z-40">
      <div className="flex h-16 items-center px-5">
        <Wordmark markClassName="h-8.75 w-10" />
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {sidebarItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-normal transition-colors",
              isActive(pathname, href)
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="flex flex-col items-center gap-2 border-t px-4 py-5">
        <LogoMark className="h-24 w-auto" />
        <p className="text-center text-xs font-normal italic text-muted-foreground">
          <span className={brandClassName}>{TAGLINE}</span>
        </p>
      </div>
    </aside>
  );
}

function MobileHeader() {
  return (
    <header className="md:hidden sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur">
      <Wordmark href="/home" className="text-base" markClassName="h-7.5 w-8.75" />
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <Link
          href="/stats"
          aria-label="Stats"
          className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChartColumn className="h-5 w-5" />
        </Link>
        <Link
          href="/search"
          aria-label="Search"
          className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Search className="h-5 w-5" />
        </Link>
        <Link
          href="/settings"
          aria-label="Settings"
          className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Settings className="h-5 w-5" />
        </Link>
      </div>
    </header>
  );
}

function DesktopHeader({ name }: { name: string | null }) {
  return (
    <header className="hidden md:block sticky top-0 z-30 border-b bg-background/95 backdrop-blur md:pl-60">
      <div className="flex h-14 items-center gap-4 px-6">
        <SearchForm />
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            <Greeting name={name} />
          </span>
          <ThemeToggle />
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground"
          >
            {(name ?? "p").slice(0, 1).toUpperCase()}
          </Link>
        </div>
      </div>
    </header>
  );
}

function MobileNav({ pathname }: { pathname: string }) {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-5">
        {mobileItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition-colors",
              isActive(pathname, href)
                ? "text-primary"
                : "text-muted-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function Nav({ name }: { name: string | null }) {
  const pathname = usePathname();
  const fullscreen = useFullscreen();

  // Fullscreen is a transient, grocery-page-only state: any navigation away
  // resets it so a back-button visit can't leave the shell stuck hidden.
  useEffect(() => {
    setFullscreen(false);
  }, [pathname]);

  const hideMobileChrome =
    fullscreen && (pathname === "/grocery" || pathname.startsWith("/grocery/"));

  return (
    <>
      <SidebarNav pathname={pathname} />
      {!hideMobileChrome && <MobileHeader />}
      <DesktopHeader name={name} />
      {!hideMobileChrome && <MobileNav pathname={pathname} />}
    </>
  );
}
