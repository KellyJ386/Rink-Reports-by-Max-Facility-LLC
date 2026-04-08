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

// TODO: Verify current USA Hockey rink safety standards at usahockey.com before
// using this as an official report. Standards are updated periodically; this
// generator reflects best-effort field mapping as of April 2026.
//
// ASHRAE 62.1 and local jurisdiction standards apply to air quality requirements
// in ice arenas. Always cross-reference against your local building code and
// health department regulations.

// ============================================================================
// Input types
// ============================================================================

/**
 * One ice depth measurement session row from public.ice_depth_sessions.
 * Measurements is a map of point number (string) → depth value in the
 * template's unit (in or mm).
 */
export interface IceDepthSessionData {
  submitted_at: string;
  resurfacing_status: "pre" | "mid" | "post" | null;
  measurements: Record<string, number>;
  notes: string | null;
  // Minimum depth for this session's template (from facility config)
  minimumDepth?: number;
  // Unit for this template ("in" | "mm")
  unit?: string;
}

/**
 * One air quality reading from public.air_quality_readings.
 * tier is frozen at insert time by the /api/sync handler.
 */
export interface AirQualityReadingData {
  submitted_at: string;
  co_ppm: number;
  no2_ppm: number;
  tier: string; // "normal" | "caution" | "action" | "evacuate"
}

/**
 * One incident row from public.incidents.
 * kind discriminates incident vs accident; data is the JSONB blob.
 */
export interface IncidentRowData {
  occurred_at: string;
  kind: "incident" | "accident";
  incident_type: string;
  location: string;
  description: string;
}

/**
 * One daily report completion summary by checklist (tab).
 */
export interface DailyReportCompletionData {
  checklistName: string;
  submitted: number;
  missed: number;
  totalDays: number;
}

export interface GenerateUsaHockeySafetyOpts {
  facilityName: string;
  // ISO date string for the report date / period end
  reportDate: string;
  iceDepthData: IceDepthSessionData[];
  airQualityData: AirQualityReadingData[];
  incidentData: IncidentRowData[];
  dailyReportData: DailyReportCompletionData[];
}

// ============================================================================
// Generator
// ============================================================================

