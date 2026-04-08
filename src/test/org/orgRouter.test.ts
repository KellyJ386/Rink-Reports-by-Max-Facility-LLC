/**
 * Tests for the org tRPC router (Phase G multi-facility roll-up).
 *
 * Verifies:
 *   1. orgAdminProcedure passes when ctx has org_admin membership
 *   2. orgAdminProcedure throws FORBIDDEN when ctx has no memberships
 *   3. listFacilities only returns facilities scoped to the org
 *   4. getRollupMetrics aggregates per org only
 *   5. getFacilityAlerts includes facilityName on each alert row
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

type AnyRecord = Record<string, unknown>;

/** Type helpers for chain mock assertions */
type MockChain = AnyRecord & {
  _getEqArgs: () => Array<[string, string]>;
  _getInArgs: () => Array<[string, string[]]>;
};

/**
 * Creates a Supabase query chain mock.
 * Tracks `.eq()` calls and captures filter args for assertions.
 */
function makeChain(rows: AnyRecord[] = []) {
  let _eqArgs: Array<[string, string]> = [];
  let _inArgs: Array<[string, string[]]> = [];

  const chain: AnyRecord = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((col: string, val: string) => {
      _eqArgs.push([col, val]);
      return chain;
    }),
    in: vi.fn((col: string, vals: string[]) => {
      _inArgs.push([col, vals]);
      return chain;
    }),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({ data: rows[0] ?? null, error: null })),
    single: vi.fn(async () => ({ data: rows[0] ?? null, error: null })),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    // Expose captured args for assertions
    _getEqArgs: () => _eqArgs,
    _getInArgs: () => _inArgs,
    // Thenable — resolves with rows
    then: (resolve: (v: { data: AnyRecord[]; error: null }) => unknown) =>
      resolve({ data: rows, error: null }),
  };
  return chain;
}

// ── Imports (after mocks) ───────────────────────────────────────────────────

import { appRouter } from "@/server/trpc/routers";
import type { TRPCContext } from "@/server/trpc/context";

// ── Constants ────────────────────────────────────────────────────────────────

const ORG_A = "11111111-1111-4111-a111-111111111111";
const ORG_B = "22222222-2222-4222-a222-222222222222";
const FAC_1 = "33333333-3333-4333-a333-333333333333";
const FAC_2 = "44444444-4444-4444-a444-444444444444";

// ── Context builders ─────────────────────────────────────────────────────────

function buildOrgAdminCtx(
  orgId: string,
  fakeSupabase: AnyRecord,
): TRPCContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: fakeSupabase as any,
    user: { id: "user-org-admin" } as TRPCContext["user"],
    facilityId: FAC_1,
    role: "admin",
    organizationIds: [orgId],
    orgRoles: { [orgId]: "org_admin" },
  };
}

function buildNoMembershipCtx(fakeSupabase: AnyRecord): TRPCContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: fakeSupabase as any,
    user: { id: "user-no-org" } as TRPCContext["user"],
    facilityId: FAC_1,
    role: "staff",
    organizationIds: [],
    orgRoles: {},
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a fake supabase client that serves different row sets based on
 * which table is queried.
 */
