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

export interface AirQualityRow {
  timestamp: string;
  co: number;
  no2: number;
  tier: "normal" | "caution" | "action" | "evacuate";
  actionTaken: string;
}

export interface GenerateAirQualityPdfInput {
  facilityName: string;
  dateRange: string;
  readings: AirQualityRow[];
}

function tierColor(tier: AirQualityRow["tier"]): [number, number, number] {
  switch (tier) {
    case "normal":   return [77, 255, 0];    // green
    case "caution":  return [255, 184, 0];   // yellow
    case "action":   return [255, 184, 0];   // yellow
    case "evacuate": return [244, 42, 42];   // red
  }
}

function tierLabel(tier: AirQualityRow["tier"]): string {
  switch (tier) {
    case "normal":   return "Normal";
    case "caution":  return "Caution";
    case "action":   return "Action";
    case "evacuate": return "Evacuate";
  }
}

// Column x-positions
const COL = {
  timestamp: PAGE.margin,
  co:        PAGE.margin + 1.5,
  no2:       PAGE.margin + 2.3,
  tier:      PAGE.margin + 3.2,
  action:    PAGE.margin + 4.4,
} as const;

export async function generateAirQualityPdf(
  input: GenerateAirQualityPdfInput,
): Promise<string> {
  const doc = new jsPDF({ unit: "in", format: "letter" });

  const headerBase: Omit<HeaderOpts, "pageNum" | "totalPages"> = {
    facilityName: input.facilityName,
    reportTitle: "Air Quality Log",
    dateRange: input.dateRange,
  };

  let currentPage = 1;
  let currentHeader: HeaderOpts = { ...headerBase, pageNum: 1, totalPages: 1 };
  addHeader(doc, currentHeader);
  let y = PAGE.margin + 1.0;

  y = addSectionTitle(doc, "Air Quality Readings", y);
  y += 0.1;

  // Table header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Timestamp", COL.timestamp, y);
  doc.text("CO (ppm)", COL.co, y);
  doc.text("NO\u2082 (ppm)", COL.no2, y);
  doc.text("Tier", COL.tier, y);
  doc.text("Action Taken", COL.action, y);
  y += 0.04;
  doc.setDrawColor(165, 172, 175);
  doc.setLineWidth(0.005);
  doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
  y += 0.14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  if (input.readings.length === 0) {
    doc.setTextColor(165, 172, 175);
    doc.text("No readings recorded for this period.", PAGE.margin, y);
    doc.setTextColor(0, 0, 0);
  } else {
    for (const row of input.readings) {
      const r = newPageIfNeeded(doc, y, 0.22, currentHeader);
      if (r !== y) {
        currentPage++;
        currentHeader = { ...headerBase, pageNum: currentPage, totalPages: 1 };
      }
      y = r;

      doc.setTextColor(0, 0, 0);
      doc.text(row.timestamp, COL.timestamp, y);
      doc.text(String(row.co), COL.co, y);
      doc.text(String(row.no2), COL.no2, y);

      // Color-coded tier
      const [tr, tg, tb] = tierColor(row.tier);
      doc.setTextColor(tr, tg, tb);
      doc.text(tierLabel(row.tier), COL.tier, y);
      doc.setTextColor(0, 0, 0);

      const actionMax = PAGE.width - PAGE.margin - COL.action;
      const actionLines = doc.splitTextToSize(row.actionTaken || "—", actionMax);
      doc.text(actionLines as string[], COL.action, y);
      y += 0.18 * Math.max(1, (actionLines as string[]).length);
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
