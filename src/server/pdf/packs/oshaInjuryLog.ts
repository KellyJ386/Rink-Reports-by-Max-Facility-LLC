import "server-only";

import jsPDF from "jspdf";
import {
  addHeader,
  addFooter,
  addSignaturePage,
  addSectionTitle,
  newPageIfNeeded,
  docToBase64,
  PAGE,
  type HeaderOpts,
} from "@/server/pdf/utils";

// ============================================================================
// Types
// ============================================================================

export interface OshaIncident {
  caseNo: number;
  // OSHA 300 Column B — Employee's Name
  employeeName: string;
  // OSHA 300 Column C — Job Title
  jobTitle: string;
  // OSHA 300 Column D — Date of injury or onset of illness (MM/DD/YYYY)
  dateOfInjury: string;
  // OSHA 300 Column E — Where the event occurred (e.g. Loading dock north end)
  location: string;
  // OSHA 300 Column F — Describe injury or illness, parts of body affected,
  //   and object/substance that directly injured or made person ill
  description: string;
  // OSHA 300 Columns G–J — Classification of case
  //   G = Death, H = Days away from work, I = Job transfer or restriction, J = Other recordable cases
  classification: "death" | "days_away" | "restricted" | "other";
  // OSHA 300 Column K — Number of days away from work
  daysAway: number;
  // OSHA 300 Column L — Number of days of job transfer or restriction
  daysRestricted: number;
  // OSHA 300 Columns M1–M6 — Injury and illness type
  //   M1=Injury, M2=Skin disorder, M3=Respiratory condition, M4=Poisoning,
  //   M5=Hearing loss, M6=All other illnesses
  injuryType: string;
}

export interface GenerateOshaOpts {
  facilityName: string;
  // Establishment address — required on posted 300A per 29 CFR 1904.32(b)(1)
  facilityAddress: string;
  // Calendar year being reported
  year: number;
  incidents: OshaIncident[];
  // Peak employment count during the year — required on 300A per 29 CFR 1904.32(b)(2)
  // If absent, blank lines are left for the facility admin to fill in by hand.
  peakEmployment?: number;
  // Total hours worked by all employees during the year — required on 300A
  hoursWorked?: number;
  facilityId: string;
}

// ============================================================================
// Generator
// ============================================================================

