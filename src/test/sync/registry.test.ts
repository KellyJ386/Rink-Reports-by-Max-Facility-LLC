import { describe, it, expect } from "vitest";
import { handlerRegistry } from "@/server/sync/registry";

describe("handlerRegistry", () => {
  const EXPECTED_TABLES = [
    "daily_reports",
    "ice_operations",
    "air_quality_readings",
    "ice_depth_sessions",
    "incidents",
    "refrigeration_readings",
  ] as const;

  it("registers every expected table", () => {
    for (const table of EXPECTED_TABLES) {
      expect(handlerRegistry.has(table)).toBe(true);
    }
  });

  it("returns undefined for an unknown table", () => {
    expect(handlerRegistry.get("no_such_table")).toBeUndefined();
  });

  it("each handler has table and handle properties", () => {
    for (const table of EXPECTED_TABLES) {
      const handler = handlerRegistry.get(table);
      expect(handler).toBeDefined();
      expect(typeof handler!.table).toBe("string");
      expect(typeof handler!.handle).toBe("function");
    }
  });
});
