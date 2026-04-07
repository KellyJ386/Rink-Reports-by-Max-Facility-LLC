/**
 * Tests for the analytics tRPC router.
 *
 * Verifies:
 *   1. Each procedure filters by ctx.facilityId (Rule 1 — facility_id NEVER
 *      accepted from client input; ALWAYS from ctx).
 *   2. days: 7 sets the correct date boundary (~7 days ago).
 *   3. Empty array from Supabase → procedure returns [] (not null, not error).
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
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

// ── Chainable Supabase mock builder ────────────────────────────────────────

type ChainResult = { data: unknown[]; error: null };

function makeChain(result: ChainResult) {
  let _eqFacilityId: string | undefined;
  let _gteValue: string | undefined;

  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((col: string, val: string) => {
      if (col === "facility_id") _eqFacilityId = val;
      return chain;
    }),
    gte: vi.fn((_col: string, val: string) => {
      _gteValue = val;
      return chain;
    }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    // expose captured args for assertions
    _getEqFacilityId: () => _eqFacilityId,
    _getGteValue: () => _gteValue,
    then: (resolve: (v: ChainResult) => unknown) => resolve(result),
  };
  return chain;
}

// ── Imports (after mocks) ───────────────────────────────────────────────────

import { appRouter } from "@/server/trpc/routers";
import type { TRPCContext } from "@/server/trpc/context";

// ── Helpers ─────────────────────────────────────────────────────────────────

const TEST_FACILITY_ID = "fac-unit-test-1234";

function buildFakeSupabase(result: ChainResult = { data: [], error: null }) {
  const chain = makeChain(result);
  const fakeSupabase = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "u1" } } })) },
    from: vi.fn(() => chain),
    _chain: chain,
  };
  return fakeSupabase;
}

function buildCtx(fakeSupabase: ReturnType<typeof buildFakeSupabase>): TRPCContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: fakeSupabase as any,
    user: { id: "user-1" } as TRPCContext["user"],
    facilityId: TEST_FACILITY_ID,
    role: "staff",
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("analytics router", () => {
  // --------------------------------------------------------------------------
  // airQualityTrend
  // --------------------------------------------------------------------------
  describe("airQualityTrend", () => {
    it("filters by ctx.facilityId — never from client input", async () => {
      const fake = buildFakeSupabase();
      const caller = appRouter.createCaller(buildCtx(fake));
      await caller.analytics.airQualityTrend({ days: 30 });

      expect(fake.from).toHaveBeenCalledWith("air_quality_readings");
      expect(fake._chain.eq).toHaveBeenCalledWith("facility_id", TEST_FACILITY_ID);
    });

    it("sets date boundary ~7 days ago when days=7", async () => {
      const fake = buildFakeSupabase();
      const caller = appRouter.createCaller(buildCtx(fake));
      const before = new Date();
      before.setDate(before.getDate() - 8); // 8 days ago

      await caller.analytics.airQualityTrend({ days: 7 });

      const gteValue = fake._chain._getGteValue();
      expect(gteValue).toBeDefined();
      const gteDate = new Date(gteValue!);
      // gteDate should be roughly 7 days ago — within a 2-day window of tolerance
      const daysDiff = (Date.now() - gteDate.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeGreaterThanOrEqual(6);
      expect(daysDiff).toBeLessThanOrEqual(8);
    });

    it("returns empty array when supabase returns no rows", async () => {
      const fake = buildFakeSupabase({ data: [], error: null });
      const caller = appRouter.createCaller(buildCtx(fake));
      const result = await caller.analytics.airQualityTrend({ days: 7 });
      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // refrigerationBrineDeltaTrend
  // --------------------------------------------------------------------------
  describe("refrigerationBrineDeltaTrend", () => {
    it("filters by ctx.facilityId", async () => {
      const fake = buildFakeSupabase();
      const caller = appRouter.createCaller(buildCtx(fake));
      await caller.analytics.refrigerationBrineDeltaTrend({ days: 30 });

      expect(fake.from).toHaveBeenCalledWith("refrigeration_readings");
      expect(fake._chain.eq).toHaveBeenCalledWith("facility_id", TEST_FACILITY_ID);
    });

    it("returns empty array when supabase returns no rows", async () => {
      const fake = buildFakeSupabase({ data: [], error: null });
      const caller = appRouter.createCaller(buildCtx(fake));
      const result = await caller.analytics.refrigerationBrineDeltaTrend({ days: 7 });
      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // iceDepthHeatmapDelta
  // --------------------------------------------------------------------------
  describe("iceDepthHeatmapDelta", () => {
    it("filters by ctx.facilityId", async () => {
      const fake = buildFakeSupabase();
      const caller = appRouter.createCaller(buildCtx(fake));
      await caller.analytics.iceDepthHeatmapDelta({
        days: 30,
        templateId: "tmpl-abc",
      });

      expect(fake.from).toHaveBeenCalledWith("ice_depth_sessions");
      // eq("facility_id", ...) should have been called at least once
      const eqCalls = (fake._chain.eq as Mock).mock.calls;
      const facilityEqCall = eqCalls.find((c) => c[0] === "facility_id");
      expect(facilityEqCall?.[1]).toBe(TEST_FACILITY_ID);
    });

    it("returns empty array when supabase returns no rows", async () => {
      const fake = buildFakeSupabase({ data: [], error: null });
      const caller = appRouter.createCaller(buildCtx(fake));
      const result = await caller.analytics.iceDepthHeatmapDelta({
        days: 7,
        templateId: "tmpl-abc",
      });
      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // incidentsFrequencyByLocation
  // --------------------------------------------------------------------------
  describe("incidentsFrequencyByLocation", () => {
    it("filters by ctx.facilityId", async () => {
      const fake = buildFakeSupabase();
      const caller = appRouter.createCaller(buildCtx(fake));
      await caller.analytics.incidentsFrequencyByLocation({ days: 30 });

      expect(fake.from).toHaveBeenCalledWith("incidents");
      expect(fake._chain.eq).toHaveBeenCalledWith("facility_id", TEST_FACILITY_ID);
    });

    it("returns empty array when supabase returns no rows", async () => {
      const fake = buildFakeSupabase({ data: [], error: null });
      const caller = appRouter.createCaller(buildCtx(fake));
      const result = await caller.analytics.incidentsFrequencyByLocation({ days: 7 });
      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // dailyReportCompletionRate
  // --------------------------------------------------------------------------
  describe("dailyReportCompletionRate", () => {
    it("filters by ctx.facilityId", async () => {
      const fake = buildFakeSupabase();
      const caller = appRouter.createCaller(buildCtx(fake));
      await caller.analytics.dailyReportCompletionRate({ days: 30 });

      // This procedure calls from("daily_reports") and from("daily_report_checklists")
      const fromCalls = (fake.from as Mock).mock.calls.map((c) => c[0]);
      expect(fromCalls).toContain("daily_reports");
      expect(fake._chain.eq).toHaveBeenCalledWith("facility_id", TEST_FACILITY_ID);
    });

    it("returns empty array when supabase returns no rows", async () => {
      const fake = buildFakeSupabase({ data: [], error: null });
      const caller = appRouter.createCaller(buildCtx(fake));
      const result = await caller.analytics.dailyReportCompletionRate({ days: 7 });
      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Auth guard: procedures require authenticated user with facilityId
  // --------------------------------------------------------------------------
  describe("auth guard", () => {
    it("throws UNAUTHORIZED when user is null", async () => {
      const fake = buildFakeSupabase();
      const unauthedCtx: TRPCContext = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: fake as any,
        user: null,
        facilityId: null,
        role: null,
      };
      const caller = appRouter.createCaller(unauthedCtx);
      await expect(
        caller.analytics.airQualityTrend({ days: 7 }),
      ).rejects.toBeInstanceOf(TRPCError);
    });
  });
});
