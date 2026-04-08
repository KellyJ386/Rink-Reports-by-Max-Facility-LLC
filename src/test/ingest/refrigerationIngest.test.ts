import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for POST /api/ingest/refrigeration
 *
 * Mocks:
 *   - @supabase/supabase-js createClient
 *   - @/server/ingest/auth → verifyDeviceRequest
 *   - @/server/ingest/rateLimit → checkIngestRateLimit
 *   - @/server/ingest/log → writeIngestLog, findRecentIngestLog
 *   - @sentry/nextjs
 *
 * Key assertion: facility_id in the insert comes from the
 * verifyDeviceRequest result (device.facilityId), NOT from the
 * request body (CLAUDE.md Rule 1).
 */

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

// vi.mock factories are hoisted — must not reference variables declared
// outside the factory. Use vi.hoisted() to share state.
const {
  mockVerify,
  mockRateLimit,
  mockWriteLog,
  mockFindLog,
  insertSpy,
} = vi.hoisted(() => ({
  mockVerify: vi.fn(),
  mockRateLimit: vi.fn(),
  mockWriteLog: vi.fn(),
  mockFindLog: vi.fn(),
  insertSpy: vi.fn(),
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
    from: (table: string) => {
      if (table === "user_profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { user_id: "admin-user-uuid" },
            error: null,
          }),
        };
      }
      if (table === "refrigeration_readings") {
        return {
          insert: vi.fn((data: unknown) => {
            insertSpy(data);
            return {
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { id: "server-reading-uuid" },
                error: null,
              }),
            };
          }),
        };
      }
      return {};
    },
  })),
}));

// Import AFTER all mocks are declared
import { POST } from "@/app/api/ingest/refrigeration/route";

// ------------------------------------------------------------------ //
// Test fixtures
// ------------------------------------------------------------------ //

const VERIFIED_DEVICE = {
  deviceId: "device-abc",
  facilityId: "facility-uuid-from-db",
  deviceType: "refrigeration_controller" as const,
};

const VALID_PAYLOAD = {
  compressor_index: 0,
  suction_pressure: 75.5,
  discharge_pressure: 200.1,
  oil_pressure: 60.0,
  amps: 30.2,
  oil_temp: 120.5,
  brine_supply: 24.0,
  brine_return: 26.0,
  brine_flow: 180.0,
  ice_surface_temp: 28.5,
  reading_timestamp: new Date().toISOString(),
};

function buildRequest(body: unknown = VALID_PAYLOAD): Request {
  return new Request("http://localhost/api/ingest/refrigeration", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-device-id": "device-abc",
      "x-timestamp": String(Math.floor(Date.now() / 1000)),
      "x-signature": "dummy-signature",
    },
  });
}

// ------------------------------------------------------------------ //
// Tests
// ------------------------------------------------------------------ //

beforeEach(() => {
  vi.clearAllMocks();
  // Default happy-path state
  mockVerify.mockResolvedValue(VERIFIED_DEVICE);
  mockRateLimit.mockReturnValue(true);
  mockFindLog.mockResolvedValue(false);
  mockWriteLog.mockResolvedValue(undefined);
});

describe("POST /api/ingest/refrigeration", () => {
  it("returns 200 accepted with serverId for a valid request", async () => {
    const req = buildRequest();
    const res = await POST(req);
    const body = (await res.json()) as { status: string; serverId: string };

    expect(res.status).toBe(200);
    expect(body.status).toBe("accepted");
    expect(body.serverId).toBe("server-reading-uuid");
  });

  it("returns 401 when verifyDeviceRequest returns null", async () => {
    mockVerify.mockResolvedValue(null);

    const req = buildRequest();
    const res = await POST(req);
    const body = (await res.json()) as { status: string };

    expect(res.status).toBe(401);
    expect(body.status).toBe("unauthorized");
  });

  it("returns 429 when rate limit is exceeded", async () => {
    mockRateLimit.mockReturnValue(false);

    const req = buildRequest();
    const res = await POST(req);
    const body = (await res.json()) as { status: string };

    expect(res.status).toBe(429);
    expect(body.status).toBe("rate_limited");
  });

  it("returns 200 duplicate when payload hash was seen recently", async () => {
    mockFindLog.mockResolvedValue(true);

    const req = buildRequest();
    const res = await POST(req);
    const body = (await res.json()) as { status: string };

    expect(res.status).toBe(200);
    expect(body.status).toBe("duplicate");
  });

  it("returns 403 when device type is not refrigeration_controller", async () => {
    mockVerify.mockResolvedValue({
      ...VERIFIED_DEVICE,
      deviceType: "air_quality_sensor",
    });

    const req = buildRequest();
    const res = await POST(req);
    const body = (await res.json()) as { status: string };

    expect(res.status).toBe(403);
    expect(body.status).toBe("wrong_device_type");
  });

  it("returns 400 for a payload with a missing required field", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const badPayload: any = { ...VALID_PAYLOAD };
    delete badPayload.compressor_index;

    const req = buildRequest(badPayload);
    const res = await POST(req);
    const body = (await res.json()) as { status: string };

    expect(res.status).toBe(400);
    expect(body.status).toBe("invalid_payload");

    // Verify the rejection is logged
    expect(mockWriteLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "rejected" }),
    );
  });

  it("uses facility_id from verifyDeviceRequest, not from the request body", async () => {
    // Send a valid payload (any unknown fields would cause 400 via .strict())
    // Verify that the insert uses device.facilityId (from DB auth), not any
    // value that could have come from the request payload.
    const req = buildRequest(VALID_PAYLOAD);
    await POST(req);

    const insertArg = insertSpy.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(insertArg).toBeDefined();

    // facility_id in the insert must equal the value from verifyDeviceRequest
    expect(insertArg?.facility_id).toBe(VERIFIED_DEVICE.facilityId);
    // Explicitly confirm it equals the DB value, not any request-supplied value
    expect(insertArg?.facility_id).toBe("facility-uuid-from-db");
  });
});
