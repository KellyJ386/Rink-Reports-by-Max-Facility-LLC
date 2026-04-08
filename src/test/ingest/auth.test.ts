import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

/**
 * Tests for src/server/ingest/auth.ts
 *
 * We mock the Supabase client to control device_credentials lookups
 * and verify the full HMAC verification pipeline.
 */

// --- Helpers --------------------------------------------------------

function makeHmacSignature(
  deviceId: string,
  timestamp: string,
  rawBody: string,
  hashedSecret: string,
  signingSecret = "test-signing-secret",
): string {
  const bodyHash = crypto
    .createHash("sha256")
    .update(rawBody)
    .digest("hex");
  const message = `${deviceId}.${timestamp}.${bodyHash}`;
  const key = signingSecret + hashedSecret;
  return crypto.createHmac("sha256", key).update(message).digest("hex");
}

function makeHashedSecret(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

function freshTimestamp(): string {
  return String(Math.floor(Date.now() / 1000));
}

function staleTimestamp(): string {
  return String(Math.floor(Date.now() / 1000) - 400); // > 300s ago
}

// --- Mock Supabase client -------------------------------------------

type AnyObj = Record<string, unknown>;

const mockDeviceRow: AnyObj = {
  device_id: "device-abc",
  facility_id: "facility-uuid-123",
  device_type: "refrigeration_controller",
  hashed_secret: makeHashedSecret("super-secret"),
  is_active: true,
};

let mockQueryResult: { data: AnyObj | null } = { data: mockDeviceRow };

const updateChain = {
  eq: vi.fn().mockReturnThis(),
};

const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn(() => updateChain),
    maybeSingle: vi.fn(async () => mockQueryResult),
  })),
};

// --- Env setup -----------------------------------------------------

beforeEach(() => {
  process.env.INGEST_SIGNING_SECRET = "test-signing-secret";
  mockQueryResult = { data: { ...mockDeviceRow } };
  vi.clearAllMocks();
});

// --- Import under test (after mocks) --------------------------------
import { verifyDeviceRequest } from "@/server/ingest/auth";

// --- Tests ----------------------------------------------------------

describe("verifyDeviceRequest", () => {
  const DEVICE_ID = "device-abc";
  const RAW_BODY = JSON.stringify({ foo: 1 });

  function buildRequest(
    deviceId: string,
    timestamp: string,
    signature: string,
    body: string = RAW_BODY,
  ): Request {
    return new Request("http://localhost/api/ingest/refrigeration", {
      method: "POST",
      body,
      headers: {
        "x-device-id": deviceId,
        "x-timestamp": timestamp,
        "x-signature": signature,
        "content-type": "application/json",
      },
    });
  }

  it("returns VerifiedDevice for a valid HMAC with a fresh timestamp", async () => {
    const ts = freshTimestamp();
    const hashedSecret = makeHashedSecret("super-secret");
    const sig = makeHmacSignature(DEVICE_ID, ts, RAW_BODY, hashedSecret);

    const req = buildRequest(DEVICE_ID, ts, sig);
    const result = await verifyDeviceRequest(
      req,
      RAW_BODY,
      mockSupabase as unknown as Parameters<typeof verifyDeviceRequest>[2],
    );

    expect(result).not.toBeNull();
    expect(result?.deviceId).toBe("device-abc");
    expect(result?.facilityId).toBe("facility-uuid-123");
    expect(result?.deviceType).toBe("refrigeration_controller");
  });

  it("returns null when X-Timestamp is more than 300 seconds old", async () => {
    const ts = staleTimestamp();
    const hashedSecret = makeHashedSecret("super-secret");
    const sig = makeHmacSignature(DEVICE_ID, ts, RAW_BODY, hashedSecret);

    const req = buildRequest(DEVICE_ID, ts, sig);
    const result = await verifyDeviceRequest(
      req,
      RAW_BODY,
      mockSupabase as unknown as Parameters<typeof verifyDeviceRequest>[2],
    );

    expect(result).toBeNull();
  });

  it("returns null for a wrong signature (correct format, wrong value)", async () => {
    const ts = freshTimestamp();
    // Use a different secret to produce a wrong signature
    const wrongSig = makeHmacSignature(
      DEVICE_ID,
      ts,
      RAW_BODY,
      makeHashedSecret("wrong-secret"),
    );

    const req = buildRequest(DEVICE_ID, ts, wrongSig);
    const result = await verifyDeviceRequest(
      req,
      RAW_BODY,
      mockSupabase as unknown as Parameters<typeof verifyDeviceRequest>[2],
    );

    expect(result).toBeNull();
  });

  it("returns null for an inactive device (is_active = false)", async () => {
    mockQueryResult = {
      data: { ...mockDeviceRow, is_active: false },
    };

    const ts = freshTimestamp();
    const hashedSecret = makeHashedSecret("super-secret");
    const sig = makeHmacSignature(DEVICE_ID, ts, RAW_BODY, hashedSecret);

    const req = buildRequest(DEVICE_ID, ts, sig);
    const result = await verifyDeviceRequest(
      req,
      RAW_BODY,
      mockSupabase as unknown as Parameters<typeof verifyDeviceRequest>[2],
    );

    expect(result).toBeNull();
  });

  it("returns null when the device does not exist in the DB", async () => {
    mockQueryResult = { data: null };

    const ts = freshTimestamp();
    const sig = makeHmacSignature(
      "unknown-device",
      ts,
      RAW_BODY,
      makeHashedSecret("any-secret"),
    );

    const req = buildRequest("unknown-device", ts, sig);
    const result = await verifyDeviceRequest(
      req,
      RAW_BODY,
      mockSupabase as unknown as Parameters<typeof verifyDeviceRequest>[2],
    );

    expect(result).toBeNull();
  });

  it("returns null when required headers are missing", async () => {
    const req = new Request(
      "http://localhost/api/ingest/refrigeration",
      { method: "POST", body: RAW_BODY },
    );
    const result = await verifyDeviceRequest(
      req,
      RAW_BODY,
      mockSupabase as unknown as Parameters<typeof verifyDeviceRequest>[2],
    );

    expect(result).toBeNull();
  });
});
