"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to household-scoped table changes (RLS filters what we receive)
 * and refreshes the current route so a second household member sees updates.
 */
export function RealtimeSync() {
  const router = useRouter();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    supabaseRef.current ??= createClient();
    const supabase = supabaseRef.current;

    const trigger = () => {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => router.refresh(), 500);
    };

    const channel = supabase
      .channel("app-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public" },
        () => trigger(),
      )
      .subscribe();

    return () => {
      window.clearTimeout(timerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
