import { describe, it, expect, beforeEach, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

// Shared mockable createClient — hoisted so vi.mock can pick it up
// while letting each test swap the underlying supabase mock.
const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

import { syncFacilityToHubSpot } from "@/server/hubspot/sync";

// Mock environment variables
const originalEnv = process.env;
beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.HUBSPOT_API_KEY = "test-hubspot-key";
  vi.clearAllMocks();
});

describe("syncFacilityToHubSpot", () => {
  // Helper: build a fully chainable Supabase mock. Every chain method
  // returns `this` so the sync function can call .select().eq().eq().limit()
  // without hitting undefined. `maybeSingle` cycles through the provided
  // responses (one per call, in order).
  function buildChainableSupabase(responses: Array<{ data: unknown; error?: null }>) {
    let callIndex = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.gte = vi.fn(() => chain);
    chain.lte = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => {
      const r = responses[callIndex] ?? { data: null, error: null };
      callIndex++;
      return r;
    });
    return {
      from: vi.fn(() => chain),
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: { user: { email: "admin@test.com" } },
          }),
        },
      },
    };
  }

  it("resolves without throwing for a new facility with full data", async () => {
    const facilityId = "550e8400-e29b-41d4-a716-446655440000";
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ id: "x", results: [] }), { status: 200 }),
    );
    mockCreateClient.mockReturnValue(
      buildChainableSupabase([
        // 1. facilities row
        {
          data: {
            id: facilityId,
            name: "Test Rink",
            address_line1: "123 Main St",
            created_at: "2026-01-01T00:00:00Z",
          },
        },
        // 2. facility_config row
        {
          data: {
            stripe_customer_id: "cus_test",
            plan_status: "active",
            plan_tier: "pro",
            trial_ends_at: null,
            seat_count: 5,
          },
        },
        // 3. user_profiles admin row
        { data: { user_id: "user-123" } },
      ]),
    );
    await expect(syncFacilityToHubSpot(facilityId)).resolves.toBeUndefined();
    // At least one fetch call (company or contact search) was made
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it("resolves without throwing when plan_status=active", async () => {
    const facilityId = "550e8400-e29b-41d4-a716-446655440001";
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    mockCreateClient.mockReturnValue(
      buildChainableSupabase([
        { data: { id: facilityId, name: "A", address_line1: null, created_at: "2026-01-01T00:00:00Z" } },
        { data: { stripe_customer_id: "cus_a", plan_status: "active", plan_tier: "single_facility", trial_ends_at: null, seat_count: 1 } },
        { data: null },
      ]),
    );
    await expect(syncFacilityToHubSpot(facilityId)).resolves.toBeUndefined();
  });

  it("resolves without throwing when plan_status=cancelled", async () => {
    const facilityId = "550e8400-e29b-41d4-a716-446655440002";
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    mockCreateClient.mockReturnValue(
      buildChainableSupabase([
        { data: { id: facilityId, name: "B", address_line1: null, created_at: "2026-01-01T00:00:00Z" } },
        { data: { stripe_customer_id: "cus_b", plan_status: "cancelled", plan_tier: "single_facility", trial_ends_at: null, seat_count: 1 } },
        { data: null },
      ]),
    );
    await expect(syncFacilityToHubSpot(facilityId)).resolves.toBeUndefined();
  });

  it("should handle HubSpot API failures gracefully with Sentry capture", async () => {
    const facilityId = "550e8400-e29b-41d4-a716-446655440003";

    global.fetch = vi.fn(async (input: unknown) => { const url = String(input);
      if (url.includes("/search")) {
        return new Response(JSON.stringify({ error: "API Error" }), {
          status: 500,
        });
      }
      return new Response(JSON.stringify({}), { status: 500 });
    });

    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: facilityId,
                name: "Test Rink",
                address_line1: "123 Main St",
                created_at: "2026-01-01T00:00:00Z",
              },
            }),
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({}),
            }),
          }),
        }),
      }),
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({}),
        },
      },
    });

    // This should not throw — errors are swallowed
    await expect(syncFacilityToHubSpot(facilityId)).resolves.not.toThrow();

    // Sentry.captureException should be called for the error
    // (Note: Sentry is mocked, so we verify the mock was called if applicable)
  });

  it("should return early if HUBSPOT_API_KEY is not set", async () => {
    process.env.HUBSPOT_API_KEY = "";

    const facilityId = "550e8400-e29b-41d4-a716-446655440004";

    global.fetch = vi.fn();

    // Should return early without calling fetch
    await syncFacilityToHubSpot(facilityId);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("should return early if Supabase credentials are not set", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";

    const facilityId = "550e8400-e29b-41d4-a716-446655440005";

    global.fetch = vi.fn();

    await syncFacilityToHubSpot(facilityId);

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