export async function generateOshaLog(opts: GenerateOshaOpts): Promise<string> {
  const doc = new jsPDF({ unit: "in", format: "letter" });

  const header: HeaderOpts = {
    facilityName: opts.facilityName,
    reportTitle: `OSHA 300/300A — ${opts.year}`,
    dateRange: `Calendar Year ${opts.year}`,
    pageNum: 1,
    totalPages: 1, // filled in second pass below
  };

  addHeader(doc, header);
  let y = PAGE.margin + 0.9;

  // --------------------------------------------------------------------------
  // OSHA 300 SECTION — per 29 CFR 1904
  // --------------------------------------------------------------------------
  // Columns mirror the official OSHA 300 form layout:
  //   (A) Case No.
  //   (B) Employee Name
  //   (C) Job Title
  //   (D) Date of injury/illness
  //   (E) Where the event occurred
  //   (F) Describe injury/illness and parts of body affected
  //   (G–J) Classification: Death / Days Away / Job Transfer or Restriction / Other Recordable
  //   (K) Days Away from Work
  //   (L) Days of Job Transfer or Restriction
  //   (M1–M6) Injury and illness type checkboxes
  //
  // IMPORTANT: OSHA 300 requires the employer to determine recordability per
  // 29 CFR 1904.7 before logging. This generator includes all incidents passed
  // in — the admin must pre-filter for recordability before calling this function.
  //
  // NOTE: Employee names must be kept confidential per 29 CFR 1904.29(b)(7)
  // for certain privacy-concern cases (sexual assault, HIV, etc.). Redact those
  // entries before passing them to this generator.

  y = addSectionTitle(
    doc,
    "OSHA 300 — Log of Work-Related Injuries and Illnesses",
    y,
  );

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");

  // Column headers with x positions (inches from left edge of page)
  const cols = [
    "Case",    // A — Case No.
    "Employee", // B — Employee Name
    "Job Title", // C — Job Title
    "Date",    // D — Date of Injury
    "Location", // E — Where Event Occurred
    "Description", // F — Describe Injury/Illness
    "Class.",   // G–J — Classification
    "Days Away", // K — Days Away from Work
    "Days Rest.", // L — Days of Restricted Work
  ];
  const xs = [0.6, 1.1, 2.1, 3.2, 3.9, 4.8, 6.6, 7.1, 7.7];

  cols.forEach((col, i) => doc.text(col, xs[i]!, y));
  y += 0.15;

  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.01);
  doc.line(PAGE.margin, y - 0.03, PAGE.width - PAGE.margin, y - 0.03);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);

  // Classification display labels per 29 CFR 1904 column letters
  const classificationLabels: Record<OshaIncident["classification"], string> = {
    death: "Death",      // Column G
    days_away: "DaysAwy", // Column H — Days away from work
    restricted: "Restr",  // Column I — Job transfer or restriction
    other: "Other",       // Column J — Other recordable cases
  };

  for (const inc of opts.incidents) {
    y = newPageIfNeeded(doc, y, 0.4, header);
    const row = [
      String(inc.caseNo),
      inc.employeeName.slice(0, 15),
      inc.jobTitle.slice(0, 15),
      inc.dateOfInjury.slice(0, 10),
      inc.location.slice(0, 12),
      inc.description.slice(0, 24),
      classificationLabels[inc.classification],
      String(inc.daysAway),
      String(inc.daysRestricted),
    ];
    row.forEach((cell, i) => doc.text(cell, xs[i]!, y));
    y += 0.18;
  }

  // Totals row
  y = newPageIfNeeded(doc, y, 0.5, header);
  y += 0.1;
  doc.setDrawColor(100, 100, 100);
  doc.line(PAGE.margin, y - 0.03, PAGE.width - PAGE.margin, y - 0.03);
  doc.setFont("helvetica", "bold");
  const totalDaysAway = opts.incidents.reduce((s, i) => s + i.daysAway, 0);
  const totalDaysRestricted = opts.incidents.reduce((s, i) => s + i.daysRestricted, 0);
  doc.text("Totals:", 1.1, y);
  doc.text(String(totalDaysAway), xs[7]!, y);
  doc.text(String(totalDaysRestricted), xs[8]!, y);
  doc.setFont("helvetica", "normal");

  // --------------------------------------------------------------------------
  // OSHA 300A SECTION — Annual Summary
  // Required per 29 CFR 1904.32 — must be posted Feb 1–Apr 30 of following year
  // --------------------------------------------------------------------------
  doc.addPage();
  const page2Header: HeaderOpts = { ...header, pageNum: 2 };
  addHeader(doc, page2Header);
  let y2 = PAGE.margin + 0.9;

  y2 = addSectionTitle(
    doc,
    "OSHA 300A — Summary of Work-Related Injuries and Illnesses",
    y2,
  );

  // Establishment information block — required per 29 CFR 1904.32(b)(1)
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Establishment Information:", PAGE.margin, y2);
  y2 += 0.2;
  doc.setFont("helvetica", "normal");
  doc.text(`Name: ${opts.facilityName}`, PAGE.margin, y2);
  y2 += 0.18;
  doc.text(`Address: ${opts.facilityAddress}`, PAGE.margin, y2);
  y2 += 0.3;

  // Annual summary totals per 29 CFR 1904.32(b)(2)
  // Each count maps to a numbered line on the official 300A form:
  //   Line 1: Total deaths
  //   Line 2: Cases with days away from work
  //   Line 3: Cases with job transfer or restriction
  //   Line 4: Other recordable cases
  //   Line 5: Total number of cases with days away from work
  //   Line 6: Total number of days of job transfer or restriction
  const totalCases = opts.incidents.length;
  const deaths = opts.incidents.filter((i) => i.classification === "death").length;
  const daysAwayCases = opts.incidents.filter((i) => i.classification === "days_away").length;
  const restrictedCases = opts.incidents.filter((i) => i.classification === "restricted").length;
  const otherCases = opts.incidents.filter((i) => i.classification === "other").length;

  doc.setFontSize(10);

  const summaryRows: [string, string][] = [
    // 300A Line 1 — Total deaths
    ["Total deaths (Line 1):", String(deaths)],
    // 300A Line 2 — Cases with days away from work
    ["Cases with days away from work (Line 2):", String(daysAwayCases)],
    // 300A Line 3 — Cases with job transfer or restriction
    ["Cases with job transfer or restriction (Line 3):", String(restrictedCases)],
    // 300A Line 4 — Other recordable cases
    ["Other recordable cases (Line 4):", String(otherCases)],
    // 300A Line H total
    ["Total recordable cases:", String(totalCases)],
    // 300A Line 5 — Number of days away from work
    ["Total days away from work (Line 5):", String(totalDaysAway)],
    // 300A Line 6 — Number of days job transfer or restriction
    ["Total days of restricted work (Line 6):", String(totalDaysRestricted)],
  ];

  for (const [label, value] of summaryRows) {
    y2 = newPageIfNeeded(doc, y2, 0.25, page2Header);
    doc.text(label, PAGE.margin, y2);
    doc.text(value, PAGE.width - PAGE.margin - 0.3, y2, { align: "right" });
    y2 += 0.22;
  }

  y2 += 0.2;

  // Employment data — required per 29 CFR 1904.32(b)(2)
  // If values are not available, blank underlines are provided for manual entry.
  doc.setFont("helvetica", "bold");
  doc.text("Employment data:", PAGE.margin, y2);
  y2 += 0.2;
  doc.setFont("helvetica", "normal");

  const peakEmpText = opts.peakEmployment !== undefined
    ? String(opts.peakEmployment)
    : "_______";
  const hoursText = opts.hoursWorked !== undefined
    ? String(opts.hoursWorked)
    : "_______";

  // 300A — Annual average number of employees
  doc.text(`Annual average number of employees: ${peakEmpText}`, PAGE.margin, y2);
  y2 += 0.22;
  // 300A — Total hours worked by all employees last year
  doc.text(`Total hours worked by all employees: ${hoursText}`, PAGE.margin, y2);
  y2 += 0.4;

  // Certification block — required per 29 CFR 1904.32(b)(3)
  // "I certify that I have examined this document and that to the best of my
  // knowledge the entries are true, accurate, and complete."
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.text(
    "Certification: I certify that I have examined this document and, to the best of my knowledge, " +
      "the entries are true, accurate, and complete. (29 CFR 1904.32(b)(3))",
    PAGE.margin,
    y2,
    { maxWidth: PAGE.width - 2 * PAGE.margin },
  );

  addSignaturePage(doc, { preparedBy: "", reviewedBy: "" });

  // Backfill totalPages on every page header now that we know the final count
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    addFooter(doc, {
      generatedAt: new Date().toISOString(),
      generatedBy: "RinkReports",
    });
  }

  return docToBase64(doc);
}
