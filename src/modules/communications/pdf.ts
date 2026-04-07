"use client";

import { jsPDF } from "jspdf";

import {
  fetchOutdoorTemperature,
  type TemperatureUnit,
} from "@/modules/communications/weather";

/**
 * Universal Module Header — stamped on every PDF generated through
 * the Communications module. Contains:
 *
 *   * Facility name
 *   * User name
 *   * Module name
 *   * Date & time at generation
 *   * Outdoor temperature (looked up live via Open-Meteo + Zippopotam.us)
 *
 * The body of the PDF is a list of (label, value) rows the caller
 * passes in. This keeps the renderer module-agnostic — Daily Reports
 * passes one row per checklist item, Ice Depth passes one row per
 * measured point, etc.
 */

export interface UniversalHeader {
  facilityName: string;
  userName: string;
  moduleName: string;
  postalCode?: string;
  country?: string;
  temperatureUnit: TemperatureUnit;
}

export interface PdfRow {
  label: string;
  value: string;
}

export interface GeneratePdfInput {
  header: UniversalHeader;
  title: string;
  rows: readonly PdfRow[];
  /** Optional notes paragraph appended at the bottom. */
  notes?: string;
}

export interface GeneratedPdf {
  blob: Blob;
  filename: string;
}

export async function generateModulePdf(
  input: GeneratePdfInput,
): Promise<GeneratedPdf> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  // Best-effort outdoor temp lookup. If the facility hasn't entered a
  // postal code or the API call fails, the header just omits the temp.
  let tempLine: string | null = null;
  if (input.header.postalCode) {
    const reading = await fetchOutdoorTemperature(
      input.header.postalCode,
      input.header.country ?? "us",
      input.header.temperatureUnit,
    );
    if (reading) {
      tempLine = `${reading.value}°${reading.unit.toUpperCase()}`;
    }
  }

  const now = new Date();
  const timestamp = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

  // ---- Header band -----------------------------------------------
  const left = 48;
  let y = 60;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(input.header.facilityName, left, y);
  y += 22;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  const headerLines: string[] = [
    `Module: ${input.header.moduleName}`,
    `User: ${input.header.userName}`,
    `Generated: ${timestamp}`,
  ];
  if (tempLine) headerLines.push(`Outdoor temperature: ${tempLine}`);
  for (const line of headerLines) {
    doc.text(line, left, y);
    y += 14;
  }

  // Separator
  y += 6;
  doc.setDrawColor(180);
  doc.line(left, y, 612 - left, y);
  y += 18;

  // ---- Title -----------------------------------------------------
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(input.title, left, y);
  y += 22;

  // ---- Body rows -------------------------------------------------
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  const labelWidth = 200;
  const wrapWidth = 612 - left * 2 - labelWidth - 12;
  for (const row of input.rows) {
    if (y > 720) {
      doc.addPage();
      y = 60;
    }
    doc.setFont("helvetica", "bold");
    doc.text(row.label, left, y);
    doc.setFont("helvetica", "normal");
    const wrapped = doc.splitTextToSize(row.value, wrapWidth);
    doc.text(wrapped, left + labelWidth, y);
    y += 14 * Math.max(1, wrapped.length);
  }

  // ---- Notes -----------------------------------------------------
  if (input.notes) {
    if (y > 700) {
      doc.addPage();
      y = 60;
    }
    y += 14;
    doc.setFont("helvetica", "bold");
    doc.text("Notes", left, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    const wrapped = doc.splitTextToSize(input.notes, 612 - left * 2);
    doc.text(wrapped, left, y);
  }

  const blob = doc.output("blob");
  const safeTitle = input.title.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  const filename = `${safeTitle}_${now.toISOString().slice(0, 10)}.pdf`;
  return { blob, filename };
}
