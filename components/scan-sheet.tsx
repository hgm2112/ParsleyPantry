"use client";

import { useRef, useState } from "react";
import { ScanBarcode } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Scanner } from "@/components/scanner";

type ScanSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBarcode: (barcode: string) => void;
  title?: string;
  description?: string;
};

/**
 * Reusable full-screen scanner with a manual-entry fallback. The callback is
 * invoked once per detected code; the parent decides where to go next.
 */
export function ScanSheet({
  open,
  onOpenChange,
  onBarcode,
  title = "Scan barcode",
  description = "Point the camera at the barcode on the package.",
}: ScanSheetProps) {
  const [manual, setManual] = useState("");
  const lastRef = useRef(0);

  function emit(barcode: string) {
    const now = Date.now();
    if (now - lastRef.current < 800) return;
    lastRef.current = now;
    onBarcode(barcode.trim());
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setManual("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md gap-4 p-4 sm:p-6">
        <DialogHeader className="text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Scanner
          active={open}
          onDetect={emit}
          className="aspect-[4/3] w-full"
        />
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (manual.trim()) emit(manual);
          }}
        >
          <Input
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Enter barcode manually"
            value={manual}
            onChange={(event) => setManual(event.target.value)}
          />
          <button type="submit" className="sr-only">
            Look up
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ScanButton({
  onClick,
  label = "Scan",
  className,
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        className ??
        "inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2.5 text-sm font-medium hover:bg-accent"
      }
    >
      <ScanBarcode className="h-4 w-4" />
      {label}
    </button>
  );
}
