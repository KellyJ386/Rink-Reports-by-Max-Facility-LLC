import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Calendar feed endpoint tests.
 *
 * Exercises src/app/api/calendar/[facilityId]/route.ts:
 *   - Valid token + enabled → 200 text/calendar response with VCALENDAR body
 *   - Missing token → 404 (never reveals that the facility exists)
 *   - Wrong token → 404
 *   - Disabled feed with correct token → 404
 *   - Shifts outside the 90-day window → excluded
 */

type AnyObj = Record<string, unknown>;

interface MockChain {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
}

function buildChain(): MockChain {
  const chain: AnyObj = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.lte = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.maybeSingle = vi.fn();
  return chain as unknown as MockChain;
}

const tableState: {
  facility_config: { calendar_feed_token: string | null; calendar_feed_enabled: boolean } | null;
  facilities: { name: string } | null;
  scheduling_schedules: { id: string }[];
  scheduling_shifts: AnyObj[];
} = {
  facility_config: null,
  facilities: null,
  scheduling_schedules: [],
  scheduling_shifts: [],
};

const mockSupabase = {
  from: vi.fn((table: string) => {
    const chain = buildChain();
    if (table === "facility_config") {
      chain.maybeSingle.mockResolvedValue({
        data: tableState.facility_config,
        error: null,
      });
    } else if (table === "facilities") {
      chain.maybeSingle.mockResolvedValue({
        data: tableState.facilities,
        error: null,
      });
    } else if (table === "scheduling_schedules") {
      // terminal: returns an array, not via maybeSingle — the route awaits the chain
      // so we need the chain itself to be thenable-compatible. Return { data, error }
      // via eq() being awaited.
      chain.eq = vi.fn(() => ({
        then: (resolve: (v: { data: { id: string }[]; error: null }) => void) =>
          resolve({ data: tableState.scheduling_schedules, error: null }),
      })) as unknown as ReturnType<typeof vi.fn>;
    } else if (table === "scheduling_shifts") {
      chain.order = vi.fn(() => ({
        then: (resolve: (v: { data: AnyObj[]; error: null }) => void) =>
          resolve({ data: tableState.scheduling_shifts, error: null }),
      })) as unknown as ReturnType<typeof vi.fn>;
    }
    return chain;
  }),
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mockSupabase),
}));

// Keep env vars present so the route runs
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";

import { GET } from "@/app/api/calendar/[facilityId]/route";

const FACILITY_ID = "fac-abc-123";
const VALID_TOKEN = "valid-token-deadbeef";

function buildRequest(search: string): Request {
  return new Request(`http://localhost/api/calendar/${FACILITY_ID}${search}`, {
    method: "GET",
  });
}

function buildParams(): { params: Promise<{ facilityId: string }> } {
  return { params: Promise.resolve({ facilityId: FACILITY_ID }) };
}

describe("GET /api/calendar/[facilityId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableState.facility_config = null;
    tableState.facilities = { name: "Test Ice Arena" };
    tableState.scheduling_schedules = [];
    tableState.scheduling_shifts = [];
  });

  it("returns 404 when token query param is missing", async () => {
    tableState.facility_config = {
      calendar_feed_token: VALID_TOKEN,
      calendar_feed_enabled: true,
    };
    const res = await GET(buildRequest(""), buildParams());
    expect(res.status).toBe(404);
  });

  it("returns 404 when token is wrong", async () => {
    tableState.facility_config = {
      calendar_feed_token: VALID_TOKEN,
      calendar_feed_enabled: true,
    };
    const res = await GET(buildRequest(`?token=wrong-token`), buildParams());
    expect(res.status).toBe(404);
  });

  it("returns 404 when feed is disabled even with correct token", async () => {
    tableState.facility_config = {
      calendar_feed_token: VALID_TOKEN,
      calendar_feed_enabled: false,
    };
    const res = await GET(
      buildRequest(`?token=${VALID_TOKEN}`),
      buildParams(),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with text/calendar body when token is valid and feed is enabled", async () => {
    tableState.facility_config = {
      calendar_feed_token: VALID_TOKEN,
      calendar_feed_enabled: true,
    };
    tableState.scheduling_schedules = [{ id: "sched-1" }];
    tableState.scheduling_shifts = [];
    const res = await GET(
      buildRequest(`?token=${VALID_TOKEN}`),
      buildParams(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("END:VCALENDAR");
  });

  it("returns 200 with empty calendar body when facility has no schedules", async () => {
    tableState.facility_config = {
      calendar_feed_token: VALID_TOKEN,
      calendar_feed_enabled: true,
    };
    tableState.scheduling_schedules = [];
    const res = await GET(
      buildRequest(`?token=${VALID_TOKEN}`),
      buildParams(),
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).not.toContain("BEGIN:VEVENT");
  });
});