export async function generateUsaHockeySafety(
  opts: GenerateUsaHockeySafetyOpts,
): Promise<string> {
  const doc = new jsPDF({ unit: "in", format: "letter" });

  const reportDateDisplay = opts.reportDate.slice(0, 10);
  const header: HeaderOpts = {
    facilityName: opts.facilityName,
    reportTitle: "USA Hockey Rink Safety Report",
    dateRange: `As of ${reportDateDisplay}`,
    pageNum: 1,
    totalPages: 1, // backfilled below
  };

  addHeader(doc, header);
  let y = PAGE.margin + 0.9;

  // --------------------------------------------------------------------------
  // Section 1 — Ice Surface Conditions
  // --------------------------------------------------------------------------
  // USA Hockey requires ice to be maintained at a safe skating depth.
  // Industry standard minimum is approximately 1.5 inches (38 mm).
  // The threshold used here comes from the facility config (minimumDepth);
  // the generator flags readings below that threshold.
  // TODO: Confirm minimum depth requirement with current USA Hockey Safety
  // Handbook before using this section in regulatory correspondence.
  y = addSectionTitle(doc, "1. Ice Surface Conditions", y);

  doc.setFontSize(9);

  if (opts.iceDepthData.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.text("No ice depth sessions recorded for this period.", PAGE.margin, y);
    y += 0.25;
    doc.setFont("helvetica", "normal");
  } else {
    // Summarize thin spots: points below minimumDepth
    let totalThinSpots = 0;
    let totalPoints = 0;

    for (const session of opts.iceDepthData) {
      const entries = Object.entries(session.measurements);
      totalPoints += entries.length;
      if (session.minimumDepth !== undefined) {
        totalThinSpots += entries.filter(
          ([, v]) => v < (session.minimumDepth ?? 0),
        ).length;
      }
    }

    doc.setFont("helvetica", "normal");
    doc.text(`Total sessions recorded: ${opts.iceDepthData.length}`, PAGE.margin, y);
    y += 0.2;
    doc.text(`Total measurement points: ${totalPoints}`, PAGE.margin, y);
    y += 0.2;

    if (totalThinSpots > 0) {
      // Flag thin spots prominently
      doc.setFont("helvetica", "bold");
      doc.setTextColor(244, 42, 42); // Alert Red #F42A2A
      doc.text(
        `THIN SPOTS FLAGGED: ${totalThinSpots} point(s) below minimum depth threshold.`,
        PAGE.margin,
        y,
      );
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
      y += 0.2;
    } else {
      doc.setTextColor(0, 150, 0);
      doc.text(
        "All measured points at or above minimum depth threshold.",
        PAGE.margin,
        y,
      );
      doc.setTextColor(0, 0, 0);
      y += 0.2;
    }

    y += 0.1;

    // Session detail table (date, resurfacing status, avg depth, thin spots)
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    const iceCols = ["Date", "Phase", "Avg Depth", "Points", "Thin Spots"];
    const iceXs = [0.6, 2.2, 3.4, 4.8, 5.8];
    iceCols.forEach((c, i) => doc.text(c, iceXs[i]!, y));
    y += 0.13;
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.005);
    doc.line(PAGE.margin, y - 0.02, PAGE.width - PAGE.margin, y - 0.02);

    doc.setFont("helvetica", "normal");
    for (const session of opts.iceDepthData) {
      y = newPageIfNeeded(doc, y, 0.18, header);
      const vals = Object.values(session.measurements);
      const avgDepth =
        vals.length === 0
          ? "N/A"
          : (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
      const thinPts =
        session.minimumDepth !== undefined
          ? String(vals.filter((v) => v < (session.minimumDepth ?? 0)).length)
          : "N/A";

      const row = [
        session.submitted_at.slice(0, 10),
        session.resurfacing_status ?? "—",
        `${avgDepth} ${session.unit ?? ""}`.trim(),
        String(vals.length),
        thinPts,
      ];
      row.forEach((cell, i) => doc.text(cell, iceXs[i]!, y));
      y += 0.16;
    }
    y += 0.2;
  }

  // --------------------------------------------------------------------------
  // Section 2 — Air Quality Compliance
  // --------------------------------------------------------------------------
  // ASHRAE 62.1 and local jurisdiction standards govern indoor air quality
  // in ice arenas. CO limits typically range from 9–35 ppm (area-dependent);
  // NO₂ limits from 0.053–0.1 ppm depending on jurisdiction and standard.
  // The tier labels here are those assigned by the /api/sync handler at
  // submission time against the facility's configured thresholds.
  y = newPageIfNeeded(doc, y, 0.5, header);
  y = addSectionTitle(doc, "2. Air Quality Compliance", y);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  if (opts.airQualityData.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.text("No air quality readings recorded for this period.", PAGE.margin, y);
    y += 0.25;
    doc.setFont("helvetica", "normal");
  } else {
    const tierCounts: Record<string, number> = {
      normal: 0,
      caution: 0,
      action: 0,
      evacuate: 0,
    };
    let totalCo = 0;
    let totalNo2 = 0;

    for (const r of opts.airQualityData) {
      tierCounts[r.tier] = (tierCounts[r.tier] ?? 0) + 1;
      totalCo += r.co_ppm;
      totalNo2 += r.no2_ppm;
    }

    const n = opts.airQualityData.length;
    doc.text(`Total readings: ${n}`, PAGE.margin, y); y += 0.2;
    doc.text(
      `Average CO: ${(totalCo / n).toFixed(2)} ppm   Average NO₂: ${(totalNo2 / n).toFixed(2)} ppm`,
      PAGE.margin,
      y,
    );
    y += 0.2;

    // Tier breakdown
    doc.setFont("helvetica", "bold");
    doc.text("Tier distribution:", PAGE.margin, y); y += 0.18;
    doc.setFont("helvetica", "normal");
    doc.text(`  Normal:   ${tierCounts["normal"] ?? 0} reading(s)`, PAGE.margin, y); y += 0.17;
    doc.text(`  Caution:  ${tierCounts["caution"] ?? 0} reading(s)`, PAGE.margin, y); y += 0.17;

    const actionCount = tierCounts["action"] ?? 0;
    const evacuateCount = tierCounts["evacuate"] ?? 0;

    if (actionCount > 0) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 184, 0); // Alert Yellow
      doc.text(`  Action:   ${actionCount} reading(s) — REVIEW REQUIRED`, PAGE.margin, y);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
    } else {
      doc.text(`  Action:   ${actionCount} reading(s)`, PAGE.margin, y);
    }
    y += 0.17;

    if (evacuateCount > 0) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(244, 42, 42); // Alert Red
      doc.text(`  Evacuate: ${evacuateCount} reading(s) — CRITICAL`, PAGE.margin, y);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
    } else {
      doc.text(`  Evacuate: ${evacuateCount} reading(s)`, PAGE.margin, y);
    }
    y += 0.25;

    // Recent elevated readings table (caution and above only)
    const elevated = opts.airQualityData.filter(
      (r) => r.tier === "caution" || r.tier === "action" || r.tier === "evacuate",
    );

    if (elevated.length > 0) {
      y = newPageIfNeeded(doc, y, 0.4, header);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(`Elevated readings (${elevated.length}):`, PAGE.margin, y);
      y += 0.18;

      doc.setFontSize(7);
      const aqCols = ["Date/Time", "CO ppm", "NO₂ ppm", "Tier"];
      const aqXs = [0.6, 2.2, 3.4, 4.5];
      aqCols.forEach((c, i) => doc.text(c, aqXs[i]!, y));
      y += 0.13;
      doc.setDrawColor(100, 100, 100);
      doc.line(PAGE.margin, y - 0.02, PAGE.width - PAGE.margin, y - 0.02);

      doc.setFont("helvetica", "normal");
      for (const r of elevated) {
        y = newPageIfNeeded(doc, y, 0.18, header);
        const tierLabel = r.tier.toUpperCase();
        const row = [
          r.submitted_at.slice(0, 16).replace("T", " "),
          r.co_ppm.toFixed(2),
          r.no2_ppm.toFixed(2),
          tierLabel,
        ];
        row.forEach((cell, i) => doc.text(cell, aqXs[i]!, y));
        y += 0.16;
      }
    }
    y += 0.2;
  }

  // --------------------------------------------------------------------------
  // Section 3 — Incident Summary
  // --------------------------------------------------------------------------
  // USA Hockey and local risk management requirements mandate incident tracking.
  // High-frequency locations (2+ incidents) are flagged for remedial review.
  y = newPageIfNeeded(doc, y, 0.5, header);
  y = addSectionTitle(doc, "3. Incident Summary", y);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  if (opts.incidentData.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.text("No incidents recorded for this period.", PAGE.margin, y);
    y += 0.25;
    doc.setFont("helvetica", "normal");
  } else {
    doc.text(`Total incidents: ${opts.incidentData.length}`, PAGE.margin, y); y += 0.2;

    // Count by type
    const typeCounts: Record<string, number> = {};
    for (const inc of opts.incidentData) {
      typeCounts[inc.incident_type] = (typeCounts[inc.incident_type] ?? 0) + 1;
    }

    doc.setFont("helvetica", "bold");
    doc.text("By type:", PAGE.margin, y); y += 0.18;
    doc.setFont("helvetica", "normal");
    for (const [type, count] of Object.entries(typeCounts)) {
      y = newPageIfNeeded(doc, y, 0.18, header);
      doc.text(`  ${type}: ${count}`, PAGE.margin, y); y += 0.17;
    }
    y += 0.1;

    // Locations with 2+ incidents — flagged
    const locCounts: Record<string, number> = {};
    for (const inc of opts.incidentData) {
      locCounts[inc.location] = (locCounts[inc.location] ?? 0) + 1;
    }
    const flaggedLocs = Object.entries(locCounts).filter(([, c]) => c >= 2);

    if (flaggedLocs.length > 0) {
      y = newPageIfNeeded(doc, y, 0.3, header);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(244, 42, 42);
      doc.text(
        `High-frequency locations (2+ incidents) — remedial review recommended:`,
        PAGE.margin,
        y,
      );
      doc.setTextColor(0, 0, 0);
      y += 0.18;
      doc.setFont("helvetica", "normal");
      for (const [loc, count] of flaggedLocs) {
        y = newPageIfNeeded(doc, y, 0.18, header);
        doc.text(`  ${loc}: ${count} incidents`, PAGE.margin, y); y += 0.17;
      }
    }
    y += 0.2;
  }

  // --------------------------------------------------------------------------
  // Section 4 — Daily Checklist Completion
  // --------------------------------------------------------------------------
  // USA Hockey recommends daily facility inspection checklists. This section
  // shows submission rates per configured checklist tab (from facility_config).
  // Low completion rates indicate potential safety gaps.
  y = newPageIfNeeded(doc, y, 0.5, header);
  y = addSectionTitle(doc, "4. Daily Checklist Completion", y);

  doc.setFontSize(9);

  if (opts.dailyReportData.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.text("No daily report data available for this period.", PAGE.margin, y);
    y += 0.25;
    doc.setFont("helvetica", "normal");
  } else {
    // Table header
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    const drCols = ["Checklist (Tab)", "Submitted", "Missed", "Total Days", "% Complete"];
    const drXs = [0.6, 3.2, 4.2, 5.2, 6.3];
    drCols.forEach((c, i) => doc.text(c, drXs[i]!, y));
    y += 0.13;
    doc.setDrawColor(100, 100, 100);
    doc.line(PAGE.margin, y - 0.02, PAGE.width - PAGE.margin, y - 0.02);
    doc.setFont("helvetica", "normal");

    for (const row of opts.dailyReportData) {
      y = newPageIfNeeded(doc, y, 0.18, header);
      const pct =
        row.totalDays === 0
          ? "N/A"
          : `${((row.submitted / row.totalDays) * 100).toFixed(0)}%`;
      const cells = [
        row.checklistName.slice(0, 32),
        String(row.submitted),
        String(row.missed),
        String(row.totalDays),
        pct,
      ];
      cells.forEach((cell, i) => doc.text(cell, drXs[i]!, y));
      y += 0.16;
    }
    y += 0.2;
  }

  // --------------------------------------------------------------------------
  // Section 5 — Certification
  // --------------------------------------------------------------------------
  y = newPageIfNeeded(doc, y, 0.8, header);
  y = addSectionTitle(doc, "5. Certification", y);

  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.text(
    "I certify that the information in this report is true and accurate to the best of my " +
      "knowledge, and that the facility has been maintained in a manner consistent with " +
      "applicable safety standards.",
    PAGE.margin,
    y,
    { maxWidth: PAGE.width - 2 * PAGE.margin },
  );
  y += 0.45;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Facility Manager:", PAGE.margin, y);
  doc.line(PAGE.margin + 1.5, y, PAGE.margin + 5.0, y);
  doc.text("Date:", PAGE.margin + 5.2, y);
  doc.line(PAGE.margin + 5.7, y, PAGE.width - PAGE.margin, y);

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
