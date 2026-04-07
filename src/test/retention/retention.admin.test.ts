import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

/**
 * Tests for admin retention policy Zod validation.
 *
 * We test the input schema constraints directly (no tRPC context
 * needed) to keep these fast and isolated:
 *
 *   1. updateRetentionPolicies with a numeric value < 365 → fails
 *   2. incidents field set to anything other than null → fails
 *   3. airQualityReadings field set to anything other than null → fails
 *   4. Valid input (all fields >= 365, null compliance fields) → passes
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceRoleClient: vi.fn(),
}));
vi.mock("@/lib/hubspot", () => ({ createOrUpdateContact: vi.fn() }));
vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(),
  PLANS: {},
  isActiveStatus: vi.fn(() => false),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
}));

// The exact schema mirroring the one in admin.ts so we can unit-test it
// without importing the full router (which has side effects).
const UpdateRetentionPoliciesInput = z.object({
  dailyReports: z.number().int().min(365),
  iceOperations: z.number().int().min(365),
  refrigerationReadings: z.number().int().min(365),
  iceDepthSessions: z.number().int().min(365),
  airQualityReadings: z.null(),
  incidents: z.null(),
});

const VALID_INPUT = {
  dailyReports: 365,
  iceOperations: 730,
  refrigerationReadings: 730,
  iceDepthSessions: 365,
  airQualityReadings: null,
  incidents: null,
} as const;

describe("updateRetentionPolicies input schema", () => {
  it("accepts valid input where all numeric values are >= 365", () => {
    const result = UpdateRetentionPoliciesInput.safeParse(VALID_INPUT);
    expect(result.success).toBe(true);
  });

  it("rejects dailyReports < 365 with Zod validation error", () => {
    const result = UpdateRetentionPoliciesInput.safeParse({
      ...VALID_INPUT,
      dailyReports: 364,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path.join("."));
      expect(fields).toContain("dailyReports");
    }
  });

  it("rejects iceOperations < 365 with Zod validation error", () => {
    const result = UpdateRetentionPoliciesInput.safeParse({
      ...VALID_INPUT,
      iceOperations: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects refrigerationReadings < 365 with Zod validation error", () => {
    const result = UpdateRetentionPoliciesInput.safeParse({
      ...VALID_INPUT,
      refrigerationReadings: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects iceDepthSessions < 365 with Zod validation error", () => {
    const result = UpdateRetentionPoliciesInput.safeParse({
      ...VALID_INPUT,
      iceDepthSessions: 364,
    });
    expect(result.success).toBe(false);
  });

  it("rejects incidents being a number (must be null — compliance)", () => {
    const result = UpdateRetentionPoliciesInput.safeParse({
      ...VALID_INPUT,
      incidents: 365,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path.join("."));
      expect(fields).toContain("incidents");
    }
  });

  it("rejects incidents being a string (must be null — compliance)", () => {
    const result = UpdateRetentionPoliciesInput.safeParse({
      ...VALID_INPUT,
      incidents: "365",
    });
    expect(result.success).toBe(false);
  });

  it("rejects incidents being false (must be null — compliance)", () => {
    const result = UpdateRetentionPoliciesInput.safeParse({
      ...VALID_INPUT,
      incidents: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects airQualityReadings being a number (must be null — compliance)", () => {
    const result = UpdateRetentionPoliciesInput.safeParse({
      ...VALID_INPUT,
      airQualityReadings: 1825,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path.join("."));
      expect(fields).toContain("airQualityReadings");
    }
  });

  it("rejects airQualityReadings being a string (must be null — compliance)", () => {
    const result = UpdateRetentionPoliciesInput.safeParse({
      ...VALID_INPUT,
      airQualityReadings: "never",
    });
    expect(result.success).toBe(false);
  });

  it("rejects airQualityReadings being true (must be null — compliance)", () => {
    const result = UpdateRetentionPoliciesInput.safeParse({
      ...VALID_INPUT,
      airQualityReadings: true,
    });
    expect(result.success).toBe(false);
  });

  it("accepts large values well above 365", () => {
    const result = UpdateRetentionPoliciesInput.safeParse({
      ...VALID_INPUT,
      dailyReports: 3650,
      iceOperations: 9999,
      refrigerationReadings: 3650,
      iceDepthSessions: 730,
    });
    expect(result.success).toBe(true);
  });
});
