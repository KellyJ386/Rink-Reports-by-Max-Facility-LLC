import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for /api/cron/retention-sweep route handler.
 *
 * Tests:
 *   1. Missing CRON_SECRET env var → 401
 *   2. Wrong Authorization header → 401
 *   3. Policy with null for a module → that table's soft delete is NOT called
 *   4. Rows older than policy → soft delete called with archived_at
 *   5. Rows with archived_at older than 30 days → hard delete called
 *   6. incidents and air_quality_readings tables are NEVER touched
 */

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

// ------------------------------------------------------------------ //
// Supabase mock infrastructure
// ------------------------------------------------------------------ //

// Track which tables supabase.from() was called with
const fromCallTables: string[] = [];

// Track builder method calls per operation (update/delete/etc.)
const updateSpy = vi.fn();
const deleteSpy = vi.fn();

function makeQueryBuilder() {
  const builder = {
    update: vi.fn((_data: unknown) => {
      updateSpy(_data);
      return builder;
    }),
    delete: vi.fn(() => {
      deleteSpy();
      return builder;
    }),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    maybeSingle: vi.fn(() =>
      Promise.resolve({
        data: {
          retention_policies: {
            dailyReports: 365,
            iceOperations: 365,
            refrigerationReadings: 730,
            iceDepthSessions: 365,
            airQualityReadings: null,
            incidents: null,
          },
        },
        error: null,
      }),
    ),
    // Resolve via thenable for `.select()` chained queries
    then: vi.fn((resolve: (v: unknown) => void) =>
      resolve({ data: [{ id: "row-1" }], error: null }),
    ),
  };
  return builder;
}

// Facilities mock returns two facility IDs
const mockFacilities = [{ id: "facility-a" }, { id: "facility-b" }];

let fromImpl: (table: string) => ReturnType<typeof makeQueryBuilder>;

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => {
      fromCallTables.push(table);
      return fromImpl(table);
    },
  })),
}));

import { GET } from "@/app/api/cron/retention-sweep/route";

function makeRequest(authHeader: string | null): Request {
  const headers = new Headers();
  if (authHeader !== null) {
    headers.set("authorization", authHeader);
  }
  return new Request("http://localhost/api/cron/retention-sweep", {
    method: "GET",
    headers,
  });
}

beforeEach(() => {
  fromCallTables.length = 0;
  updateSpy.mockClear();
  deleteSpy.mockClear();
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-retention-secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

  // Default: facilities list, then facility_config queries, then data rows
  let facilitiesHandled = false;
  fromImpl = (table: string) => {
    const builder = makeQueryBuilder();

    if (table === "facilities" && !facilitiesHandled) {
      facilitiesHandled = true;
      builder.then = vi.fn((resolve: (v: unknown) => void) =>
        resolve({ data: mockFacilities, error: null }),
      );
    }

    if (table === "facility_config") {
      builder.maybeSingle = vi.fn(() =>
        Promise.resolve({
          data: {
            retention_policies: {
              dailyReports: 365,
              iceOperations: 365,
              refrigerationReadings: 730,
              iceDepthSessions: 365,
              airQualityReadings: null,
              incidents: null,
            },
          },
          error: null,
        }),
      );
    }

    return builder;
  };
});

