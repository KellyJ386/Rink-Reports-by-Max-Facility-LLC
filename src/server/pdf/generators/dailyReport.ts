import "server-only";

import jsPDF from "jspdf";

import {
  PAGE,
  addHeader,
  addSignaturePage,
  addSectionTitle,
  newPageIfNeeded,
  docToBase64,
  type HeaderOpts,
} from "@/server/pdf/utils";

export interface DailyReportTab {
  name: string;
  fields: Array<{ label: string; value: string }>;
}

export interface GenerateDailyReportPdfInput {
  facilityName: string;
  reportDate: string;
  tabs: DailyReportTab[];
  submittedBy: string;
}

export async function generateDailyReportPdf(
  input: GenerateDailyReportPdfInput,
): Promise<string> {
  const doc = new jsPDF({ unit: "in", format: "letter" });

  const headerBase: Omit<HeaderOpts, "pageNum" | "totalPages"> = {
    facilityName: input.facilityName,
    reportTitle: "Daily Report",
    dateRange: input.reportDate,
  };

  // First pass — write content with placeholder page numbers
  let currentPage = 1;
  let currentHeader: HeaderOpts = { ...headerBase, pageNum: 1, totalPages: 1 };
  addHeader(doc, currentHeader);
  let y = PAGE.margin + 1.0;

  for (const tab of input.tabs) {
    // Section title requires ~0.4 in
    const result = newPageIfNeeded(doc, y, 0.4, currentHeader);
    if (result !== y) {
      currentPage++;
      currentHeader = { ...headerBase, pageNum: currentPage, totalPages: 1 };
    }
    y = result;
    y = addSectionTitle(doc, tab.name, y);

    for (const field of tab.fields) {
      // Each field row: ~0.22 in
      const r2 = newPageIfNeeded(doc, y, 0.22, currentHeader);
      if (r2 !== y) {
        currentPage++;
        currentHeader = { ...headerBase, pageNum: currentPage, totalPages: 1 };
      }
      y = r2;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(field.label, PAGE.margin, y);
      doc.setFont("helvetica", "normal");
      const valueX = PAGE.margin + 2.2;
      const maxWidth = PAGE.width - PAGE.margin - valueX;
      const lines = doc.splitTextToSize(field.value || "—", maxWidth);
      doc.text(lines as string[], valueX, y);
      y += 0.18 * Math.max(1, (lines as string[]).length);
    }

    y += 0.15; // gap between sections
  }

  // Signature page
  addSignaturePage(doc, { preparedBy: input.submittedBy, reviewedBy: "" });

  // Second pass — stamp correct total page count on every page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addHeader(doc, { ...headerBase, pageNum: i, totalPages });
  }

  return docToBase64(doc);
}
