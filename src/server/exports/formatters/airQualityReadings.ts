import "server-only";

import type { CsvCell } from "@/server/exports/csv";

// Shape of an air_quality_readings row.
// Columns: id, facility_id, submitted_by, submitted_at,
//   co_ppm, no2_ppm, notes, tier, local_id, created_at
interface AirQualityReadingRow {
  id: string;
  facility_id: string;
  submitted_by: string;
  submitted_at: string;
  co_ppm: number;
  no2_ppm: number;
  notes?: string | null;
  tier: string;
}

export type { AirQualityReadingRow };

export function formatAirQualityRows(rows: AirQualityReadingRow[]): {
  headers: string[];
  rows: CsvCell[][];
} {
  const headers = [
    "Date",
    "Time",
    "CO (ppm)",
    "NO\u2082 (ppm)",
    "Tier",
    "Submitted By",
  ];

  const outputRows: CsvCell[][] = rows.map((row) => {
    // Split submitted_at ISO string into Date and Time components
    const iso = row.submitted_at ?? "";
    const datePart: CsvCell = iso.slice(0, 10) || null;
    // Extract HH:MM from ISO timestamp (e.g. "2026-01-01T14:30:00Z" → "14:30")
    const timePart: CsvCell = iso.length >= 16 ? iso.slice(11, 16) : null;

    return [
      datePart,
      timePart,
      row.co_ppm ?? null,
      row.no2_ppm ?? null,
      row.tier ?? null,
      row.submitted_by ?? null,
    ];
  });

  return { headers, rows: outputRows };
}
