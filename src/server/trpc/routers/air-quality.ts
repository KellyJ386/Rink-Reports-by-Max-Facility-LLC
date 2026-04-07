import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { TierSchema, type Tier } from "@/modules/air-quality/schema";

/**
 * Staff-facing sub-router for Air Quality. Mounted at the top level
 * as `airQuality`. Reads only — writes go through the offline-first
 * Dexie queue and /api/sync.
 *
 * The tier is computed and frozen at insert time on the server, so
 * historical reports never shift if thresholds are later retightened.
 */

export interface RecentAirQualityReading {
  id: string;
  submitted_at: string;
  submitted_by: string;
  co_ppm: number;
  no2_ppm: number;
  notes: string | null;
  tier: Tier;
  local_id: string | null;
}

export const airQualityRouter = router({
  listRecent: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }): Promise<RecentAirQualityReading[]> => {
      const { data, error } = await ctx.supabase
        .from("air_quality_readings")
        .select(
          "id, submitted_at, submitted_by, co_ppm, no2_ppm, notes, tier, local_id",
        )
        .eq("facility_id", ctx.facilityId)
        .order("submitted_at", { ascending: false })
        .limit(input.limit);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return (data ?? []).map((row) => {
        const tierParsed = TierSchema.safeParse(row.tier);
        return {
          id: row.id,
          submitted_at: row.submitted_at,
          submitted_by: row.submitted_by,
          co_ppm: row.co_ppm,
          no2_ppm: row.no2_ppm,
          notes: row.notes,
          tier: tierParsed.success ? tierParsed.data : "normal",
          local_id: row.local_id,
        };
      });
    }),
});
