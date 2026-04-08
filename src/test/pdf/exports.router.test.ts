/**
 * Tests for the exports tRPC router (src/server/trpc/routers/exports.ts).
 *
 * Verifies:
 *   1. Each procedure passes ctx.facilityId into supabase .eq("facility_id", ...)
 *   2. Unauthenticated context → UNAUTHORIZED
 *   3. Authenticated but no facility → FORBIDDEN
 *   4. Empty data from supabase → generator is still called → returns { base64, filename }
 *
 * The PDF generators are spied on so the tests don't actually render
 * binary PDF output in CI.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({})),
  createSupabaseServiceRoleClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/hubspot", () => ({ createOrUpdateContact: vi.fn() }));
vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(),
  PLANS: {},
  isActiveStatus: vi.fn(() => false),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
}));

// Spy on generators so we don't actually build PDFs in unit tests
vi.mock("@/server/pdf/generators/dailyReport", () => ({
  generateDailyReportPdf: vi.fn(async () => "FAKEB64_DAILY"),
}));
vi.mock("@/server/pdf/generators/iceOperations", () => ({
  generateIceOperationsPdf: vi.fn(async () => "FAKEB64_ICE"),
}));
vi.mock("@/server/pdf/generators/refrigeration", () => ({
  generateRefrigerationPdf: vi.fn(async () => "FAKEB64_REFRIG"),
}));
vi.mock("@/server/pdf/generators/airQuality", () => ({
  generateAirQualityPdf: vi.fn(async () => "FAKEB64_AQ"),
}));
vi.mock("@/server/pdf/generators/incidents", () => ({
  generateIncidentsPdf: vi.fn(async () => "FAKEB64_INC"),
}));

// ── Chainable Supabase mock builder ────────────────────────────────────────

/**
 * Each `from(tableName)` call returns its own chain tracking the `eq`
 * calls on `facility_id` so we can assert the correct facility is passed.
 */
function makeChain(data: unknown[] = []) {
  const eqCalls: Array<[string, unknown]> = [];
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return chain;
    }),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data, error: null }),
    _eqCalls: () => eqCalls,
  };
  return chain;
}

function buildFakeSupabase(tableData: Record<string, unknown[]> = {}) {
  const chains: Map<string, ReturnType<typeof makeChain>> = new Map();

  const fakeSupabase = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "u-test" } } })) },
    from: vi.fn((tableName: string) => {
      const data = tableData[tableName] ?? [];
      const chain = makeChain(data);
      chains.set(tableName, chain);
      return chain;
    }),
    _chainFor: (tableName: string) => chains.get(tableName),
  };
  return fakeSupabase;
}

// ── Imports (after mocks) ───────────────────────────────────────────────────

import { appRouter } from "@/server/trpc/routers";
import type { TRPCContext } from "@/server/trpc/context";

// ── Helpers ─────────────────────────────────────────────────────────────────

const TEST_FACILITY_ID = "fac-pdf-test-1234";

function authedCtx(fakeSupabase: ReturnType<typeof buildFakeSupabase>): TRPCContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: fakeSupabase as any,
    user: { id: "u-test" } as TRPCContext["user"],
    facilityId: TEST_FACILITY_ID,
    role: "staff",
  };
}

const unauthedCtx: TRPCContext = {
  supabase: {} as TRPCContext["supabase"],
  user: null,
  facilityId: null,
  role: null,
};

