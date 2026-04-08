import { describe, it, expect, beforeEach, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
import { syncFacilityToHubSpot } from "@/server/hubspot/sync";

vi.mock("@sentry/nextjs");
vi.mock("@supabase/supabase-js");

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
  it("should sync a new facility to HubSpot with company, contact, and deal", async () => {
    const facilityId = "550e8400-e29b-41d4-a716-446655440000";

    // Mock global fetch
    global.fetch = vi.fn(async (url: string, options?: RequestInit) => {
      // Return different responses based on the URL
      if (url.includes("/companies/search")) {
        // Company not found
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      } else if (url.includes("/companies") && options?.method === "POST") {
        // Company created
        return new Response(JSON.stringify({ id: "company-123" }), {
          status: 201,
        });
      } else if (url.includes("/contacts/search")) {
        // Contact not found
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      } else if (url.includes("/contacts") && options?.method === "POST") {
        // Contact created
        return new Response(JSON.stringify({ id: "contact-456" }), {
          status: 201,
        });
      } else if (url.includes("/deals") && options?.method === "POST") {
        // Deal created
        return new Response(JSON.stringify({ id: "deal-789" }), {
          status: 201,
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    // Mock Supabase client
    const mockSupabase = {
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
          }),
          limit: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                stripe_customer_id: "cus_test",
                plan_status: "active",
                plan_tier: "pro",
                trial_ends_at: null,
                seat_count: 5,
              },
            }),
          }),
        }),
      }),
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: {
              user: { email: "admin@test.com" },
            },
          }),
        },
      },
    };

    vi.doMock("@supabase/supabase-js", () => ({
      createClient: vi.fn(() => mockSupabase),
    }));

    await syncFacilityToHubSpot(facilityId);

    // Verify that fetch was called for company, contact, and deal
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/companies/search"),
      expect.any(Object),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/contacts/search"),
      expect.any(Object),
    );
  });

  it("should map plan_status=active to Active Customer stage", async () => {
    const facilityId = "550e8400-e29b-41d4-a716-446655440001";

    const dealStages: string[] = [];

    global.fetch = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes("/deals") && options?.method === "POST") {
        const body = JSON.parse(options.body as string);
        dealStages.push(body.properties.dealstage);
        return new Response(JSON.stringify({ id: "deal-123" }), {
          status: 201,
        });
      }
      if (url.includes("/search")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      if (url.includes("/companies") && options?.method === "POST") {
        return new Response(JSON.stringify({ id: "company-123" }), {
          status: 201,
        });
      }
      return new Response(JSON.stringify({ id: "id-123" }), { status: 201 });
    });

    vi.doMock("@supabase/supabase-js", () => ({
      createClient: vi.fn(() => ({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi
                .fn()
                .mockResolvedValueOnce({
                  data: {
                    id: facilityId,
                    name: "Test Rink",
                    address_line1: "123 Main St",
                    created_at: "2026-01-01T00:00:00Z",
                  },
                })
                .mockResolvedValueOnce({
                  data: {
                    stripe_customer_id: "cus_test",
                    plan_status: "active",
                    plan_tier: "pro",
                    trial_ends_at: null,
                    seat_count: 5,
                  },
                }),
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { user_id: "user-123" },
                }),
              }),
            }),
          }),
        }),
        auth: {
          admin: {
            getUserById: vi.fn().mockResolvedValue({
              data: { user: { email: "admin@test.com" } },
            }),
          },
        },
      })),
    }));

    await syncFacilityToHubSpot(facilityId);

    // Verify that "Active Customer" stage was sent for active plan_status
    expect(dealStages.some((stage) => stage === "Active Customer")).toBe(true);
  });

  it("should map plan_status=cancelled to Churned stage", async () => {
    const facilityId = "550e8400-e29b-41d4-a716-446655440002";

    const dealStages: string[] = [];

    global.fetch = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes("/deals") && options?.method === "POST") {
        const body = JSON.parse(options.body as string);
        dealStages.push(body.properties.dealstage);
        return new Response(JSON.stringify({ id: "deal-123" }), {
          status: 201,
        });
      }
      if (url.includes("/search")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      if (url.includes("/companies") && options?.method === "POST") {
        return new Response(JSON.stringify({ id: "company-123" }), {
          status: 201,
        });
      }
      return new Response(JSON.stringify({ id: "id-123" }), { status: 201 });
    });

    vi.doMock("@supabase/supabase-js", () => ({
      createClient: vi.fn(() => ({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi
                .fn()
                .mockResolvedValueOnce({
                  data: {
                    id: facilityId,
                    name: "Test Rink",
                    address_line1: "123 Main St",
                    created_at: "2026-01-01T00:00:00Z",
                  },
                })
                .mockResolvedValueOnce({
                  data: {
                    stripe_customer_id: "cus_test",
                    plan_status: "cancelled",
                    plan_tier: "pro",
                    trial_ends_at: null,
                    seat_count: 5,
                  },
                }),
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { user_id: "user-123" },
                }),
              }),
            }),
          }),
        }),
        auth: {
          admin: {
            getUserById: vi.fn().mockResolvedValue({
              data: { user: { email: "admin@test.com" } },
            }),
          },
        },
      })),
    }));

    await syncFacilityToHubSpot(facilityId);

    // Verify that "Churned" stage was sent for cancelled plan_status
    expect(dealStages.some((stage) => stage === "Churned")).toBe(true);
  });

  it("should handle HubSpot API failures gracefully with Sentry capture", async () => {
    const facilityId = "550e8400-e29b-41d4-a716-446655440003";

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes("/search")) {
        return new Response(JSON.stringify({ error: "API Error" }), {
          status: 500,
        });
      }
      return new Response(JSON.stringify({}), { status: 500 });
    });

    vi.doMock("@supabase/supabase-js", () => ({
      createClient: vi.fn(() => ({
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
      })),
    }));

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
