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

/**
 * A single refrigeration reading row from the database.
 * Maps 1:1 to public.refrigeration_readings columns.
 */
export interface RefrigerationReading {
  // submitted_at — timestamptz stored as ISO string
  submitted_at: string;
  // Facility-wide measurements (nullable — sensor may have been offline)
  brine_supply: number | null;
  brine_return: number | null;
  brine_flow: number | null;
  ice_surface_temp: number | null;
  condenser_temp: number | null;
}

export interface GenerateEpaRmpOpts {
  facilityName: string;
  // Physical street address of the facility — required on RMP submissions
  facilityAddress: string;
  // Calendar year being reported
  year: number;
  // Refrigerant in use at this facility (e.g. "R-717 (Ammonia)", "R-22", "R-404A")
  // Listed separately because RMP submissions require the exact CAS number or
  // trade name. The admin must verify the correct identifier.
  refrigerantType: string;
  // All operational readings for the reporting period
  readings: RefrigerationReading[];
}

// ============================================================================
// Generator
// ============================================================================

// EPA RMP requires annual reporting of refrigerant quantities per 40 CFR Part 68.
//
// TODO: Full RMP compliance requires process hazard analysis, emergency response
// program, and other elements beyond operational readings. Consult an
// environmental compliance officer before using this as a regulatory submission.
// This generator covers the operational log portion only.

