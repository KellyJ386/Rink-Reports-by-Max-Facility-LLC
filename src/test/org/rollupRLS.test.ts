/**
 * Roll-up RLS isolation smoke tests (Phase G multi-facility).
 *
 * These tests verify that when a caller's ctx is scoped to org-a,
 * the supabase query is filtered by organization_id = org-a — and
 * a different caller scoped to org-b sees org-b, not org-a.
 *
 * This is the server-side RLS guard (CLAUDE.md Rule 8 "server layer").
 * The DB-layer guard is tested separately against a live Supabase
 * instance via get_user_org_ids() / facilities_org_member_select policy.
 */

import { describe, it, expect, vi } from "vitest";

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

// ── Imports (after mocks) ───────────────────────────────────────────────────

import { appRouter } from "@/server/trpc/routers";
import type { TRPCContext } from "@/server/trpc/context";

// ── Constants ────────────────────────────────────────────────────────────────

const ORG_A = "11111111-1111-4111-a111-111111111111";
const ORG_B = "22222222-2222-4222-a222-222222222222";

// ── Mock helpers ─────────────────────────────────────────────────────────────

type AnyRecord = Record<string, unknown>

/** Type for the chainable mock returned by makeChain */
type MockChain = {
  _getCapturedEq: () => Array<[string, string]>;
  [key: string]: unknown;
};

function makeChain(rows: AnyRecord[] = []) {
  const capturedEq: Array<[string, string]> = [];

  const chain: AnyRecord = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((col: string, val: string) => {
      capturedEq.push([col, val]);
      return chain;
    }),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({ data: rows[0] ?? null, error: null })),
    single: vi.fn(async () => ({ data: rows[0] ?? null, error: null })),
    then: (resolve: (v: { data: AnyRecord[]; error: null }) => unknown) =>
      resolve({ data: rows, error: null }),
    _getCapturedEq: () => capturedEq,
  };
  return chain;
}

function buildFakeSupabase(tableRows: Record<string, AnyRecord[]> = {}) {
  const chains: Record<string, ReturnType<typeof makeChain>> = {};

  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    from: vi.fn((table: string) => {
      if (!chains[table]) {
        chains[table] = makeChain(tableRows[table] ?? []);
      }
      return chains[table];
    }),
    _chains: chains,
  };
}

function buildCtxForOrg(orgId: string, fakeSupabase: AnyRecord): TRPCContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: fakeSupabase as any,
    user: { id: "user-1" } as TRPCContext["user"],
    facilityId: "fac-1",
    role: "admin",
    organizationIds: [orgId],
    orgRoles: { [orgId]: "org_admin" },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("org roll-up RLS isolation", () => {
  it("listFacilities scopes query to org-a when ctx is for org-a", async () => {
    const fake = buildFakeSupabase({
      facilities: [
        { id: "fac-a", name: "Arena A", organization_id: ORG_A },
      ],
      alerts: [],
      daily_reports: [],
      user_profiles: [],
      facility_subscriptions: [],
    });

    const ctx = buildCtxForOrg(ORG_A, fake);
    const caller = appRouter.createCaller(ctx);
    await caller.org.listFacilities();

    const facChain = fake._chains["facilities"] as MockChain | undefined;
    expect(facChain).toBeDefined();
    const orgEq = facChain!
      ._getCapturedEq()
      .find(([col]) => col === "organization_id");

    expect(orgEq).toBeDefined();
    expect(orgEq![1]).toBe(ORG_A); // scoped to org-a
    expect(orgEq![1]).not.toBe(ORG_B); // NOT org-b
  });

  it("listFacilities scopes query to org-b when ctx is for org-b", async () => {
    const fake = buildFakeSupabase({
      facilities: [
        { id: "fac-b", name: "Arena B", organization_id: ORG_B },
      ],
      alerts: [],
      daily_reports: [],
      user_profiles: [],
      facility_subscriptions: [],
    });

    const ctx = buildCtxForOrg(ORG_B, fake);
    const caller = appRouter.createCaller(ctx);
    await caller.org.listFacilities();

    const facChain = fake._chains["facilities"] as MockChain | undefined;
    expect(facChain).toBeDefined();
    const orgEq = facChain!
      ._getCapturedEq()
      .find(([col]) => col === "organization_id");

    expect(orgEq).toBeDefined();
    expect(orgEq![1]).toBe(ORG_B); // scoped to org-b
    expect(orgEq![1]).not.toBe(ORG_A); // NOT org-a
  });

  it("getRollupMetrics scopes facilities query to selectedOrgId", async () => {
    const fake = buildFakeSupabase({
      facilities: [{ id: "fac-a2", name: "Arena A2", organization_id: ORG_A }],
      incidents: [],
      air_quality_readings: [],
      alerts: [],
      daily_reports: [],
      facility_subscriptions: [],
    });

    const ctx = buildCtxForOrg(ORG_A, fake);
    const caller = appRouter.createCaller(ctx);
    await caller.org.getRollupMetrics({ days: 7 });

    const facChain = fake._chains["facilities"] as MockChain | undefined;
    expect(facChain).toBeDefined();
    const orgEq = facChain!
      ._getCapturedEq()
      .find(([col]) => col === "organization_id");

    expect(orgEq).toBeDefined();
    expect(orgEq![1]).toBe(ORG_A);
  });

  it("a caller with only org-b membership only sees org-b facilities", async () => {
    // The orgAdminProcedure middleware picks ctx.orgRoles's first
    // org_admin entry as selectedOrgId. Because the input schema no
    // longer accepts an explicit organizationId, there is no way for
    // a client to escalate to an org they don't belong to — the org
    // is derived purely from server-resolved context.
    const fake = buildFakeSupabase();
    const ctx: TRPCContext = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: fake as any,
      user: { id: "user-b" } as TRPCContext["user"],
      facilityId: "fac-b",
      role: "admin",
      organizationIds: [ORG_B],
      orgRoles: { [ORG_B]: "org_admin" },
    };

    const caller = appRouter.createCaller(ctx);
    await caller.org.listFacilities();

    // The facilities query must be scoped to ORG_B (ctx-derived), never
    // ORG_A. Inspect the chain's .eq calls.
    const facilitiesChain = fake._chains.facilities;
    if (facilitiesChain) {
      const eqCalls = (facilitiesChain.eq as ReturnType<typeof vi.fn>).mock.calls;
      const orgIdCalls = eqCalls.filter((c) => c[0] === "organization_id");
      expect(orgIdCalls.some((c) => c[1] === ORG_B)).toBe(true);
      expect(orgIdCalls.some((c) => c[1] === ORG_A)).toBe(false);
    }
  });
});
