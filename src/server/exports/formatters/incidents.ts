import "server-only";

import type { CsvCell } from "@/server/exports/csv";

// Shape of an incidents row.
// Columns: id, facility_id, kind, occurred_at, location,
//   incident_type, description, data (JSONB), submitted_at,
//   submitted_by, local_id, created_at
interface IncidentRow {
  id: string;
  facility_id: string;
  kind: string;
  occurred_at: string;
  location: string;
  incident_type: string;
  description: string;
  data: Record<string, unknown> | null;
  submitted_at: string;
  submitted_by: string;
}

export type { IncidentRow };

export function formatIncidentRows(rows: IncidentRow[]): {
  headers: string[];
  rows: CsvCell[][];
} {
  const headers = [
    "Date",
    "Type",
    "Location",
    "Description",
    "Reported By",
  ];

  const outputRows: CsvCell[][] = rows.map((row) => {
    const date = row.occurred_at ? row.occurred_at.slice(0, 10) : null;

    // incident_type and description are typed columns; fall back to the
    // data JSONB if somehow absent (defensive — migration guarantees NOT NULL)
    const type: CsvCell =
      row.incident_type ??
      (typeof row.data?.["incident_type"] === "string"
        ? (row.data["incident_type"] as string)
        : null);

    const description: CsvCell =
      row.description ??
      (typeof row.data?.["description"] === "string"
        ? (row.data["description"] as string)
        : null);

    return [
      date,
      type,
      row.location ?? null,
      description,
      row.submitted_by ?? null,
    ];
  });

  return { headers, rows: outputRows };
}
