import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for /api/cron/anomaly-scan route handler.
 *
 * Tests:
 *   1. Missing or wrong CRON_SECRET → 401
 *   2. Valid secret → detectors invoked per facility; returns summary
 */

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

// Track calls to the detection + persistence pipeline
const runAllDetectorsSpy = vi.fn(async (_facilityId: unknown, _supabase: unknown) => []);
const persistAlertsSpy = vi.fn(async (_results: unknown, _supabase: unknown) => ({
  inserted: 2,
  skipped: 0,
  errors: 0,
}));

vi.mock("@/server/anomaly/index", () => ({
  runAllDetectors: (facilityId: unknown, supabase: unknown) =>
    runAllDetectorsSpy(facilityId, supabase),
}));

vi.mock("@/server/anomaly/persist", () => ({
  persistAlerts: (results: unknown, supabase: unknown) =>
    persistAlertsSpy(results, supabase),
}));

// Mock service role client
const mockFacilities = [{ id: "facility-1" }, { id: "facility-2" }];

const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (v: unknown) => void) =>
      resolve({ data: mockFacilities, error: null }),
    ),
  })),
};

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServiceRoleClient: vi.fn(() => mockSupabase),
}));

import { GET } from "@/app/api/cron/anomaly-scan/route";

function makeRequest(authHeader: string | null): Request {
  const headers = new Headers();
  if (authHeader !== null) {
    headers.set("Authorization", authHeader);
  }
  return new Request("http://localhost/api/cron/anomaly-scan", {
    method: "GET",
    headers,
  });
}

beforeEach(() => {
  runAllDetectorsSpy.mockClear();
  persistAlertsSpy.mockClear();
  vi.clearAllMocks();
  // Reset env
  process.env.CRON_SECRET = "test-secret-xyz";
});

describe("GET /api/cron/anomaly-scan", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const req = makeRequest(null);
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Unauthorized" });
  });

  it("returns 401 when Authorization header has wrong secret", async () => {
    const req = makeRequest("Bearer wrong-secret");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when CRON_SECRET env var is not set", async () => {
    delete process.env.CRON_SECRET;
    const req = makeRequest("Bearer test-secret-xyz");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with summary when secret is valid", async () => {
    // Reset the from mock since vi.clearAllMocks() cleared it
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: (v: unknown) => void) =>
        resolve({ data: mockFacilities, error: null }),
      ),
    });
    runAllDetectorsSpy.mockResolvedValue([]);
    persistAlertsSpy.mockResolvedValue({ inserted: 2, skipped: 0, errors: 0 });

    const req = makeRequest("Bearer test-secret-xyz");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.scanned).toBe(2);
  });

  it("invokes runAllDetectors once per facility", async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: (v: unknown) => void) =>
        resolve({ data: mockFacilities, error: null }),
      ),
    });
    runAllDetectorsSpy.mockResolvedValue([]);
    persistAlertsSpy.mockResolvedValue({ inserted: 0, skipped: 0, errors: 0 });

    const req = makeRequest("Bearer test-secret-xyz");
    await GET(req);

    expect(runAllDetectorsSpy).toHaveBeenCalledTimes(2);
    expect(runAllDetectorsSpy).toHaveBeenCalledWith("facility-1", mockSupabase);
    expect(runAllDetectorsSpy).toHaveBeenCalledWith("facility-2", mockSupabase);
  });
});
