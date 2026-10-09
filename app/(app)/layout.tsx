import { Suspense, type ReactNode } from "react";
import { getDal } from "@/lib/auth";
import { AppMain } from "@/components/app-main";
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
        <AppMain>{children}</AppMain>
      </div>
      <RealtimeSync />
    </div>
  );
}
