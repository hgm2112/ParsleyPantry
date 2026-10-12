/**
 * Pure helpers for the daily leftovers reminder: local-time math (IANA zone +
 * DST via Intl, no stored offsets), the due-window/dedup day rules, and the
 * notification message composition. No I/O — used by the cron route only.
 */

export const REMINDER_WINDOW_MINUTES = 120;
export const REMINDER_TITLE = "Don't forget your leftovers!";

export type LocalParts = {
  /** Local calendar day in the given zone, "YYYY-MM-DD". */
  date: string;
  /** Minutes since local midnight, 0–1439. */
  minutes: number;
};

/** Current wall-clock parts for `date` in an IANA zone. `hourCycle: "h23"` avoids the 24:00 midnight bug. */
export function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "0";

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** Parse PostgREST `time` ("18:00:00" or "18:00") into minutes since midnight. */
export function parseLocalTime(localTime: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(localTime);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Due when local now is inside [scheduled, scheduled + window), wrapping past
 * midnight (e.g. 23:30 + 120 min runs into tomorrow). Not due before the
 * scheduled time — earlier band jobs simply no-op.
 */
export function isDue(
  nowMinutes: number,
  scheduledMinutes: number,
  windowMinutes: number = REMINDER_WINDOW_MINUTES,
): boolean {
  const elapsed = (nowMinutes - scheduledMinutes + 1440) % 1440;
  return elapsed < windowMinutes;
}

/**
 * The local calendar day this reminder *belongs to*. Normally today; when the
 * due window wrapped past midnight, yesterday — so the delivery claim keys the
 * scheduled day, not the fire day (a 23:30 reminder sent at 00:10 must not
 * collide with tomorrow's 23:30 reminder).
 */
export function reminderLocalDate(
  nowMinutes: number,
  scheduledMinutes: number,
  today: string,
  yesterday: string,
): string {
  return nowMinutes < scheduledMinutes ? yesterday : today;
}

function cleanName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 30 ? `${trimmed.slice(0, 29)}…` : trimmed;
}

function joinNames(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Notification body from the current leftovers list. Reminder framing only —
 * never a food-safety guarantee. Singular wording for one item; long lists
 * shorten to the first two names + a count; the privacy option omits names.
 */
export function composeReminder(
  names: string[],
  generic: boolean,
): { title: string; body: string } {
  if (generic || names.length === 0) {
    return {
      title: REMINDER_TITLE,
      body: "You have leftovers on your list. Enjoy them before they go to waste!",
    };
  }
  if (names.length === 1) {
    return {
      title: REMINDER_TITLE,
      body: `You have ${cleanName(names[0])} on your leftovers list. Enjoy it before it goes to waste!`,
    };
  }
  const listed =
    names.length >= 4
      ? `${joinNames(names.slice(0, 2).map(cleanName))} and ${names.length - 2} more`
      : joinNames(names.map(cleanName));
  return {
    title: REMINDER_TITLE,
    body: `You have ${listed} on your leftovers list. Enjoy them before they go to waste!`,
  };
}
