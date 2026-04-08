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
// Input types — management summary, NOT a regulatory filing
// ============================================================================

export interface AirQualitySummary {
  avgCoPpm: number | null;
  avgNo2Ppm: number | null;
  // Days where the highest tier was each level
  daysNormal: number;
  daysCaution: number;
  daysAction: number;
  daysEvacuate: number;
  // Overall trend direction compared to prior month
  trend: "improving" | "stable" | "worsening" | "no_data";
}

export interface RefrigerationSummary {
  // Average brine deltaT = brine_supply - brine_return, proxy for heat load
  avgBrineDeltaT: number | null;
  // Days where any reading was outside the facility's configured normal range
  daysOutsideNormal: number;
  totalReadingDays: number;
  trend: "improving" | "stable" | "worsening" | "no_data";
}

export interface IncidentSummary {
  // Count by incident type (all kinds combined)
  byType: Record<string, number>;
  total: number;
  // Count accidents specifically (kind='accident' rows)
  accidents: number;
}

export interface CompletionRate {
  checklistName: string;
  submitted: number;
  missed: number;
  totalDays: number;
}

export interface ActiveAlert {
  title: string;
  severity: "info" | "warning" | "critical";
  createdAt: string; // ISO string — age is computed from this
  alertType: string;
}

export interface GenerateBoardPackOpts {
  facilityName: string;
  // Human-readable month label, e.g. "March 2026"
  month: string;
  airQualitySummary: AirQualitySummary;
  refrigerationSummary: RefrigerationSummary;
  incidentSummary: IncidentSummary;
  completionRates: CompletionRate[];
  alerts: ActiveAlert[];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Render a simple text bar chart using block characters.
 * maxBarWidth is in characters; maxValue is the largest value in the set.
 */
function textBar(value: number, maxValue: number, maxBarWidth = 20): string {
  if (maxValue === 0) return "";
  const filled = Math.round((value / maxValue) * maxBarWidth);
  return "█".repeat(filled) + "░".repeat(maxBarWidth - filled);
}

function ageLabel(isoDate: string): string {
  const created = new Date(isoDate).getTime();
  const now = Date.now();
  const diffDays = Math.floor((now - created) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

// ============================================================================
// Generator
// ============================================================================

export async function generateMonthlyBoardPack(
  opts: GenerateBoardPackOpts,
): Promise<string> {
  const doc = new jsPDF({ unit: "in", format: "letter" });

  const header: HeaderOpts = {
    facilityName: opts.facilityName,
    reportTitle: `Monthly Board Pack — ${opts.month}`,
    dateRange: opts.month,
    pageNum: 1,
    totalPages: 1, // backfilled below
  };

  addHeader(doc, header);
  let y = PAGE.margin + 0.9;

  // --------------------------------------------------------------------------
  // Section 1 — Executive Summary
  // --------------------------------------------------------------------------
  y = addSectionTitle(doc, "1. Executive Summary", y);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  const totalIncidents = opts.incidentSummary.total;
  const totalAlerts = opts.alerts.length;
  const criticalAlerts = opts.alerts.filter(
    (a) => a.severity === "critical",
  ).length;
  const aqTrend = opts.airQualitySummary.trend;
  const refTrend = opts.refrigerationSummary.trend;

  // Auto-generated narrative paragraph
  const narrativeLines = [
    `This board pack covers operational performance for ${opts.facilityName} in ${opts.month}.`,
    "",
    `Incidents: ${totalIncidents} total incident(s) were recorded this month, ` +
      `including ${opts.incidentSummary.accidents} accident(s).`,
    "",
    `Air quality: ` +
      (opts.airQualitySummary.avgCoPpm !== null
        ? `Average CO was ${opts.airQualitySummary.avgCoPpm.toFixed(2)} ppm, ` +
          `average NO₂ was ${(opts.airQualitySummary.avgNo2Ppm ?? 0).toFixed(2)} ppm. ` +
          `Trend: ${aqTrend}.`
        : "No air quality data recorded."),
    "",
    `Refrigeration: ` +
      (opts.refrigerationSummary.avgBrineDeltaT !== null
        ? `Average brine ΔT was ${opts.refrigerationSummary.avgBrineDeltaT.toFixed(2)} °F. ` +
          `${opts.refrigerationSummary.daysOutsideNormal} day(s) had readings outside normal range. ` +
          `Trend: ${refTrend}.`
        : "No refrigeration data recorded."),
    "",
    `Active alerts: ${totalAlerts} unresolved alert(s)` +
      (criticalAlerts > 0 ? ` — ${criticalAlerts} CRITICAL.` : "."),
  ];

  for (const line of narrativeLines) {
    y = newPageIfNeeded(doc, y, 0.2, header);
    doc.text(line, PAGE.margin, y, {
      maxWidth: PAGE.width - 2 * PAGE.margin,
    });
    y += line === "" ? 0.08 : 0.2;
  }

  y += 0.2;

  // --------------------------------------------------------------------------
  // Section 2 — Air Quality Overview
  // --------------------------------------------------------------------------
  y = newPageIfNeeded(doc, y, 0.5, header);
  y = addSectionTitle(doc, "2. Air Quality Overview", y);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  const aq = opts.airQualitySummary;

  if (
    aq.avgCoPpm === null &&
    aq.daysNormal === 0 &&
    aq.daysCaution === 0 &&
    aq.daysAction === 0 &&
    aq.daysEvacuate === 0
  ) {
    doc.setFont("helvetica", "italic");
    doc.text("No air quality data for this month.", PAGE.margin, y);
    y += 0.25;
    doc.setFont("helvetica", "normal");
  } else {
    if (aq.avgCoPpm !== null) {
      doc.text(`Average CO:  ${aq.avgCoPpm.toFixed(2)} ppm`, PAGE.margin, y); y += 0.2;
      doc.text(`Average NO₂: ${(aq.avgNo2Ppm ?? 0).toFixed(2)} ppm`, PAGE.margin, y); y += 0.2;
    }
    doc.text(`Trend: ${aq.trend}`, PAGE.margin, y); y += 0.25;

    // Days by tier
    doc.setFont("helvetica", "bold");
    doc.text("Days by tier:", PAGE.margin, y); y += 0.18;
    doc.setFont("helvetica", "normal");

    const tierRows: [string, number][] = [
      ["Normal", aq.daysNormal],
      ["Caution", aq.daysCaution],
      ["Action", aq.daysAction],
      ["Evacuate", aq.daysEvacuate],
    ];
    const maxDays = Math.max(...tierRows.map(([, c]) => c), 1);

    doc.setFontSize(8);
    doc.setFont("courier", "normal"); // monospace for aligned bars
    for (const [tier, count] of tierRows) {
      y = newPageIfNeeded(doc, y, 0.18, header);
      const bar = textBar(count, maxDays, 18);
      const label = `${tier.padEnd(10)} ${bar} ${count}`;
      doc.text(label, PAGE.margin, y);
      y += 0.17;
    }
    doc.setFont("helvetica", "normal");
    y += 0.15;
  }

  // --------------------------------------------------------------------------
  // Section 3 — Refrigeration Summary
  // --------------------------------------------------------------------------
  y = newPageIfNeeded(doc, y, 0.5, header);
  y = addSectionTitle(doc, "3. Refrigeration Summary", y);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  const ref = opts.refrigerationSummary;
  if (ref.avgBrineDeltaT === null && ref.totalReadingDays === 0) {
    doc.setFont("helvetica", "italic");
    doc.text("No refrigeration data for this month.", PAGE.margin, y);
    y += 0.25;
    doc.setFont("helvetica", "normal");
  } else {
    if (ref.avgBrineDeltaT !== null) {
      doc.text(
        `Average brine ΔT (supply − return): ${ref.avgBrineDeltaT.toFixed(2)} °F`,
        PAGE.margin,
        y,
      );
      y += 0.2;
    }
    doc.text(`Total reading days: ${ref.totalReadingDays}`, PAGE.margin, y); y += 0.2;
    doc.text(
      `Days with readings outside normal range: ${ref.daysOutsideNormal}`,
      PAGE.margin,
      y,
    ); y += 0.2;
    doc.text(`Trend: ${ref.trend}`, PAGE.margin, y); y += 0.2;

    if (ref.daysOutsideNormal > 0) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 184, 0); // Alert Yellow
      const pct =
        ref.totalReadingDays === 0
          ? "N/A"
          : `${((ref.daysOutsideNormal / ref.totalReadingDays) * 100).toFixed(0)}%`;
      doc.text(
        `${pct} of reading days had out-of-range values — review recommended.`,
        PAGE.margin,
        y,
      );
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
      y += 0.2;
    }
    y += 0.1;
  }

  // --------------------------------------------------------------------------
  // Section 4 — Incident Log Summary
  // --------------------------------------------------------------------------
  // Since jsPDF cannot embed recharts, a text-based bar chart is used.
  y = newPageIfNeeded(doc, y, 0.5, header);
  y = addSectionTitle(doc, "4. Incident Log Summary", y);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  doc.text(
    `Total incidents: ${opts.incidentSummary.total}   Accidents: ${opts.incidentSummary.accidents}`,
    PAGE.margin,
    y,
  );
  y += 0.25;

  if (Object.keys(opts.incidentSummary.byType).length === 0) {
    doc.setFont("helvetica", "italic");
    doc.text("No incidents recorded.", PAGE.margin, y);
    y += 0.25;
    doc.setFont("helvetica", "normal");
  } else {
    doc.setFont("helvetica", "bold");
    doc.text("By type:", PAGE.margin, y); y += 0.18;

    const typeEntries = Object.entries(opts.incidentSummary.byType);
    const maxCount = Math.max(...typeEntries.map(([, c]) => c), 1);

    doc.setFontSize(8);
    doc.setFont("courier", "normal"); // monospace for aligned bars
    for (const [type, count] of typeEntries) {
      y = newPageIfNeeded(doc, y, 0.18, header);
      const bar = textBar(count, maxCount, 16);
      const label = `${type.slice(0, 18).padEnd(18)} ${bar} ${count}`;
      doc.text(label, PAGE.margin, y);
      y += 0.17;
    }
    doc.setFont("helvetica", "normal");
    y += 0.15;
  }

  // --------------------------------------------------------------------------
  // Section 5 — Active Alerts
  // --------------------------------------------------------------------------
  y = newPageIfNeeded(doc, y, 0.5, header);
  y = addSectionTitle(doc, "5. Active Alerts", y);

  doc.setFontSize(9);

  if (opts.alerts.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.text("No active (unresolved) alerts.", PAGE.margin, y);
    y += 0.25;
    doc.setFont("helvetica", "normal");
  } else {
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    const alertCols = ["Title", "Type", "Severity", "Age"];
    const alertXs = [0.6, 3.2, 5.2, 6.5];
    alertCols.forEach((c, i) => doc.text(c, alertXs[i]!, y));
    y += 0.13;
    doc.setDrawColor(100, 100, 100);
    doc.line(PAGE.margin, y - 0.02, PAGE.width - PAGE.margin, y - 0.02);
    doc.setFont("helvetica", "normal");

    for (const alert of opts.alerts) {
      y = newPageIfNeeded(doc, y, 0.18, header);
      const row = [
        alert.title.slice(0, 36),
        alert.alertType.slice(0, 20),
        alert.severity.toUpperCase(),
        ageLabel(alert.createdAt),
      ];
      // Color-code by severity
      if (alert.severity === "critical") {
        doc.setTextColor(244, 42, 42);
      } else if (alert.severity === "warning") {
        doc.setTextColor(255, 184, 0);
      }
      row.forEach((cell, i) => doc.text(cell, alertXs[i]!, y));
      doc.setTextColor(0, 0, 0);
      y += 0.16;
    }
    y += 0.2;
  }

  // --------------------------------------------------------------------------
  // Section 6 — Operational Checklist Completion
  // --------------------------------------------------------------------------
  y = newPageIfNeeded(doc, y, 0.5, header);
  y = addSectionTitle(doc, "6. Operational Checklist Completion", y);

  doc.setFontSize(9);

  if (opts.completionRates.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.text("No checklist data available.", PAGE.margin, y);
    y += 0.25;
    doc.setFont("helvetica", "normal");
  } else {
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    const crCols = ["Tab / Checklist", "Submitted", "Missed", "Total Days", "% Complete"];
    const crXs = [0.6, 3.2, 4.3, 5.3, 6.5];
    crCols.forEach((c, i) => doc.text(c, crXs[i]!, y));
    y += 0.13;
    doc.setDrawColor(100, 100, 100);
    doc.line(PAGE.margin, y - 0.02, PAGE.width - PAGE.margin, y - 0.02);
    doc.setFont("helvetica", "normal");

    for (const row of opts.completionRates) {
      y = newPageIfNeeded(doc, y, 0.18, header);
      const pct =
        row.totalDays === 0
          ? "N/A"
          : `${((row.submitted / row.totalDays) * 100).toFixed(0)}%`;
      const cells = [
        row.checklistName.slice(0, 30),
        String(row.submitted),
        String(row.missed),
        String(row.totalDays),
        pct,
      ];
      cells.forEach((cell, i) => doc.text(cell, crXs[i]!, y));
      y += 0.16;
    }
    y += 0.2;
  }

  addSignaturePage(doc, { preparedBy: "", reviewedBy: "" });

  // Backfill footers on every page
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
