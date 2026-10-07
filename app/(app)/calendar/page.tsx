import { Suspense } from "react";
import { requireDal } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CalendarView,
  type CalendarMeal,
} from "@/components/calendar/calendar-view";

export const metadata = { title: "Calendar" };

function CalendarSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-7 w-48" />
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function mondayOnOrBefore(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function CalendarContent({ month }: { month: string }) {
  const { supabase, householdId } = await requireDal();

  const firstOfMonth = `${month}-01`;
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(
    Date.UTC(year ?? 2026, (monthNumber ?? 1), 0),
  ).getUTCDate();
  const lastOfMonth = `${month}-${String(lastDay).padStart(2, "0")}`;

  const weekStart = mondayOnOrBefore(firstOfMonth);
  const weekEnd = mondayOnOrBefore(lastOfMonth);

  const result = await supabase
    .from("meal_plan_days")
    .select("*, recipe:recipes(id, name, time, tags)")
    .eq("household_id", householdId)
    .gte("week_start", weekStart)
    .lte("week_start", addDaysIso(weekEnd, 0));

  const meals = (result.data ?? []) as CalendarMeal[];

  return <CalendarView month={month} meals={meals} />;
}

export default function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  return (
    <Suspense fallback={<CalendarSkeleton />}>
      <CalendarWrapper searchParams={searchParams} />
    </Suspense>
  );
}

async function CalendarWrapper({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = typeof params.month === "string" ? params.month : "";
  if (!MONTH_RE.test(raw)) {
    // No/invalid ?month= yet: the client redirects with its local month so
    // the server never reads wall-clock time during prerender.
    return <CalendarView month={null} meals={[]} />;
  }
  return <CalendarContent month={raw} />;
}
