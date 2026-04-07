import "server-only";
import ExcelJS from "exceljs";

export function createWorkbook(): ExcelJS.Workbook {
  return new ExcelJS.Workbook();
}

export function addWorksheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  headers: string[],
  rows: (string | number | null)[][],
): void {
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.addRow(headers);
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF003B6F" },
  };
  ws.columns = headers.map((h) => ({
    width: Math.max(12, h.length + 2),
  }));
  rows.forEach((r, i) => {
    const row = ws.addRow(r.map((v) => v ?? ""));
    if (i % 2 === 1) {
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF3F4F6" },
      };
    }
  });
}

export async function workbookToBase64(wb: ExcelJS.Workbook): Promise<string> {
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer).toString("base64");
}
