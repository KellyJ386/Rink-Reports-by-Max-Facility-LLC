import "server-only";

import Papa from "papaparse";

import type { ParsedShift } from "../types";

const REQUIRED_COLUMNS = [
  "event name",
  "start date",
  "start time",
  "end date",
  "end time",
];

/**
 * Normalize a Maxgalaxy CSV export into ParsedShift objects.
 *
 * Expected columns (case-insensitive):
 *   Event Name, Start Date, Start Time, End Date, End Time,
 *   Resource, Staff Name, Staff Email
 *
 * Throws if required columns are missing.
 */
export function normalizeMaxgalaxy(csvContent: string): ParsedShift[] {
  const result = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const rawFields = result.meta.fields ?? [];
  const fieldMap = new Map<string, string>();
  for (const f of rawFields) {
    fieldMap.set(f.toLowerCase().trim(), f);
  }

  // Validate required columns
  const missing = REQUIRED_COLUMNS.filter((col) => !fieldMap.has(col));
  if (missing.length > 0) {
    throw new Error(
      `Unrecognized Maxgalaxy format — expected columns: ${REQUIRED_COLUMNS.join(", ")}. Missing: ${missing.join(", ")}`,
    );
  }

  const col = (key: string): string => fieldMap.get(key) ?? key;

  return result.data.map((row): ParsedShift => {
    const title = row[col("event name")] ?? "";
    const startDate = row[col("start date")] ?? "";
    const startTime = row[col("start time")] ?? "";
    const endDate = row[col("end date")] ?? "";
    const endTime = row[col("end time")] ?? "";
    const resource = row[col("resource")] ?? null;
    const staffEmail = fieldMap.has("staff email")
      ? (row[col("staff email")] ?? null)
      : null;

    const startAt = new Date(`${startDate} ${startTime}`);
    const endAt = new Date(`${endDate} ${endTime}`);

    // externalId: SHA-1-ish concat of title + start ISO
    const externalId = `${title}__${startAt.toISOString()}`;

    const attendees: string[] = staffEmail ? [staffEmail] : [];

    return {
      externalId,
      title,
      startAt,
      endAt,
      location: resource ?? null,
      description: null,
      attendees,
      rawEvent: { ...row } as Record<string, unknown>,
    };
  });
}
