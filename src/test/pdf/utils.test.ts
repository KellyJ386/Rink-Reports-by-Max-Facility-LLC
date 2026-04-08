/**
 * Tests for the shared PDF utility functions in src/server/pdf/utils.ts.
 *
 * Verifies:
 *   - addHeader: does not throw; page count stays at 1
 *   - newPageIfNeeded: adds a page on overflow; does not add a page when content fits
 *   - addSignaturePage: adds exactly one page
 *   - docToBase64: returns a non-empty string
 */

import { describe, it, expect } from "vitest";
import jsPDF from "jspdf";
import {
  PAGE,
  addHeader,
  addSignaturePage,
  newPageIfNeeded,
  docToBase64,
  type HeaderOpts,
} from "@/server/pdf/utils";

function makeDoc(): jsPDF {
  return new jsPDF({ unit: "in", format: "letter" });
}

const HEADER_OPTS: HeaderOpts = {
  facilityName: "Test Rink",
  reportTitle: "Unit Test Report",
  dateRange: "2026-04-08",
  pageNum: 1,
  totalPages: 1,
};

describe("addHeader", () => {
  it("does not throw and page count stays at 1", () => {
    const doc = makeDoc();
    expect(() => addHeader(doc, HEADER_OPTS)).not.toThrow();
    expect(doc.getNumberOfPages()).toBe(1);
  });
});

describe("newPageIfNeeded", () => {
  it("does not add a page when content fits", () => {
    const doc = makeDoc();
    addHeader(doc, HEADER_OPTS);
    const y = 2.0; // well within the page
    const before = doc.getNumberOfPages();
    newPageIfNeeded(doc, y, 0.2, HEADER_OPTS);
    expect(doc.getNumberOfPages()).toBe(before);
  });

  it("adds a page when content overflows the bottom margin", () => {
    const doc = makeDoc();
    addHeader(doc, HEADER_OPTS);
    // Place y so that y + requiredHeight > PAGE.height - 0.6
    const y = PAGE.height - 0.5; // very close to bottom
    const requiredHeight = 0.5;
    const before = doc.getNumberOfPages();
    newPageIfNeeded(doc, y, requiredHeight, HEADER_OPTS);
    expect(doc.getNumberOfPages()).toBe(before + 1);
  });
});

describe("addSignaturePage", () => {
  it("adds exactly one page", () => {
    const doc = makeDoc();
    addHeader(doc, HEADER_OPTS);
    const before = doc.getNumberOfPages();
    addSignaturePage(doc, { preparedBy: "Alice", reviewedBy: "Bob" });
    expect(doc.getNumberOfPages()).toBe(before + 1);
  });
});

describe("docToBase64", () => {
  it("returns a non-empty string", () => {
    const doc = makeDoc();
    addHeader(doc, HEADER_OPTS);
    const result = docToBase64(doc);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
