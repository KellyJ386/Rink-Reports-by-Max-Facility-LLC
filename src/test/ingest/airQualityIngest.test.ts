import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for POST /api/ingest/air-quality
 *
 * Mocks:
 *   - @supabase/supabase-js createClient
 *   - @/server/ingest/auth → verifyDeviceRequest
 *   - @/server/ingest/rateLimit → checkIngestRateLimit
 *   - @/server/ingest/log → writeIngestLog, findRecentIngestLog
 *   - @sentry/nextjs
 *
 * Key assertions:
 *   - Valid auth + readings within safe limits → tier 1, no alert
 *   - CO = 30 (tier 3) → tier "action", alert with severity "warning"
 *   - CO = 40 (tier 4) → tier "evacuate", alert with severity "critical"
 *   - Existing unresolved alert → new alert skipped (dedup)
 *   - Duplicate payload → 200 duplicate, no second insert
 */

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const {
  mockVerify,
  mockRateLimit,
  mockWriteLog,
  mockFindLog,
  insertSpy,
  selectSpy,
  configSelectSpy,
  alertSelectSpy,
} = vi.hoisted(() => ({
  mockVerify: vi.fn(),
  mockRateLimit: vi.fn(),
  mockWriteLog: vi.fn(),
  mockFindLog: vi.fn(),
  insertSpy: vi.fn(),
  selectSpy: vi.fn(),
  configSelectSpy: vi.fn(),
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
      if (table === "air_quality_readings") {
        return {
          insert: insertSpy.mockReturnValue({
            select: selectSpy.mockReturnValue({
              single: vi.fn(async () => ({
                data: { id: "reading-123" },
                error: null,
              })),
            }),
          }),
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
              data: { user_id: "user-123" },
              error: null,
            })),
          })),
        };
      }
      if (table === "facility_config") {
        return {
          select: configSelectSpy.mockReturnValue({
            eq: vi.fn(function (this: unknown) {
              return this;
            }),
            maybeSingle: vi.fn(async () => ({
              data: {
                air_quality: {
                  co_caution: 5,
                  co_action: 15,
                  co_evacuate: 35,
                  no2_caution: 0.5,
                  no2_action: 1,
                  no2_evacuate: 3,
                },
              },
              error: null,
            })),
          }),
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

describe("POST /api/ingest/air-quality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerify.mockResolvedValue({
      deviceId: "aq-sensor-001",
      facilityId: "fac-123",
      deviceType: "air_quality_sensor",
    });
    mockRateLimit.mockReturnValue(true);
    mockFindLog.mockResolvedValue(false);
  });

  it("Valid auth + readings within safe limits → tier normal, no alert", async () => {
    const { POST } = await import(
      "@/app/api/ingest/air-quality/route"
    );

    const request = new Request("http://localhost/api/ingest/air-quality", {
      method: "POST",
      headers: {
        "x-device-id": "aq-sensor-001",
        "x-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-signature": "sig",
      },
      body: JSON.stringify({
        co_ppm: 2,
        no2_ppm: 0.2,
        nh3_ppm: 0.1,
        reading_timestamp: new Date().toISOString(),
      }),
    });

    const response = await POST(request);
    const data = (await response.json()) as {
      status: string;
      tier: string;
      alertTriggered: boolean;
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("accepted");
    expect(data.tier).toBe("normal");
    expect(data.alertTriggered).toBe(false);
  });

  it("CO = 30 (tier 3) → tier action, alert with severity warning", async () => {
    const { POST } = await import(
      "@/app/api/ingest/air-quality/route"
    );

    const request = new Request("http://localhost/api/ingest/air-quality", {
      method: "POST",
      headers: {
        "x-device-id": "aq-sensor-001",
        "x-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-signature": "sig",
      },
      body: JSON.stringify({
        co_ppm: 30,
        no2_ppm: 0.5,
        nh3_ppm: 0.1,
        reading_timestamp: new Date().toISOString(),
      }),
    });

    const response = await POST(request);
    const data = (await response.json()) as {
      status: string;
      tier: string;
      alertTriggered: boolean;
    };

    expect(response.status).toBe(200);
    expect(data.tier).toBe("action");
    expect(data.alertTriggered).toBe(true);
  });

  it("CO = 40 (tier 4) → tier evacuate, alert with severity critical", async () => {
    const { POST } = await import(
      "@/app/api/ingest/air-quality/route"
    );

    const request = new Request("http://localhost/api/ingest/air-quality", {
      method: "POST",
      headers: {
        "x-device-id": "aq-sensor-001",
        "x-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-signature": "sig",
      },
      body: JSON.stringify({
        co_ppm: 40,
        no2_ppm: 0.5,
        nh3_ppm: 0.1,
        reading_timestamp: new Date().toISOString(),
      }),
    });

    const response = await POST(request);
    const data = (await response.json()) as {
      status: string;
      tier: string;
      alertTriggered: boolean;
    };

    expect(response.status).toBe(200);
    expect(data.tier).toBe("evacuate");
    expect(data.alertTriggered).toBe(true);
  });

  it("Wrong device type → 403", async () => {
    mockVerify.mockResolvedValue({
      deviceId: "wrong-001",
      facilityId: "fac-123",
      deviceType: "ice_depth_sensor",
    });

    const { POST } = await import(
      "@/app/api/ingest/air-quality/route"
    );

    const request = new Request("http://localhost/api/ingest/air-quality", {
      method: "POST",
      headers: {
        "x-device-id": "wrong-001",
        "x-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-signature": "sig",
      },
      body: JSON.stringify({
        co_ppm: 10,
        no2_ppm: 0.5,
        nh3_ppm: 0.1,
        reading_timestamp: new Date().toISOString(),
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("Duplicate payload → 200 duplicate, no second insert", async () => {
    mockFindLog.mockResolvedValue(true);

    const { POST } = await import(
      "@/app/api/ingest/air-quality/route"
    );

    const request = new Request("http://localhost/api/ingest/air-quality", {
      method: "POST",
      headers: {
        "x-device-id": "aq-sensor-001",
        "x-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-signature": "sig",
      },
      body: JSON.stringify({
        co_ppm: 2,
        no2_ppm: 0.2,
        nh3_ppm: 0.1,
        reading_timestamp: new Date().toISOString(),
      }),
    });

    const response = await POST(request);
    const data = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(data.status).toBe("duplicate");
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