function buildFakeSupabase(tableRows: Record<string, AnyRecord[]> = {}) {
  const chains: Record<string, ReturnType<typeof makeChain>> = {};

  const fakeSupabase = {
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    from: vi.fn((table: string) => {
      if (!chains[table]) {
        chains[table] = makeChain(tableRows[table] ?? []);
      }
      return chains[table];
    }),
    _chains: chains,
  };

  return fakeSupabase;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("org router", () => {
  // --------------------------------------------------------------------------
  // orgAdminProcedure guard
  // --------------------------------------------------------------------------
  describe("orgAdminProcedure guard", () => {
    it("passes when ctx has org_admin membership", async () => {
      const fake = buildFakeSupabase({
        facilities: [{ id: FAC_1, name: "Ice Arena A", organization_id: ORG_A }],
        alerts: [],
        daily_reports: [],
        user_profiles: [],
        facility_subscriptions: [],
      });
      const ctx = buildOrgAdminCtx(ORG_A, fake);
      const caller = appRouter.createCaller(ctx);

      // listFacilities uses orgAdminProcedure — should not throw
      const result = await caller.org.listFacilities();
      expect(Array.isArray(result)).toBe(true);
    });

    it("throws FORBIDDEN when ctx has no org_admin membership", async () => {
      const fake = buildFakeSupabase();
      const ctx = buildNoMembershipCtx(fake);
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.org.listFacilities(),
      ).rejects.toSatisfy((e: unknown) => {
        expect(e).toBeInstanceOf(TRPCError);
        expect((e as TRPCError).code).toBe("FORBIDDEN");
        return true;
      });
    });
  });

  // --------------------------------------------------------------------------
  // listFacilities
  // --------------------------------------------------------------------------
  describe("listFacilities", () => {
    it("queries facilities filtered by organization_id from ctx (not client input)", async () => {
      const fake = buildFakeSupabase({
        facilities: [
          { id: FAC_1, name: "Arena 1", organization_id: ORG_A },
          { id: FAC_2, name: "Arena 2", organization_id: ORG_A },
        ],
        alerts: [],
        daily_reports: [],
        user_profiles: [],
        facility_subscriptions: [],
      });

      const ctx = buildOrgAdminCtx(ORG_A, fake);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.org.listFacilities();

      // Verify the supabase .eq call on facilities used the org from ctx
      const facChain = fake._chains["facilities"] as MockChain | undefined;
      expect(facChain).toBeDefined();
      const eqArgs = facChain!._getEqArgs();
      const orgEq = eqArgs.find(([col]) => col === "organization_id");
      expect(orgEq).toBeDefined();
      expect(orgEq?.[1]).toBe(ORG_A);

      // Result includes both facilities
      expect(result).toHaveLength(2);
      expect(result.map((f) => f.facilityName)).toEqual(
        expect.arrayContaining(["Arena 1", "Arena 2"]),
      );
    });

    it("returns empty array when org has no facilities", async () => {
      const fake = buildFakeSupabase({ facilities: [] });
      const ctx = buildOrgAdminCtx(ORG_A, fake);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.org.listFacilities();
      expect(result).toEqual([]);
    });

    it("scopes to org-b when ctx is for org-b (RLS isolation)", async () => {
      const fake = buildFakeSupabase({
        facilities: [
          { id: "fac-b1", name: "B-Arena", organization_id: ORG_B },
        ],
        alerts: [],
        daily_reports: [],
        user_profiles: [],
        facility_subscriptions: [],
      });
      const ctx = buildOrgAdminCtx(ORG_B, fake);
      const caller = appRouter.createCaller(ctx);
      await caller.org.listFacilities();

      const facChain2 = fake._chains["facilities"] as MockChain | undefined;
      expect(facChain2).toBeDefined();
      const eqArgs2 = facChain2!._getEqArgs();
      const orgEq = eqArgs2.find(([col]) => col === "organization_id");
      expect(orgEq?.[1]).toBe(ORG_B); // NOT ORG_A
    });
  });

  // --------------------------------------------------------------------------
  // getRollupMetrics
  // --------------------------------------------------------------------------
  describe("getRollupMetrics", () => {
    it("aggregates incidents and alerts scoped to org facilities only", async () => {
      const fake = buildFakeSupabase({
        facilities: [{ id: FAC_1, name: "Arena 1", organization_id: ORG_A }],
        incidents: [
          { id: "i1", kind: "incident" },
          { id: "i2", kind: "accident" },
        ],
        air_quality_readings: [{ tier: "2" }, { tier: "3" }],
        alerts: [
          { facility_id: FAC_1 },
          { facility_id: FAC_1 },
        ],
        daily_reports: [
          {
            facility_id: FAC_1,
            submitted_at: new Date().toISOString(),
          },
        ],
        facility_subscriptions: [{ facility_id: FAC_1, status: "active" }],
      });

      const ctx = buildOrgAdminCtx(ORG_A, fake);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.org.getRollupMetrics({ days: 30 });

      expect(result.totalIncidents).toBe(2);
      expect(result.totalAccidents).toBe(1);
      expect(typeof result.avgAirQualityTier).toBe("number");
      expect(result.facilitiesActive).toBe(1);
      expect(result.facilitiesOnTrial).toBe(0);
    });

    it("returns zero metrics when org has no facilities", async () => {
      const fake = buildFakeSupabase({ facilities: [] });
      const ctx = buildOrgAdminCtx(ORG_A, fake);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.org.getRollupMetrics({ days: 7 });

      expect(result.totalIncidents).toBe(0);
      expect(result.totalAccidents).toBe(0);
      expect(result.avgAirQualityTier).toBeNull();
      expect(result.facilitiesWithOpenAlerts).toBe(0);
      expect(result.dailyReportCompletionRate).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // getFacilityAlerts
  // --------------------------------------------------------------------------
  describe("getFacilityAlerts", () => {
    it("includes facilityName on each alert row", async () => {
      const fake = buildFakeSupabase({
        facilities: [
          { id: FAC_1, name: "Ice Palace", organization_id: ORG_A },
        ],
        alerts: [
          {
            id: "alert-1",
            facility_id: FAC_1,
            alert_type: "refrigeration_drift",
            severity: "warning",
            title: "Temp rising",
            description: "Compressor 1 drifting",
            created_at: new Date().toISOString(),
          },
        ],
      });

      const ctx = buildOrgAdminCtx(ORG_A, fake);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.org.getFacilityAlerts();

      expect(result).toHaveLength(1);
      expect(result[0]!.facilityName).toBe("Ice Palace");
      expect(result[0]!.facilityId).toBe(FAC_1);
      expect(result[0]!.alertType).toBe("refrigeration_drift");
    });

    it("returns empty array when org has no facilities", async () => {
      const fake = buildFakeSupabase({ facilities: [] });
      const ctx = buildOrgAdminCtx(ORG_A, fake);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.org.getFacilityAlerts();
      expect(result).toEqual([]);
    });

    it("sorts critical alerts before warning before info", async () => {
      const now = new Date().toISOString();
      const fake = buildFakeSupabase({
        facilities: [
          { id: FAC_1, name: "Arena", organization_id: ORG_A },
        ],
        alerts: [
          {
            id: "a-info",
            facility_id: FAC_1,
            alert_type: "missed_report",
            severity: "info",
            title: "Info",
            description: "",
            created_at: now,
          },
          {
            id: "a-critical",
            facility_id: FAC_1,
            alert_type: "refrigeration_drift",
            severity: "critical",
            title: "Critical",
            description: "",
            created_at: now,
          },
          {
            id: "a-warning",
            facility_id: FAC_1,
            alert_type: "ice_depth",
            severity: "warning",
            title: "Warning",
            description: "",
            created_at: now,
          },
        ],
      });

      const ctx = buildOrgAdminCtx(ORG_A, fake);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.org.getFacilityAlerts();

      expect(result[0]!.severity).toBe("critical");
      expect(result[1]!.severity).toBe("warning");
      expect(result[2]!.severity).toBe("info");
    });
  });
});
