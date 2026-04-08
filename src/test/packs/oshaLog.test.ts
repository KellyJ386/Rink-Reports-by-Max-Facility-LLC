/**
 * Tests for the OSHA 300/300A injury log PDF generator.
 *
 * Verifies:
 *   1. Empty incidents array → valid base64 string is returned (non-empty,
 *      decodable, begins with the PDF magic bytes %PDF after decode).
 *   2. Incident with all fields → the returned base64 round-trips to a
 *      string containing the employee name (regression guard against
 *      the name being silently dropped before the PDF data stream).
 *
 * jsPDF runs in jsdom without issues; no server-only modules are called
 * directly in the generator, so the stub covers the import declaration.
 */

import { describe, it, expect } from "vitest";
import { generateOshaLog, type OshaIncident } from "@/server/pdf/packs/oshaInjuryLog";

// ── Fixtures ───────────────────────────────────────────────────────────────

const BASE_OPTS = {
  facilityName: "Test Arena",
  facilityAddress: "123 Ice Way, Springfield, IL 62701",
  year: 2025,
  facilityId: "00000000-0000-0000-0000-000000000001",
};

const SAMPLE_INCIDENT: OshaIncident = {
  caseNo: 1,
  employeeName: "Jane Smith",
  jobTitle: "Zamboni Operator",
  dateOfInjury: "2025-06-15",
  location: "Ice Surface",
  description: "Slipped on resurfacer ramp",
  classification: "days_away",
  daysAway: 3,
  daysRestricted: 0,
  injuryType: "Injury",
};

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Decode base64 to a raw string (Latin-1 / binary) for assertion purposes.
 * We look for ASCII substrings in the PDF text stream.
 */
function base64ToString(b64: string): string {
  // atob is available in jsdom (Vitest jsdom env)
  return atob(b64);
}

function isValidBase64(s: string): boolean {
  if (!s || s.length === 0) return false;
  // Base64 alphabet + optional padding
  return /^[A-Za-z0-9+/]+=*$/.test(s);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("generateOshaLog", () => {
  it("empty incidents array → returns non-empty valid base64 string", async () => {
    const result = await generateOshaLog({
      ...BASE_OPTS,
      incidents: [],
    });

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(isValidBase64(result)).toBe(true);

    // Sanity: decoded bytes should start with the PDF magic bytes (%PDF)
    const decoded = base64ToString(result);
    expect(decoded.startsWith("%PDF")).toBe(true);
  });

  it("incident with all fields → base64 decodes and contains employee name", async () => {
    const result = await generateOshaLog({
      ...BASE_OPTS,
      incidents: [SAMPLE_INCIDENT],
    });

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(isValidBase64(result)).toBe(true);

    const decoded = base64ToString(result);
    // jsPDF encodes text in the PDF content stream. "Jane Smith" should appear
    // as a literal substring in the raw PDF bytes (the name is short enough
    // to appear uncompressed in the default jsPDF output).
    expect(decoded).toContain("Jane Smith");
  });

  it("multiple incidents → row count reflected in base64 output", async () => {
    const incidents: OshaIncident[] = Array.from({ length: 5 }, (_, i) => ({
      ...SAMPLE_INCIDENT,
      caseNo: i + 1,
      employeeName: `Employee ${i + 1}`,
    }));

    const result = await generateOshaLog({
      ...BASE_OPTS,
      incidents,
    });

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);

    // Every employee name should appear in the decoded PDF
    const decoded = base64ToString(result);
    for (let i = 1; i <= 5; i++) {
      expect(decoded).toContain(`Employee ${i}`);
    }
  });

  it("with peakEmployment and hoursWorked → returns valid base64", async () => {
    const result = await generateOshaLog({
      ...BASE_OPTS,
      incidents: [SAMPLE_INCIDENT],
      peakEmployment: 42,
      hoursWorked: 87360,
    });

    expect(typeof result).toBe("string");
    expect(isValidBase64(result)).toBe(true);
  });
});
