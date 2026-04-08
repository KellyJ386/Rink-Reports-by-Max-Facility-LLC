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

export interface BodyMarkerEntry {
  view: "front" | "back";
  label: string;
}

export interface IncidentReportEntry {
  kind: "incident" | "accident";
  occurredAt: string;
  reportedBy: string;
  location: string;
  incidentType: string;
  description: string;
  personsInvolved?: string;
  witnesses?: string;
  immediateAction?: string;
  followUpRequired: boolean;
  followUpNotes?: string;
  // Accident-only fields
  injuredName?: string;
  injuredType?: string;
  injuredAge?: number | null;
  natureOfInjury?: string;
  bodyMarkers?: BodyMarkerEntry[];
  firstAidAdministered?: boolean;
  firstAidDetails?: string;
  emsCalled?: boolean;
  emsDetails?: string;
  transportedToHospital?: boolean;
  hospitalName?: string;
}

export interface GenerateIncidentsPdfInput {
  facilityName: string;
  dateRange: string;
  incidents: IncidentReportEntry[];
}

function renderKV(
  doc: jsPDF,
  label: string,
  value: string,
  y: number,
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`${label}:`, PAGE.margin + 0.1, y);
  doc.setFont("helvetica", "normal");
  const valueX = PAGE.margin + 1.5;
  const maxW = PAGE.width - PAGE.margin - valueX;
  const lines = doc.splitTextToSize(value || "—", maxW);
  doc.text(lines as string[], valueX, y);
  return y + 0.17 * Math.max(1, (lines as string[]).length);
}

export async function generateIncidentsPdf(
  input: GenerateIncidentsPdfInput,
): Promise<string> {
  const doc = new jsPDF({ unit: "in", format: "letter" });

  const headerBase: Omit<HeaderOpts, "pageNum" | "totalPages"> = {
    facilityName: input.facilityName,
    reportTitle: "Incident Reports",
    dateRange: input.dateRange,
  };

  let currentPage = 1;
  let currentHeader: HeaderOpts = { ...headerBase, pageNum: 1, totalPages: 1 };
  addHeader(doc, currentHeader);
  let y = PAGE.margin + 1.0;

  if (input.incidents.length === 0) {
    y = addSectionTitle(doc, "Incident Reports", y);
    doc.setTextColor(165, 172, 175);
    doc.setFontSize(9);
    doc.text("No incidents recorded for this period.", PAGE.margin, y);
    doc.setTextColor(0, 0, 0);
  } else {
    for (const inc of input.incidents) {
      // Each incident block: ensure at least 1 inch free
      const r = newPageIfNeeded(doc, y, 1.0, currentHeader);
      if (r !== y) {
        currentPage++;
        currentHeader = { ...headerBase, pageNum: currentPage, totalPages: 1 };
      }
      y = r;

      // Type badge + section title
      const kindLabel = inc.kind === "accident" ? "ACCIDENT" : "INCIDENT";
      const badgeColor: [number, number, number] =
        inc.kind === "accident" ? [244, 42, 42] : [165, 172, 175];
      doc.setFillColor(...badgeColor);
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      const badgeW = inc.kind === "accident" ? 0.65 : 0.6;
      doc.roundedRect(PAGE.margin, y - 0.12, badgeW, 0.18, 0.04, 0.04, "F");
      doc.text(kindLabel, PAGE.margin + 0.05, y - 0.01);
      doc.setTextColor(0, 0, 0);

      const titleX = PAGE.margin + badgeW + 0.1;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(
        `${inc.incidentType} — ${inc.location}`,
        titleX,
        y,
      );
      y += 0.04;
      doc.setDrawColor(0, 59, 111);
      doc.setLineWidth(0.01);
      doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
      y += 0.18;

      // Common fields
      y = renderKV(doc, "Date/Time", inc.occurredAt, y);
      y = renderKV(doc, "Reported by", inc.reportedBy, y);
      y = renderKV(doc, "Location", inc.location, y);
      y = renderKV(doc, "Description", inc.description, y);
      if (inc.personsInvolved) {
        y = renderKV(doc, "Persons involved", inc.personsInvolved, y);
      }
      if (inc.witnesses) {
        y = renderKV(doc, "Witnesses", inc.witnesses, y);
      }
      if (inc.immediateAction) {
        y = renderKV(doc, "Immediate action", inc.immediateAction, y);
      }
      y = renderKV(doc, "Follow-up required", inc.followUpRequired ? "Yes" : "No", y);
      if (inc.followUpNotes) {
        y = renderKV(doc, "Follow-up notes", inc.followUpNotes, y);
      }

      // Accident-only fields
      if (inc.kind === "accident") {
        y += 0.08;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text("Injury Details", PAGE.margin, y);
        doc.setFont("helvetica", "normal");
        y += 0.18;

        if (inc.injuredName) {
          y = renderKV(doc, "Injured person", inc.injuredName, y);
        }
        if (inc.injuredType) {
          y = renderKV(doc, "Person type", inc.injuredType, y);
        }
        if (inc.injuredAge !== null && inc.injuredAge !== undefined) {
          y = renderKV(doc, "Age", String(inc.injuredAge), y);
        }
        if (inc.natureOfInjury) {
          y = renderKV(doc, "Nature of injury", inc.natureOfInjury, y);
        }

        // Body markers — textual list
        if (inc.bodyMarkers && inc.bodyMarkers.length > 0) {
          const areas = inc.bodyMarkers
            .map((m) => `${m.label} (${m.view})`)
            .join(", ");
          y = renderKV(doc, "Affected areas", areas, y);
        }

        y = renderKV(
          doc,
          "First aid administered",
          inc.firstAidAdministered ? "Yes" : "No",
          y,
        );
        if (inc.firstAidDetails) {
          y = renderKV(doc, "First aid details", inc.firstAidDetails, y);
        }
        y = renderKV(doc, "EMS called", inc.emsCalled ? "Yes" : "No", y);
        if (inc.emsDetails) {
          y = renderKV(doc, "EMS details", inc.emsDetails, y);
        }
        y = renderKV(
          doc,
          "Transported to hospital",
          inc.transportedToHospital ? "Yes" : "No",
          y,
        );
        if (inc.hospitalName) {
          y = renderKV(doc, "Hospital", inc.hospitalName, y);
        }
      }

      y += 0.3; // gap between incidents
    }
  }

  // Signature page (incidents include a Witness line)
  doc.addPage();
  let sigY = PAGE.height / 2 - 1.2;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");

  const lines: Array<{ label: string }> = [
    { label: "Prepared by:" },
    { label: "Reviewed by:" },
    { label: "Witness:" },
  ];
  for (const line of lines) {
    doc.text(line.label, PAGE.margin, sigY);
    doc.line(PAGE.margin + 1.2, sigY, PAGE.margin + 4.5, sigY);
    doc.text("Date:", PAGE.margin + 4.8, sigY);
    doc.line(PAGE.margin + 5.4, sigY, PAGE.margin + 7.4, sigY);
    sigY += 0.8;
  }

  // Second pass — stamp correct total page count
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addHeader(doc, { ...headerBase, pageNum: i, totalPages });
  }

  return docToBase64(doc);
}