export async function generateEpaRmpLog(
  opts: GenerateEpaRmpOpts,
): Promise<string> {
  const doc = new jsPDF({ unit: "in", format: "letter" });

  const header: HeaderOpts = {
    facilityName: opts.facilityName,
    reportTitle: `EPA RMP Refrigerant Log — ${opts.year}`,
    dateRange: `Calendar Year ${opts.year}`,
    pageNum: 1,
    totalPages: 1, // backfilled below
  };

  addHeader(doc, header);
  let y = PAGE.margin + 0.9;

  // --------------------------------------------------------------------------
  // Section 1 — Facility Header
  // --------------------------------------------------------------------------
  // Required per 40 CFR Part 68.160 — facility identification information
  // must appear on all RMP submissions.
  y = addSectionTitle(doc, "Facility Identification", y);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Facility Name:    ${opts.facilityName}`, PAGE.margin, y);
  y += 0.22;
  doc.text(`Address:          ${opts.facilityAddress}`, PAGE.margin, y);
  y += 0.22;
  doc.text(`Reporting Year:   ${opts.year}`, PAGE.margin, y);
  y += 0.22;
  doc.text(`Refrigerant:      ${opts.refrigerantType}`, PAGE.margin, y);
  y += 0.22;
  doc.text(`Total Readings:   ${opts.readings.length}`, PAGE.margin, y);
  y += 0.35;

  // --------------------------------------------------------------------------
  // Section 2 — Refrigerant Inventory Summary
  // --------------------------------------------------------------------------
  // 40 CFR Part 68.160(b)(2) requires covered processes to identify
  // the regulated substance (refrigerant) and maximum intended inventory.
  // The values below are derived from the operational log; the facility
  // must separately maintain Material Safety Data Sheets and process
  // documentation as required by 40 CFR 68.65 (PSM / PHA).
  y = addSectionTitle(doc, "Refrigerant Inventory Summary", y);

  // Compute simple statistics from the readings for the inventory section
  const brineSupplyValues = opts.readings
    .map((r) => r.brine_supply)
    .filter((v): v is number => v !== null);
  const brineReturnValues = opts.readings
    .map((r) => r.brine_return)
    .filter((v): v is number => v !== null);

  const avg = (arr: number[]) =>
    arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;
  const min = (arr: number[]) =>
    arr.length === 0 ? null : Math.min(...arr);
  const max = (arr: number[]) =>
    arr.length === 0 ? null : Math.max(...arr);

  const fmt = (v: number | null, unit: string) =>
    v === null ? "N/A" : `${v.toFixed(1)} ${unit}`;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Brine Supply Temperature (°F):", PAGE.margin, y);
  y += 0.18;
  doc.setFont("helvetica", "normal");
  doc.text(
    `  Average: ${fmt(avg(brineSupplyValues), "°F")}   Min: ${fmt(min(brineSupplyValues), "°F")}   Max: ${fmt(max(brineSupplyValues), "°F")}`,
    PAGE.margin,
    y,
  );
  y += 0.25;

  doc.setFont("helvetica", "bold");
  doc.text("Brine Return Temperature (°F):", PAGE.margin, y);
  y += 0.18;
  doc.setFont("helvetica", "normal");
  doc.text(
    `  Average: ${fmt(avg(brineReturnValues), "°F")}   Min: ${fmt(min(brineReturnValues), "°F")}   Max: ${fmt(max(brineReturnValues), "°F")}`,
    PAGE.margin,
    y,
  );
  y += 0.3;

  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.text(
    "NOTE: Maximum intended inventory and process safety documentation must be maintained separately",
    PAGE.margin,
    y,
    { maxWidth: PAGE.width - 2 * PAGE.margin },
  );
  y += 0.15;
  doc.text(
    "per 40 CFR 68.65 (Process Safety Management) and 40 CFR 68.160 (Registration requirements).",
    PAGE.margin,
    y,
    { maxWidth: PAGE.width - 2 * PAGE.margin },
  );
  y += 0.35;
  doc.setFont("helvetica", "normal");

  // --------------------------------------------------------------------------
  // Section 3 — Operating Log (daily readings summary)
  // --------------------------------------------------------------------------
  // 40 CFR Part 68.200 requires documentation of normal operating conditions
  // and any deviations. This table lists all recorded operational readings for
  // the reporting period. Actual RMP filings use EPA's RMP*Submit software —
  // this log is a supporting exhibit, not a substitute for RMP*Submit.
  y = addSectionTitle(doc, "Operating Log — Recorded Readings", y);

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");

  // Column headers
  const colLabels = [
    "Date/Time",        // submitted_at — truncated to date for readability
    "Brine Supply°F",   // brine_supply
    "Brine Return°F",   // brine_return
    "Brine Flow GPM",   // brine_flow
    "Ice Surf.°F",      // ice_surface_temp
    "Cond.°F",          // condenser_temp
  ];
  const colXs = [0.6, 2.1, 3.3, 4.5, 5.7, 6.9];

  colLabels.forEach((label, i) => doc.text(label, colXs[i]!, y));
  y += 0.14;

  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.005);
  doc.line(PAGE.margin, y - 0.02, PAGE.width - PAGE.margin, y - 0.02);

  doc.setFont("helvetica", "normal");

  const fmtVal = (v: number | null) => (v === null ? "—" : v.toFixed(1));

  for (const r of opts.readings) {
    y = newPageIfNeeded(doc, y, 0.18, header);
    const dateStr = r.submitted_at.slice(0, 16).replace("T", " ");
    const row = [
      dateStr,
      fmtVal(r.brine_supply),
      fmtVal(r.brine_return),
      fmtVal(r.brine_flow),
      fmtVal(r.ice_surface_temp),
      fmtVal(r.condenser_temp),
    ];
    row.forEach((cell, i) => doc.text(cell, colXs[i]!, y));
    y += 0.16;
  }

  if (opts.readings.length === 0) {
    y = newPageIfNeeded(doc, y, 0.25, header);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.text("No readings recorded for this period.", PAGE.margin, y);
    y += 0.25;
    doc.setFont("helvetica", "normal");
  }

  y += 0.3;

  // --------------------------------------------------------------------------
  // Section 4 — Certification
  // --------------------------------------------------------------------------
  // 40 CFR Part 68.185 requires the owner or operator to certify the RMP.
  y = newPageIfNeeded(doc, y, 0.8, header);
  y = addSectionTitle(doc, "Certification Block", y);

  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.text(
    "I certify that to the best of my knowledge, information, and belief, the information submitted " +
      "is true, accurate, and complete. (40 CFR Part 68.185)",
    PAGE.margin,
    y,
    { maxWidth: PAGE.width - 2 * PAGE.margin },
  );
  y += 0.35;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  // Signature lines
  doc.text("Owner / Operator signature:", PAGE.margin, y);
  doc.line(PAGE.margin + 2.2, y, PAGE.margin + 5.5, y);
  y += 0.08;
  doc.text("Date:", PAGE.margin + 5.7, y - 0.08);
  doc.line(PAGE.margin + 6.1, y - 0.08, PAGE.width - PAGE.margin, y - 0.08);

  y += 0.35;
  doc.text("Title:", PAGE.margin, y);
  doc.line(PAGE.margin + 0.6, y, PAGE.margin + 4.5, y);

  addSignaturePage(doc, { preparedBy: "", reviewedBy: "" });

  // Backfill footers
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
