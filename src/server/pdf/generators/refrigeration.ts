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

export interface CompressorReadingEntry {
  compressorName: string;
  fields: Array<{
    label: string;
    unit: string;
    value: number | null;
  }>;
}

export interface FacilityFieldEntry {
  label: string;
  unit: string;
  value: number | null;
}

export interface RefrigerationReadingEntry {
  submittedAt: string;
  submittedBy: string;
  facilityFields: FacilityFieldEntry[];
  compressorReadings: CompressorReadingEntry[];
}

export interface NormalRange {
  min: number | null;
  max: number | null;
}

export interface GenerateRefrigerationPdfInput {
  facilityName: string;
  dateRange: string;
  readings: RefrigerationReadingEntry[];
  normalRanges: Record<string, NormalRange>;
}

function statusSymbol(
  value: number | null,
  range: NormalRange | undefined,
): string {
  if (value === null || range === undefined) return "";
  if (range.min !== null && value < range.min) return "!";
  if (range.max !== null && value > range.max) return "!";
  return "OK";
}

export async function generateRefrigerationPdf(
  input: GenerateRefrigerationPdfInput,
): Promise<string> {
  const doc = new jsPDF({ unit: "in", format: "letter" });
  const hasRanges = Object.keys(input.normalRanges).length > 0;

  const headerBase: Omit<HeaderOpts, "pageNum" | "totalPages"> = {
    facilityName: input.facilityName,
    reportTitle: "Refrigeration Log",
    dateRange: input.dateRange,
  };

  let currentPage = 1;
  let currentHeader: HeaderOpts = { ...headerBase, pageNum: 1, totalPages: 1 };
  addHeader(doc, currentHeader);
  let y = PAGE.margin + 1.0;

  if (input.readings.length === 0) {
    y = addSectionTitle(doc, "Refrigeration Readings", y);
    doc.setTextColor(165, 172, 175);
    doc.setFontSize(9);
    doc.text("No readings recorded for this period.", PAGE.margin, y);
    doc.setTextColor(0, 0, 0);
  } else {
    for (const reading of input.readings) {
      // Reading header
      const r = newPageIfNeeded(doc, y, 0.7, currentHeader);
      if (r !== y) {
        currentPage++;
        currentHeader = { ...headerBase, pageNum: currentPage, totalPages: 1 };
      }
      y = r;

      y = addSectionTitle(
        doc,
        `${reading.submittedAt} — ${reading.submittedBy}`,
        y,
      );

      // Facility-wide fields sub-table
      if (reading.facilityFields.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text("Facility Readings", PAGE.margin, y);
        y += 0.2;

        // Column headers
        doc.setFontSize(8);
        doc.text("Field", PAGE.margin, y);
        doc.text("Value", PAGE.margin + 2.5, y);
        if (hasRanges) {
          doc.text("Normal Range", PAGE.margin + 3.5, y);
          doc.text("Status", PAGE.margin + 5.5, y);
        }
        doc.setFont("helvetica", "normal");
        y += 0.04;
        doc.setDrawColor(165, 172, 175);
        doc.setLineWidth(0.005);
        doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
        y += 0.14;

        for (const f of reading.facilityFields) {
          const r2 = newPageIfNeeded(doc, y, 0.2, currentHeader);
          if (r2 !== y) {
            currentPage++;
            currentHeader = { ...headerBase, pageNum: currentPage, totalPages: 1 };
          }
          y = r2;

          doc.setFontSize(8);
          doc.text(`${f.label} (${f.unit})`, PAGE.margin, y);
          doc.text(f.value !== null ? String(f.value) : "—", PAGE.margin + 2.5, y);
          if (hasRanges) {
            const fieldKey = f.label.toLowerCase().replace(/\s+/g, "_");
            const range = input.normalRanges[fieldKey];
            if (range) {
              const rangeStr = [
                range.min !== null ? String(range.min) : "—",
                range.max !== null ? String(range.max) : "—",
              ].join(" – ");
              doc.text(rangeStr, PAGE.margin + 3.5, y);
              const sym = statusSymbol(f.value, range);
              if (sym === "!") {
                doc.setTextColor(255, 184, 0); // Alert Yellow
              } else {
                doc.setTextColor(77, 255, 0); // Action Green
              }
              doc.text(sym, PAGE.margin + 5.5, y);
              doc.setTextColor(0, 0, 0);
            } else {
              doc.text("—", PAGE.margin + 3.5, y);
            }
          }
          y += 0.18;
        }
        y += 0.1;
      }

      // Per-compressor sub-tables
      for (const comp of reading.compressorReadings) {
        const r3 = newPageIfNeeded(doc, y, 0.5, currentHeader);
        if (r3 !== y) {
          currentPage++;
          currentHeader = { ...headerBase, pageNum: currentPage, totalPages: 1 };
        }
        y = r3;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(`Compressor: ${comp.compressorName}`, PAGE.margin, y);
        y += 0.2;

        // Column headers
        doc.setFontSize(8);
        doc.text("Field", PAGE.margin, y);
        doc.text("Value", PAGE.margin + 2.5, y);
        if (hasRanges) {
          doc.text("Normal Range", PAGE.margin + 3.5, y);
          doc.text("Status", PAGE.margin + 5.5, y);
        }
        doc.setFont("helvetica", "normal");
        y += 0.04;
        doc.setDrawColor(165, 172, 175);
        doc.setLineWidth(0.005);
        doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
        y += 0.14;

        for (const f of comp.fields) {
          const r4 = newPageIfNeeded(doc, y, 0.2, currentHeader);
          if (r4 !== y) {
            currentPage++;
            currentHeader = { ...headerBase, pageNum: currentPage, totalPages: 1 };
          }
          y = r4;

          doc.setFontSize(8);
          doc.text(`${f.label} (${f.unit})`, PAGE.margin, y);
          doc.text(f.value !== null ? String(f.value) : "—", PAGE.margin + 2.5, y);
          if (hasRanges) {
            const fieldKey = f.label.toLowerCase().replace(/\s+/g, "_");
            const range = input.normalRanges[fieldKey];
            if (range) {
              const rangeStr = [
                range.min !== null ? String(range.min) : "—",
                range.max !== null ? String(range.max) : "—",
              ].join(" – ");
              doc.text(rangeStr, PAGE.margin + 3.5, y);
              const sym = statusSymbol(f.value, range);
              if (sym === "!") {
                doc.setTextColor(255, 184, 0);
              } else {
                doc.setTextColor(77, 255, 0);
              }
              doc.text(sym, PAGE.margin + 5.5, y);
              doc.setTextColor(0, 0, 0);
            } else {
              doc.text("—", PAGE.margin + 3.5, y);
            }
          }
          y += 0.18;
        }
        y += 0.1;
      }

      y += 0.2;
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
