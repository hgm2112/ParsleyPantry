"use client";

import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Read-only "Matches recipes as X" popover trigger. For surfaces where the
 * whole card is already a link (search results) — the inventory card keeps
 * its own view-plus-edit popover.
 */
export function CanonicalInfo({ name }: { name: string }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Info className="h-3.5 w-3.5 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground" />
        }
      />
      <PopoverContent align="start" sideOffset={4} className="max-w-xs">
        <p className="text-xs text-muted-foreground">Matches recipes as</p>
        <p className="truncate text-sm font-medium">{name}</p>
      </PopoverContent>
    </Popover>
  );
}
