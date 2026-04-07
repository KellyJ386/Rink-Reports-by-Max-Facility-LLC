import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for POST /api/push/subscribe route handler.
 *
 * Tests:
 *   1. Missing auth → 401
 *   2. Valid subscription body + authenticated user → upserted into
 *      push_subscriptions and returns { ok: true }
 */

// Valid push subscription shape matching the Zod schema
const VALID_SUBSCRIPTION = {
  endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-token",
  expirationTime: null,
  keys: {
    p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlIRp7L6b6sjtHkY4O61i1LkF5zMhHkI3E==",
    auth: "tBHItJI5SVyuos_Co3sGA==",
  },
};

interface MockState {
  user: { id: string } | null;
  authError: { message: string } | null;
  profile: { facility_id: string | null } | null;
  profileError: { message: string } | null;
  upsertError: { message: string } | null;
}

const state: MockState = {
  user: null,
  authError: null,
  profile: null,
  profileError: null,
  upsertError: null,
};

const upsertSpy = vi.fn();

// Mock both server client variants
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: state.user },
        error: state.authError,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "user_profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({
            data: state.profile,
            error: state.profileError,
          })),
        };
      }
      return {};
    }),
  })),

  createSupabaseServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "push_subscriptions") {
        return {
          upsert: vi.fn((data: unknown) => {
            upsertSpy(data);
            return {
              then: vi.fn((resolve: (v: unknown) => void) =>
                resolve({ error: state.upsertError }),
              ),
            };
          }),
        };
      }
      return {};
    }),
  })),
}));

import { POST } from "@/app/api/push/subscribe/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.user = null;
  state.authError = null;
  state.profile = null;
  state.profileError = null;
  state.upsertError = null;
  upsertSpy.mockClear();
  vi.clearAllMocks();
});

describe("POST /api/push/subscribe", () => {
  it("returns 401 when user is not authenticated", async () => {
    state.user = null;
    state.authError = null;

    const req = makeRequest({ subscription: VALID_SUBSCRIPTION });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Unauthorized" });
  });

  it("upserts subscription and returns ok:true for authenticated user", async () => {
    state.user = { id: "user-uuid-123" };
    state.profile = { facility_id: "facility-uuid-456" };

    const req = makeRequest({ subscription: VALID_SUBSCRIPTION });
    const res = await POST(req);

    // Should succeed
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true });

    // Should have called upsert with correct shape
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-uuid-123",
        facility_id: "facility-uuid-456",
        subscription: expect.objectContaining({
          endpoint: VALID_SUBSCRIPTION.endpoint,
        }),
      }),
    );
  });

  it("returns 422 when subscription body is invalid", async () => {
    state.user = { id: "user-uuid-123" };

    const req = makeRequest({ subscription: { invalid: true } });
    const res = await POST(req);

    expect(res.status).toBe(422);
  });

  it("returns 403 when user has no facility", async () => {
    state.user = { id: "user-uuid-123" };
    state.profile = null; // no profile

    const req = makeRequest({ subscription: VALID_SUBSCRIPTION });
    const res = await POST(req);

    expect(res.status).toBe(403);
  });
});
