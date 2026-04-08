import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fetchWeatherForFacility } from "@/server/weather/service";

vi.mock("@/lib/supabase-server");
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

describe("weather/service", () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn(),
    };
    global.fetch = vi.fn();
  });

  describe("fetchWeatherForFacility", () => {
    it("returns cached weather if found in daily_weather table", async () => {
      const facilityId = "fac-123";
      const date = "2026-04-08";

      const cachedRow = {
        facility_id: facilityId,
        weather_date: date,
        high_temp_f: 72,
        low_temp_f: 55,
        avg_temp_f: 63.5,
        precipitation_in: 0.1,
        snow_in: null,
        wind_mph: 10,
        conditions: null,
      };

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: cachedRow, error: null }),
      };

      mockSupabase.from.mockReturnValue(mockChain);

      const result = await fetchWeatherForFacility(facilityId, date, mockSupabase);

      expect(result).toEqual({
        facilityId,
        date,
        highTempF: 72,
        lowTempF: 55,
        avgTempF: 63.5,
        precipitationIn: 0.1,
        snowIn: null,
        windMph: 10,
        conditions: null,
      });

      // Verify cache query was made
      expect(mockSupabase.from).toHaveBeenCalledWith("daily_weather");
      expect(mockChain.eq).toHaveBeenCalledWith("facility_id", facilityId);
      expect(mockChain.eq).toHaveBeenCalledWith("weather_date", date);
    });

    it("fetches from Open-Meteo if cache miss and lat/long available", async () => {
      const facilityId = "fac-456";
      const date = "2026-04-08";

      // Cache miss
      const cachedMockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: null, error: null }),
      };

      // Config fetch
      const configMockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            latitude: 40.7128,
            longitude: -74.006,
            value: {},
          },
          error: null,
        }),
      };

      // Upsert — attach .upsert() to the daily_weather chain so the second
      // .from("daily_weather") call (for upsert after cache miss) finds it.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cachedMockChain as any).upsert = vi.fn().mockResolvedValue({ error: null });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "daily_weather") {
          return cachedMockChain;
        }
        if (table === "facility_config") {
          return configMockChain;
        }
        return cachedMockChain;
      });

      // Mock Open-Meteo response
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          daily: {
            temperature_2m_max: [75],
            temperature_2m_min: [58],
            precipitation_sum: [0.05],
            snowfall_sum: [0],
            windspeed_10m_max: [12],
          },
        }),
      });

      const result = await fetchWeatherForFacility(
        facilityId,
        date,
        mockSupabase,
      );

      expect(result).toEqual({
        facilityId,
        date,
        highTempF: 75,
        lowTempF: 58,
        avgTempF: 66.5,
        precipitationIn: 0.05,
        snowIn: 0,
        windMph: 12,
        conditions: null,
      });
    });

    it("geocodes from zip_code if lat/long missing", async () => {
      const facilityId = "fac-789";
      const date = "2026-04-08";

      // Cache miss
      const cachedMockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: null, error: null }),
      };

      // Config fetch (no lat/long, but has zip_code)
      const configMockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            latitude: null,
            longitude: null,
            value: { zip_code: "10001" },
          },
          error: null,
        }),
      };

      // Upsert — attach .upsert() to the daily_weather chain so the second
      // .from("daily_weather") call (for upsert after cache miss) finds it.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cachedMockChain as any).upsert = vi.fn().mockResolvedValue({ error: null });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "daily_weather") {
          return cachedMockChain;
        }
        if (table === "facility_config") {
          return configMockChain;
        }
        return cachedMockChain;
      });

      // Mock Zippopotam response
      (global.fetch as Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            places: [
              {
                latitude: "40.7128",
                longitude: "-74.006",
              },
            ],
          }),
        })
        // Mock Open-Meteo response
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            daily: {
              temperature_2m_max: [75],
              temperature_2m_min: [58],
              precipitation_sum: [0],
              snowfall_sum: [0],
              windspeed_10m_max: [10],
            },
          }),
        });

      const result = await fetchWeatherForFacility(
        facilityId,
        date,
        mockSupabase,
      );

      expect(result).toBeTruthy();
      expect(result?.highTempF).toBe(75);

      // Verify Zippopotam was called
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("zippopotam"),
      );
    });

    it("returns null if no coordinates available", async () => {
      const facilityId = "fac-nocoords";
      const date = "2026-04-08";

      // Cache miss
      const cachedMockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: null, error: null }),
      };

      // Config fetch (no lat/long, no zip_code)
      const configMockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            latitude: null,
            longitude: null,
            value: {},
          },
          error: null,
        }),
      };

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "daily_weather") {
          return cachedMockChain;
        }
        if (table === "facility_config") {
          return configMockChain;
        }
        return {};
      });

      const result = await fetchWeatherForFacility(
        facilityId,
        date,
        mockSupabase,
      );

      expect(result).toBeNull();
    });
  });
});
