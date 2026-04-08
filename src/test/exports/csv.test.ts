import { describe, it, expect } from "vitest";
import { arrayToCsv } from "@/server/exports/csv";

describe("arrayToCsv", () => {
  it("starts with a UTF-8 BOM for Excel compatibility", () => {
    const result = arrayToCsv(["Header"], [["Value"]]);
    expect(result.startsWith("\uFEFF")).toBe(true);
  });

  it("escapes commas in values by quoting the cell", () => {
    const result = arrayToCsv(["Col"], [["a,b,c"]]);
    expect(result).toContain('"a,b,c"');
  });

  it("escapes double-quotes in values by doubling them", () => {
    const result = arrayToCsv(["Col"], [[`say "hello"`]]);
    // The cell should be wrapped in quotes with inner quotes doubled
    expect(result).toContain('"say ""hello"""');
  });

  it("renders null cells as empty string, not the text 'null'", () => {
    const result = arrayToCsv(["A", "B"], [[null, "x"]]);
    // After BOM and header line, the data line should start with a comma (empty first cell)
    const dataLine = result.split("\n")[1];
    expect(dataLine).toBe(",x");
    expect(result).not.toContain("null");
  });

  it("renders undefined cells as empty string", () => {
    const result = arrayToCsv(["A"], [[undefined as unknown as null]]);
    const dataLine = result.split("\n")[1];
    expect(dataLine).toBe("");
    expect(result).not.toContain("undefined");
  });

  it("renders numeric cells as-is", () => {
    const result = arrayToCsv(["N"], [[42]]);
    const dataLine = result.split("\n")[1];
    expect(dataLine).toBe("42");
  });

  it("escapes newlines in values by quoting the cell", () => {
    const result = arrayToCsv(["Col"], [["line1\nline2"]]);
    expect(result).toContain('"line1\nline2"');
  });

  it("produces correct structure: BOM + header + data rows", () => {
    const result = arrayToCsv(["A", "B"], [["1", "2"], ["3", "4"]]);
    const lines = result.slice(1).split("\n"); // remove BOM
    expect(lines[0]).toBe("A,B");
    expect(lines[1]).toBe("1,2");
    expect(lines[2]).toBe("3,4");
  });
});
