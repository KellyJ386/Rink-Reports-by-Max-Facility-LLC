import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { TRPCError } from "@trpc/server";

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

vi.mock("@/server/weather/service", () => ({
  fetchWeatherForFacility: vi.fn(),
}));

import { appRouter } from "@/server/trpc/routers";
import type { TRPCContext } from "@/server/trpc/context";
import { fetchWeatherForFacility } from "@/server/weather/service";

const TEST_FACILITY_ID = "fac-weather-test";

function buildCtx(facilityId: string | null = TEST_FACILITY_ID): TRPCContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: {} as any,
    // Keep the user authenticated even when facilityId is null — the
    // inner procedure then throws FORBIDDEN rather than the outer
    // protectedProcedure middleware throwing UNAUTHORIZED.
    user: { id: "user-1", email: "test@example.com" } as unknown as TRPCContext["user"],
    facilityId,
    role: "staff",
  };
}

describe("weatherRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getForDate", () => {
    it("returns weather when facilityId is in context", async () => {
      const mockWeather = {
        facilityId: TEST_FACILITY_ID,
        date: "2026-04-08",
        highTempF: 72,
        lowTempF: 55,
        avgTempF: 63.5,
        precipitationIn: 0.1,
        snowIn: null,
        windMph: 10,
        conditions: null,
      };

      (fetchWeatherForFacility as Mock).mockResolvedValue(mockWeather);

      const caller = appRouter.createCaller(buildCtx());
      const result = await caller.weather.getForDate({ date: "2026-04-08" });

      expect(result).toEqual(mockWeather);
      expect(fetchWeatherForFacility).toHaveBeenCalledWith(
        TEST_FACILITY_ID,
        "2026-04-08",
        expect.anything(),
      );
    });

    it("returns null when weather data is not available", async () => {
      (fetchWeatherForFacility as Mock).mockResolvedValue(null);

      const caller = appRouter.createCaller(buildCtx());
      const result = await caller.weather.getForDate({ date: "2026-04-08" });

      expect(result).toBeNull();
    });

    it("throws FORBIDDEN when facilityId is not in context", async () => {
      const caller = appRouter.createCaller(buildCtx(null));

      await expect(
        caller.weather.getForDate({ date: "2026-04-08" }),
      ).rejects.toThrow(TRPCError);

      // Check it's FORBIDDEN
      try {
        await caller.weather.getForDate({ date: "2026-04-08" });
      } catch (err) {
        expect((err as TRPCError).code).toBe("FORBIDDEN");
      }
    });

    it("passes facilityId from context, not from input", async () => {
      (fetchWeatherForFacility as Mock).mockResolvedValue(null);

      const caller = appRouter.createCaller(buildCtx());
      await caller.weather.getForDate({ date: "2026-04-09" });

      // Verify facilityId came from context
      expect(fetchWeatherForFacility).toHaveBeenCalledWith(
        TEST_FACILITY_ID,
        "2026-04-09",
        expect.anything(),
      );
    });
  });
});
