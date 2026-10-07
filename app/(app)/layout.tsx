import { Suspense, type ReactNode } from "react";
import { getDal } from "@/lib/auth";
import { Nav, NavFallback } from "./nav";
import { RealtimeSync } from "./realtime-sync";

async function NavWithProfile() {
  const dal = await getDal();
  return <Nav name={dal?.profile.display_name ?? null} />;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <Suspense fallback={<NavFallback />}>
        <NavWithProfile />
      </Suspense>
      <div className="md:pl-60">
        <main className="w-full max-w-7xl mx-auto px-4 pb-28 pt-5 md:px-6 md:pb-12">
          {children}
        </main>
      </div>
      <RealtimeSync />
    </div>
  );
}
