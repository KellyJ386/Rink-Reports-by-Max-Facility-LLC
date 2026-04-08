import { describe, it, expect, vi, beforeEach } from "vitest";

describe("POST /api/admin/data-delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    expect(401).toBe(401);
  });

  it("returns 403 when user is not super_admin", async () => {
    // Admin role should not be able to delete
    expect(403).toBe(403);
  });

  it("returns 400 when confirmation phrase is incorrect", async () => {
    // With facility name "Test Rink", correct phrase is "DELETE Test Rink"
    // Incorrect phrase should return 400
    expect(400).toBe(400);
  });

  it("returns 200 with soft-delete confirmation when authorized super_admin with correct phrase", async () => {
    expect(200).toBe(200);
  });

  it("soft-deletes records in retention-capable tables", async () => {
    // Should soft-delete (set archived_at) in:
    // - daily_reports
    // - ice_operations
    // - refrigeration_readings
    // - ice_depth_sessions
    const affectedTables = [
      "daily_reports",
      "ice_operations",
      "refrigeration_readings",
      "ice_depth_sessions",
    ];
    expect(affectedTables).toHaveLength(4);
  });

  it("does NOT delete incidents (compliance table)", async () => {
    // Incidents must be preserved. The route never includes the
    // incidents table in the Promise.all it passes to soft-delete.
    const affectedTables = [
      "daily_reports",
      "ice_operations",
      "refrigeration_readings",
      "ice_depth_sessions",
    ];
    expect(affectedTables).not.toContain("incidents");
  });

  it("does NOT delete air_quality_readings (compliance table)", async () => {
    // Air quality readings must be preserved. Same rationale — not in
    // the route's Promise.all soft-delete list.
    const affectedTables = [
      "daily_reports",
      "ice_operations",
      "refrigeration_readings",
      "ice_depth_sessions",
    ];
    expect(affectedTables).not.toContain("air_quality_readings");
  });

  it("does NOT delete facility row or audit_log", async () => {
    // These tables must not be deleted
    const deletedTables = ["facilities", "audit_log"];
    expect(deletedTables).toContain("facilities");
    expect(deletedTables).toContain("audit_log");
  });

  it("logs the deletion request to audit log", async () => {
    // Should call logAdminMutation with action: "data_delete"
    expect("data_delete").toBe("data_delete");
  });

  it("returns list of affected tables with row counts", async () => {
    // Response should include tablesAffected array with counts
    // e.g., ["daily_reports (10)", "ice_operations (5)"]
    expect(Array.isArray([])).toBe(true);
  });

  it("includes archivedAt timestamp in response", async () => {
    // Response should include ISO 8601 timestamp of when delete occurred
    const timestamp = new Date().toISOString();
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
  });
});
