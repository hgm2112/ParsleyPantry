import type { ReactNode } from "react";
import { Nav } from "./nav";
import { RealtimeSync } from "./realtime-sync";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <Nav />
      <main className="flex-1 w-full max-w-5xl mx-auto px-3 pb-28 pt-4 md:px-6 md:pb-10">
        {children}
      </main>
      <RealtimeSync />
    </div>
  );
}
