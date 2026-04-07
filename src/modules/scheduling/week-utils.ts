/**
 * Tiny date helpers for the Scheduling module. Weeks always start on
 * Monday — Sunday is dow=6 — to keep the on-screen grid aligned with
 * facility operations (most rinks treat Monday as week start).
 */

const DAY_MS = 86400000;

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/**
 * The Monday of the week containing the given date, normalized to
 * 00:00 local. Returns a Date.
 */
export function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // getDay() returns 0=Sun..6=Sat. We want offset to Monday (day 1).
  const dow = d.getDay();
  const offset = (dow + 6) % 7; // 0=Mon..6=Sun
  d.setDate(d.getDate() - offset);
  return d;
}

/** ISO date string "YYYY-MM-DD" for the local Monday-of-week. */
export function isoMondayOf(date: Date): string {
  const m = mondayOf(date);
  const y = m.getFullYear();
  const mm = String(m.getMonth() + 1).padStart(2, "0");
  const dd = String(m.getDate()).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/** Parse "YYYY-MM-DD" as a local-midnight Date. */
export function parseDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

/** Add N days to a Date and return a new Date. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** "Mon Apr 7" style label for a single day. */
export function dayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** "HH:mm" formatted from minutes since midnight. */
export function fmtMinute(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
