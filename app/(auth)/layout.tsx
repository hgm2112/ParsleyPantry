import type { ReactNode } from "react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-10">
      <Link href="/" className="flex items-center gap-2 text-xl font-semibold">
        <span className="rounded-md bg-green-700 px-2 py-1 text-sm text-white">
          PP
        </span>
        ParsleyPantry
      </Link>
      <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-sm">
        {children}
      </div>
      <p className="text-xs text-muted-foreground max-w-sm text-center">
        One pantry for the whole household — scan, track, and shop from
        anywhere.
      </p>
    </div>
  );
}
