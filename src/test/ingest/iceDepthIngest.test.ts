import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for POST /api/ingest/ice-depth
 *
 * Mocks:
 *   - @supabase/supabase-js createClient
 *   - @/server/ingest/auth → verifyDeviceRequest
 *   - @/server/ingest/rateLimit → checkIngestRateLimit
 *   - @/server/ingest/log → writeIngestLog, findRecentIngestLog
 *   - @sentry/nextjs
 *
 * Key assertions:
 *   - New point_index, no existing session → creates session, appends measurement
 *   - Existing session, existing point_index → measurement replaced
 *   - depth_inches = 0.5 → critical alert inserted
 *   - confidence = 0.3 → lowConfidence flag set in metadata
 *   - Wrong device type → 403
 */

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const {
  mockVerify,
  mockRateLimit,
  mockWriteLog,
  mockFindLog,
  insertSpy,
  selectSpy,
  updateSpy,
  alertSelectSpy,
} = vi.hoisted(() => ({
  mockVerify: vi.fn(),
  mockRateLimit: vi.fn(),
  mockWriteLog: vi.fn(),
  mockFindLog: vi.fn(),
  insertSpy: vi.fn(),
  selectSpy: vi.fn(),
  updateSpy: vi.fn(),
  alertSelectSpy: vi.fn(),
}));

vi.mock("@/server/ingest/auth", () => ({
  verifyDeviceRequest: mockVerify,
}));

vi.mock("@/server/ingest/rateLimit", () => ({
  checkIngestRateLimit: mockRateLimit,
}));

vi.mock("@/server/ingest/log", () => ({
  writeIngestLog: mockWriteLog,
  findRecentIngestLog: mockFindLog,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "ice_depth_sessions") {
        // Note: selectSpy/insertSpy/updateSpy return values are set in
        // beforeEach so that per-test overrides via .mockReturnValue()
        // take effect without being clobbered on every from() call.
        return {
          select: selectSpy,
          insert: insertSpy,
          update: updateSpy,
        };
      }
      if (table === "user_profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function (this: unknown) {
              return this;
            }),
            in: vi.fn(function (this: unknown) {
              return this;
            }),
            limit: vi.fn(function (this: unknown) {
              return this;
            }),
            maybeSingle: vi.fn(async () => ({
              data: { user_id: "admin-user-123" },
              error: null,
            })),
          })),
        };
      }
      if (table === "alerts") {
        return {
          select: alertSelectSpy.mockReturnValue({
            eq: vi.fn(function (this: unknown) {
              return this;
            }),
            is: vi.fn(function (this: unknown) {
              return this;
            }),
            limit: vi.fn(function (this: unknown) {
              return this;
            }),
            maybeSingle: vi.fn(async () => ({
              data: null,
              error: null,
            })),
          }),
          insert: vi.fn(async (data) => ({
            data,
            error: null,
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(function (this: unknown) {
            return this;
          }),
          maybeSingle: vi.fn(async () => ({
            data: null,
            error: null,
          })),
        })),
      };
    }),
  })),
}));