const noFacilityCtx: TRPCContext = {
  supabase: {} as TRPCContext["supabase"],
  user: { id: "u-test" } as TRPCContext["user"],
  facilityId: null,
  role: null,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("exports router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Auth guards
  // --------------------------------------------------------------------------
  describe("auth guards — all procedures", () => {
    it("dailyReportPdf: UNAUTHORIZED when not signed in", async () => {
      const caller = appRouter.createCaller(unauthedCtx);
      await expect(
        caller.exports.dailyReportPdf({ reportDate: "2026-04-08" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("iceOperationsPdf: UNAUTHORIZED when not signed in", async () => {
      const caller = appRouter.createCaller(unauthedCtx);
      await expect(
        caller.exports.iceOperationsPdf({ startDate: "2026-04-01", endDate: "2026-04-08" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("refrigerationPdf: UNAUTHORIZED when not signed in", async () => {
      const caller = appRouter.createCaller(unauthedCtx);
      await expect(
        caller.exports.refrigerationPdf({ startDate: "2026-04-01", endDate: "2026-04-08" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("airQualityPdf: UNAUTHORIZED when not signed in", async () => {
      const caller = appRouter.createCaller(unauthedCtx);
      await expect(
        caller.exports.airQualityPdf({ startDate: "2026-04-01", endDate: "2026-04-08" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("incidentsPdf: UNAUTHORIZED when not signed in", async () => {
      const caller = appRouter.createCaller(unauthedCtx);
      await expect(
        caller.exports.incidentsPdf({ startDate: "2026-04-01", endDate: "2026-04-08" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("dailyReportPdf: FORBIDDEN when user has no facility", async () => {
      const caller = appRouter.createCaller(noFacilityCtx);
      await expect(
        caller.exports.dailyReportPdf({ reportDate: "2026-04-08" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("iceOperationsPdf: FORBIDDEN when user has no facility", async () => {
      const caller = appRouter.createCaller(noFacilityCtx);
      await expect(
        caller.exports.iceOperationsPdf({ startDate: "2026-04-01", endDate: "2026-04-08" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // --------------------------------------------------------------------------
  // dailyReportPdf
  // --------------------------------------------------------------------------
  describe("dailyReportPdf", () => {
    it("passes ctx.facilityId into the supabase eq chain", async () => {
      const fake = buildFakeSupabase({
        daily_reports: [],
        facilities: [],
      });
      const caller = appRouter.createCaller(authedCtx(fake));
      await caller.exports.dailyReportPdf({ reportDate: "2026-04-08" });

      // The facilities query uses maybeSingle — check eq was called with facility_id
      const facilityChain = fake._chainFor("facilities");
      expect(facilityChain).toBeDefined();
      expect(facilityChain!._eqCalls()).toContainEqual(["id", TEST_FACILITY_ID]);

      const drChain = fake._chainFor("daily_reports");
      expect(drChain).toBeDefined();
      expect(drChain!._eqCalls()).toContainEqual(["facility_id", TEST_FACILITY_ID]);
    });

    it("returns { base64, filename } when data is empty", async () => {
      const fake = buildFakeSupabase({});
      const caller = appRouter.createCaller(authedCtx(fake));
      const result = await caller.exports.dailyReportPdf({ reportDate: "2026-04-08" });
      expect(result).toMatchObject({
        base64: "FAKEB64_DAILY",
        filename: expect.stringContaining(TEST_FACILITY_ID),
      });
    });
  });

  // --------------------------------------------------------------------------
  // iceOperationsPdf
  // --------------------------------------------------------------------------
  describe("iceOperationsPdf", () => {
    it("passes ctx.facilityId into the supabase eq chain", async () => {
      const fake = buildFakeSupabase({});
      const caller = appRouter.createCaller(authedCtx(fake));
      await caller.exports.iceOperationsPdf({ startDate: "2026-04-01", endDate: "2026-04-08" });

      const opsChain = fake._chainFor("ice_operations");
      expect(opsChain).toBeDefined();
      expect(opsChain!._eqCalls()).toContainEqual(["facility_id", TEST_FACILITY_ID]);
    });

    it("returns { base64, filename } when data is empty", async () => {
      const fake = buildFakeSupabase({});
      const caller = appRouter.createCaller(authedCtx(fake));
      const result = await caller.exports.iceOperationsPdf({
        startDate: "2026-04-01",
        endDate: "2026-04-08",
      });
      expect(result).toMatchObject({
        base64: "FAKEB64_ICE",
        filename: expect.stringContaining(TEST_FACILITY_ID),
      });
    });
  });

  // --------------------------------------------------------------------------
  // refrigerationPdf
  // --------------------------------------------------------------------------
  describe("refrigerationPdf", () => {
    it("passes ctx.facilityId into the supabase eq chain", async () => {
      const fake = buildFakeSupabase({});
      const caller = appRouter.createCaller(authedCtx(fake));
      await caller.exports.refrigerationPdf({ startDate: "2026-04-01", endDate: "2026-04-08" });

      const readingsChain = fake._chainFor("refrigeration_readings");
      expect(readingsChain).toBeDefined();
      expect(readingsChain!._eqCalls()).toContainEqual(["facility_id", TEST_FACILITY_ID]);
    });

    it("returns { base64, filename } when data is empty", async () => {
      const fake = buildFakeSupabase({});
      const caller = appRouter.createCaller(authedCtx(fake));
      const result = await caller.exports.refrigerationPdf({
        startDate: "2026-04-01",
        endDate: "2026-04-08",
      });
      expect(result).toMatchObject({
        base64: "FAKEB64_REFRIG",
        filename: expect.stringContaining(TEST_FACILITY_ID),
      });
    });
  });

  // --------------------------------------------------------------------------
  // airQualityPdf
  // --------------------------------------------------------------------------
  describe("airQualityPdf", () => {
    it("passes ctx.facilityId into the supabase eq chain", async () => {
      const fake = buildFakeSupabase({});
      const caller = appRouter.createCaller(authedCtx(fake));
      await caller.exports.airQualityPdf({ startDate: "2026-04-01", endDate: "2026-04-08" });

      const aqChain = fake._chainFor("air_quality_readings");
      expect(aqChain).toBeDefined();
      expect(aqChain!._eqCalls()).toContainEqual(["facility_id", TEST_FACILITY_ID]);
    });

    it("returns { base64, filename } when data is empty", async () => {
      const fake = buildFakeSupabase({});
      const caller = appRouter.createCaller(authedCtx(fake));
      const result = await caller.exports.airQualityPdf({
        startDate: "2026-04-01",
        endDate: "2026-04-08",
      });
      expect(result).toMatchObject({
        base64: "FAKEB64_AQ",
        filename: expect.stringContaining(TEST_FACILITY_ID),
      });
    });
  });

  // --------------------------------------------------------------------------
  // incidentsPdf
  // --------------------------------------------------------------------------
  describe("incidentsPdf", () => {
    it("passes ctx.facilityId into the supabase eq chain", async () => {
      const fake = buildFakeSupabase({});
      const caller = appRouter.createCaller(authedCtx(fake));
      await caller.exports.incidentsPdf({ startDate: "2026-04-01", endDate: "2026-04-08" });

      const incChain = fake._chainFor("incidents");
      expect(incChain).toBeDefined();
      expect(incChain!._eqCalls()).toContainEqual(["facility_id", TEST_FACILITY_ID]);
    });

    it("returns { base64, filename } when data is empty", async () => {
      const fake = buildFakeSupabase({});
      const caller = appRouter.createCaller(authedCtx(fake));
      const result = await caller.exports.incidentsPdf({
        startDate: "2026-04-01",
        endDate: "2026-04-08",
      });
      expect(result).toMatchObject({
        base64: "FAKEB64_INC",
        filename: expect.stringContaining(TEST_FACILITY_ID),
      });
    });
  });
});
