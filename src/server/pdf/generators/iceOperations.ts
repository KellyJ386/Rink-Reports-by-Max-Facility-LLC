import "server-only";

import jsPDF from "jspdf";

import {
  PAGE,
  addHeader,
  addSectionTitle,
  newPageIfNeeded,
  docToBase64,
  type HeaderOpts,
} from "@/server/pdf/utils";

export interface IceOperationRow {
  date: string;
  operation: string;
  equipment: string;
  operator: string;
  notes: string;
}

export interface GenerateIceOperationsPdfInput {
  facilityName: string;
  dateRange: string;
  operations: IceOperationRow[];
}

// Column x-positions (inches from left edge)
const COL = {
  date:      PAGE.margin,
  operation: PAGE.margin + 1.1,
  equipment: PAGE.margin + 2.5,
  operator:  PAGE.margin + 3.9,
  notes:     PAGE.margin + 5.2,
} as const;

export async function generateIceOperationsPdf(
  input: GenerateIceOperationsPdfInput,
): Promise<string> {
  const doc = new jsPDF({ unit: "in", format: "letter" });

  const headerBase: Omit<HeaderOpts, "pageNum" | "totalPages"> = {
    facilityName: input.facilityName,
    reportTitle: "Ice Operations",
    dateRange: input.dateRange,
  };

  let currentPage = 1;
  let currentHeader: HeaderOpts = { ...headerBase, pageNum: 1, totalPages: 1 };
  addHeader(doc, currentHeader);
  let y = PAGE.margin + 1.0;

  // Section title
  y = addSectionTitle(doc, "Operations Log", y);
  y += 0.1;

  // Table header row
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Date", COL.date, y);
  doc.text("Operation", COL.operation, y);
  doc.text("Equipment", COL.equipment, y);
  doc.text("Operator", COL.operator, y);
  doc.text("Notes", COL.notes, y);
  y += 0.04;
  doc.setDrawColor(165, 172, 175);
  doc.setLineWidth(0.005);
  doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
  y += 0.14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  if (input.operations.length === 0) {
    doc.setTextColor(165, 172, 175);
    doc.text("No operations recorded for this period.", PAGE.margin, y);
    doc.setTextColor(0, 0, 0);
  } else {
    for (const op of input.operations) {
      const r = newPageIfNeeded(doc, y, 0.22, currentHeader);
      if (r !== y) {
        currentPage++;
        currentHeader = { ...headerBase, pageNum: currentPage, totalPages: 1 };
      }
      y = r;

      doc.text(op.date, COL.date, y);
      doc.text(op.operation, COL.operation, y);
      doc.text(op.equipment, COL.equipment, y);
      doc.text(op.operator, COL.operator, y);
      const notesMax = PAGE.width - PAGE.margin - COL.notes;
      const notesLines = doc.splitTextToSize(op.notes || "—", notesMax);
      doc.text(notesLines as string[], COL.notes, y);
      y += 0.18 * Math.max(1, (notesLines as string[]).length);
    }
  }

  // Second pass — stamp correct total page count
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addHeader(doc, { ...headerBase, pageNum: i, totalPages });
  }

  return docToBase64(doc);
}
