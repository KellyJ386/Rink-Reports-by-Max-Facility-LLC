import "server-only";

import type { CsvCell } from "@/server/exports/csv";

// Shape of a daily_reports row as returned from Supabase with
// the checklist join. The `answers` JSONB is a record of field
// labels to values. The checklist name comes from the joined
// daily_report_checklists row (aliased as `checklist`).
interface DailyReportRow {
  id: string;
  facility_id: string;
  checklist_id: string;
  submitted_at: string;
  submitted_by: string;
  answers: Record<string, unknown> | null;
  // Joined from daily_report_checklists
  checklist?: { name: string } | null;
}

export type { DailyReportRow };

export function formatDailyReportRows(rows: DailyReportRow[]): {
  headers: string[];
  rows: CsvCell[][];
} {
  const headers = [
    "Date",
    "Tab Name",
    "Field",
    "Value",
    "Submitted By",
    "Submitted At",
  ];

  const outputRows: CsvCell[][] = [];

  for (const report of rows) {
    const date = report.submitted_at
      ? report.submitted_at.slice(0, 10)
      : null;
    const tabName = report.checklist?.name ?? null;
    const submittedBy = report.submitted_by ?? null;
    const submittedAt = report.submitted_at ?? null;

    const answers = report.answers ?? {};
    const entries = Object.entries(answers);

    if (entries.length === 0) {
      // Include an empty row so the report isn't silently skipped
      outputRows.push([date, tabName, null, null, submittedBy, submittedAt]);
    } else {
      for (const [field, value] of entries) {
        const cell: CsvCell =
          value === null || value === undefined
            ? null
            : typeof value === "string" || typeof value === "number"
              ? value
              : JSON.stringify(value);
        outputRows.push([date, tabName, field, cell, submittedBy, submittedAt]);
      }
    }
  }

  return { headers, rows: outputRows };
}