describe("GET /api/cron/retention-sweep", () => {
  it("returns 401 when CRON_SECRET env var is not set", async () => {
    delete process.env.CRON_SECRET;
    const req = makeRequest("Bearer test-retention-secret");
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Unauthorized" });
  });

  it("returns 401 when Authorization header is missing", async () => {
    const req = makeRequest(null);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization header has wrong secret", async () => {
    const req = makeRequest("Bearer wrong-secret");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with summary when secret is valid", async () => {
    const req = makeRequest("Bearer test-retention-secret");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.facilitiesProcessed).toBe(2);
  });

  it("does NOT call update on tables when policy value is null", async () => {
    // Override: return policies where all values are null
    fromImpl = (table: string) => {
      const builder = makeQueryBuilder();

      if (table === "facilities") {
        builder.then = vi.fn((resolve: (v: unknown) => void) =>
          resolve({ data: [{ id: "facility-x" }], error: null }),
        );
      }

      if (table === "facility_config") {
        builder.maybeSingle = vi.fn(() =>
          Promise.resolve({
            data: {
              retention_policies: {
                dailyReports: null,
                iceOperations: null,
                refrigerationReadings: null,
                iceDepthSessions: null,
                airQualityReadings: null,
                incidents: null,
              },
            },
            error: null,
          }),
        );
      }

      return builder;
    };

    const req = makeRequest("Bearer test-retention-secret");
    const res = await GET(req);
    expect(res.status).toBe(200);

    // No data tables should have had update called on them
    const dataTables = fromCallTables.filter(
      (t) => t !== "facilities" && t !== "facility_config",
    );
    expect(dataTables).toHaveLength(0);
  });

  it("never calls supabase.from() with 'incidents'", async () => {
    const req = makeRequest("Bearer test-retention-secret");
    await GET(req);
    expect(fromCallTables).not.toContain("incidents");
  });

  it("never calls supabase.from() with 'air_quality_readings'", async () => {
    const req = makeRequest("Bearer test-retention-secret");
    await GET(req);
    expect(fromCallTables).not.toContain("air_quality_readings");
  });

  it("calls update (soft delete) on data tables when policy day value is set", async () => {
    const tablesUpdated: string[] = [];

    fromImpl = (table: string) => {
      const builder = makeQueryBuilder();

      if (table === "facilities") {
        builder.then = vi.fn((resolve: (v: unknown) => void) =>
          resolve({ data: [{ id: "facility-y" }], error: null }),
        );
      } else if (table === "facility_config") {
        builder.maybeSingle = vi.fn(() =>
          Promise.resolve({
            data: {
              retention_policies: {
                dailyReports: 365,
                iceOperations: 365,
                refrigerationReadings: 730,
                iceDepthSessions: 365,
              },
            },
            error: null,
          }),
        );
      } else {
        // data table — track update calls
        builder.update = vi.fn((_data: unknown) => {
          tablesUpdated.push(table);
          return builder;
        });
      }

      return builder;
    };

    const req = makeRequest("Bearer test-retention-secret");
    const res = await GET(req);
    expect(res.status).toBe(200);

    // All four configured tables should have been soft-deleted
    expect(tablesUpdated).toContain("daily_reports");
    expect(tablesUpdated).toContain("ice_operations");
    expect(tablesUpdated).toContain("refrigeration_readings");
    expect(tablesUpdated).toContain("ice_depth_sessions");
  });

  it("calls delete (hard delete) on data tables for rows archived >30 days ago", async () => {
    const tablesDeleted: string[] = [];

    fromImpl = (table: string) => {
      const builder = makeQueryBuilder();

      if (table === "facilities") {
        builder.then = vi.fn((resolve: (v: unknown) => void) =>
          resolve({ data: [{ id: "facility-z" }], error: null }),
        );
      } else if (table === "facility_config") {
        builder.maybeSingle = vi.fn(() =>
          Promise.resolve({
            data: {
              retention_policies: {
                dailyReports: 365,
                iceOperations: 365,
                refrigerationReadings: 730,
                iceDepthSessions: 365,
              },
            },
            error: null,
          }),
        );
      } else {
        // data table — track delete calls
        builder.delete = vi.fn(() => {
          tablesDeleted.push(table);
          return builder;
        });
      }

      return builder;
    };

    const req = makeRequest("Bearer test-retention-secret");
    const res = await GET(req);
    expect(res.status).toBe(200);

    // Hard delete should have been called on all four data tables
    expect(tablesDeleted).toContain("daily_reports");
    expect(tablesDeleted).toContain("ice_operations");
    expect(tablesDeleted).toContain("refrigeration_readings");
    expect(tablesDeleted).toContain("ice_depth_sessions");
  });
});
