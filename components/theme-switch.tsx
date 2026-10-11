"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const THEME_OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

type ThemeValue = (typeof THEME_OPTIONS)[number]["value"];

/** Three-way Light/Dark/System segmented control (Settings → Appearance). */
export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex overflow-hidden rounded-md border"
    >
      {THEME_OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => setTheme(value)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold",
            theme === value
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-accent",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

/** Compact icon button that cycles Light → Dark → System. */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const current: ThemeValue =
    theme === "light" || theme === "dark" ? theme : "system";
  const next: ThemeValue =
    current === "light" ? "dark" : current === "dark" ? "system" : "light";
  const currentLabel =
    THEME_OPTIONS.find((option) => option.value === current)?.label ?? "System";
  const nextLabel =
    THEME_OPTIONS.find((option) => option.value === next)?.label ?? "Light";
  const Icon =
    current === "system"
      ? Monitor
      : resolvedTheme === "dark"
        ? Moon
        : Sun;
  return (
    <button
      type="button"
      aria-label={`Theme: ${currentLabel}. Switch to ${nextLabel}`}
      title={`Theme: ${currentLabel} — switch to ${nextLabel}`}
      onClick={() => setTheme(next)}
      className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
