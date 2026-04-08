import "server-only";

export type CsvCell = string | number | null;

export function arrayToCsv(headers: string[], rows: CsvCell[][]): string {
  const escape = (v: CsvCell): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) => r.map(escape).join(",")),
  ];
  // BOM for Excel UTF-8 compatibility
  return "\uFEFF" + lines.join("\n");
}
