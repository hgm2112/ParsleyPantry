import type { ReactNode } from "react";
import { LogoMark, TAGLINE, Wordmark } from "@/components/brand";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-10">
      <Wordmark className="text-xl" markClassName="h-9 w-11" href="/" />
      <div className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-sm">
        {children}
      </div>
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <LogoMark className="h-16 w-auto" />
        <p className="text-sm font-semibold text-foreground">{TAGLINE}</p>
        <p className="text-xs text-muted-foreground">
          One pantry for the whole household — scan, track, and shop from
          anywhere.
        </p>
      </div>
    </div>
  );
}