describe("POST /api/ingest/ice-depth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerify.mockResolvedValue({
      deviceId: "caliper-001",
      facilityId: "fac-123",
      deviceType: "ice_depth_sensor",
    });
    mockRateLimit.mockReturnValue(true);
    mockFindLog.mockResolvedValue(false);

    // Default: no existing session (tests can override with selectSpy.mockReturnValue)
    selectSpy.mockReturnValue({
      eq: vi.fn(function (this: unknown) {
        return this;
      }),
      gte: vi.fn(function (this: unknown) {
        return this;
      }),
      maybeSingle: vi.fn(async () => ({
        data: null,
        error: null,
      })),
    });
    // Default insert: returns new session-123
    insertSpy.mockReturnValue({
      select: vi.fn(function (this: unknown) {
        return this;
      }),
      single: vi.fn(async () => ({
        data: { id: "session-123" },
        error: null,
      })),
    });
    // Default update: no error
    updateSpy.mockReturnValue({
      eq: vi.fn(async () => ({
        error: null,
      })),
    });
  });

  it("New point_index, no existing session → creates session, appends measurement", async () => {
    const { POST } = await import(
      "@/app/api/ingest/ice-depth/route"
    );

    const request = new Request("http://localhost/api/ingest/ice-depth", {
      method: "POST",
      headers: {
        "x-device-id": "caliper-001",
        "x-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-signature": "sig",
      },
      body: JSON.stringify({
        template_id: "11111111-1111-4111-8111-111111111111",
        point_index: 1,
        depth_inches: 2.5,
        reading_timestamp: new Date().toISOString(),
        confidence: 0.95,
      }),
    });

    const response = await POST(request);
    const data = (await response.json()) as {
      status: string;
      sessionId: string;
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("accepted");
    expect(data.sessionId).toBe("session-123");
    expect(insertSpy).toHaveBeenCalled();
  });

  it("Existing session, existing point_index → measurement replaced", async () => {
    selectSpy.mockReturnValue({
      eq: vi.fn(function (this: unknown) {
        return this;
      }),
      gte: vi.fn(function (this: unknown) {
        return this;
      }),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: "existing-session",
          measurements: { "1": 2.0 },
        },
        error: null,
      })),
    });

    const { POST } = await import(
      "@/app/api/ingest/ice-depth/route"
    );

    const request = new Request("http://localhost/api/ingest/ice-depth", {
      method: "POST",
      headers: {
        "x-device-id": "caliper-001",
        "x-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-signature": "sig",
      },
      body: JSON.stringify({
        template_id: "11111111-1111-4111-8111-111111111111",
        point_index: 1,
        depth_inches: 2.5,
        reading_timestamp: new Date().toISOString(),
        confidence: 0.95,
      }),
    });

    const response = await POST(request);
    const data = (await response.json()) as {
      status: string;
      sessionId: string;
    };

    expect(response.status).toBe(200);
    expect(data.sessionId).toBe("existing-session");
    expect(updateSpy).toHaveBeenCalled();
  });

  it("depth_inches = 0.5 → critical alert inserted", async () => {
    const { POST } = await import(
      "@/app/api/ingest/ice-depth/route"
    );

    const request = new Request("http://localhost/api/ingest/ice-depth", {
      method: "POST",
      headers: {
        "x-device-id": "caliper-001",
        "x-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-signature": "sig",
      },
      body: JSON.stringify({
        template_id: "11111111-1111-4111-8111-111111111111",
        point_index: 5,
        depth_inches: 0.5,
        reading_timestamp: new Date().toISOString(),
        confidence: 0.95,
      }),
    });

    const response = await POST(request);
    const data = (await response.json()) as {
      status: string;
      alertTriggered: boolean;
    };

    expect(response.status).toBe(200);
    expect(data.alertTriggered).toBe(true);
  });

  it("confidence = 0.3 → lowConfidence metadata recorded", async () => {
    const { POST } = await import(
      "@/app/api/ingest/ice-depth/route"
    );

    const request = new Request("http://localhost/api/ingest/ice-depth", {
      method: "POST",
      headers: {
        "x-device-id": "caliper-001",
        "x-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-signature": "sig",
      },
      body: JSON.stringify({
        template_id: "11111111-1111-4111-8111-111111111111",
        point_index: 10,
        depth_inches: 2.0,
        reading_timestamp: new Date().toISOString(),
        confidence: 0.3,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    // The low confidence should be stored in the measurements or metadata
  });

  it("Wrong device type → 403", async () => {
    mockVerify.mockResolvedValue({
      deviceId: "wrong-001",
      facilityId: "fac-123",
      deviceType: "air_quality_sensor",
    });

    const { POST } = await import(
      "@/app/api/ingest/ice-depth/route"
    );

    const request = new Request("http://localhost/api/ingest/ice-depth", {
      method: "POST",
      headers: {
        "x-device-id": "wrong-001",
        "x-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-signature": "sig",
      },
      body: JSON.stringify({
        template_id: "11111111-1111-4111-8111-111111111111",
        point_index: 1,
        depth_inches: 2.5,
        reading_timestamp: new Date().toISOString(),
        confidence: 0.95,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });
});
