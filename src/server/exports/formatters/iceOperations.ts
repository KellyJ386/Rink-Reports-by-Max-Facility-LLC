import "server-only";

import type { CsvCell } from "@/server/exports/csv";

// Shape of an ice_operations row as returned from Supabase with
// operation_type and equipment joins.
// ice_operations columns: id, facility_id, operation_type_id, equipment_id,
//   submitted_at, submitted_by, answers (JSONB), local_id, created_at
interface IceOperationRow {
  id: string;
  facility_id: string;
  operation_type_id: string;
  equipment_id: string;
  submitted_at: string;
  submitted_by: string;
  answers: Record<string, unknown> | null;
  // Joined from ice_operation_types
  operation_type?: { name: string } | null;
  // Joined from ice_equipment
  equipment?: { name: string } | null;
}

export type { IceOperationRow };

export function formatIceOperationRows(rows: IceOperationRow[]): {
  headers: string[];
  rows: CsvCell[][];
} {
  const headers = [
    "Date",
    "Operation Type",
    "Equipment Type",
    "Operator",
    "Submitted At",
    "Notes",
  ];

  const outputRows: CsvCell[][] = rows.map((row) => {
    const date = row.submitted_at ? row.submitted_at.slice(0, 10) : null;
    const operationType = row.operation_type?.name ?? null;
    const equipmentType = row.equipment?.name ?? null;
    const operator = row.submitted_by ?? null;
    const submittedAt = row.submitted_at ?? null;

    // The answers JSONB may contain a "notes" field; if not, stringify the
    // whole answers object as a fallback.
    const answers = row.answers ?? {};
    let notes: CsvCell = null;
    if (typeof answers["notes"] === "string") {
      notes = answers["notes"];
    } else if (typeof answers["Notes"] === "string") {
      notes = answers["Notes"];
    } else if (Object.keys(answers).length > 0) {
      notes = JSON.stringify(answers);
    }

    return [date, operationType, equipmentType, operator, submittedAt, notes];
  });

  return { headers, rows: outputRows };
}
