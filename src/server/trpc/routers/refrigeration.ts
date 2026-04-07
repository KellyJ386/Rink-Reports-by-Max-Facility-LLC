import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import {
  toCompressorReadings,
  type Compressor,
  type CompressorReadingRow,
} from "@/modules/refrigeration/schema";

/**
 * Staff-facing sub-router for Refrigeration. Mounted at the top
 * level as `refrigeration`. Reads only — writes go through the
 * offline-first Dexie queue and /api/sync per CLAUDE.md Rule 3.
 */

export interface RecentRefrigerationReading {
  id: string;
  submitted_at: string;
  submitted_by: string;
  brine_supply: number | null;
  brine_return: number | null;
  brine_flow: number | null;
  ice_surface_temp: number | null;
  condenser_temp: number | null;
  compressor_readings: CompressorReadingRow[];
  local_id: string | null;
}

export const refrigerationRouter = router({
  // -------------------------------------------------------------------
  // Active compressors only — staff form should hide retired units.
  // -------------------------------------------------------------------
  listCompressors: protectedProcedure.query(
    async ({ ctx }): Promise<Compressor[]> => {
      const { data, error } = await ctx.supabase
        .from("refrigeration_compressors")
        .select("id, facility_id, name, position, active")
        .eq("facility_id", ctx.facilityId)
        .eq("active", true)
        .order("position", { ascending: true });
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return data ?? [];
    },
  ),

  // -------------------------------------------------------------------
  // Most recent readings.
  // -------------------------------------------------------------------
  listRecent: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(
      async ({ ctx, input }): Promise<RecentRefrigerationReading[]> => {
        const { data, error } = await ctx.supabase
          .from("refrigeration_readings")
          .select(
            "id, submitted_at, submitted_by, brine_supply, brine_return, brine_flow, ice_surface_temp, condenser_temp, compressor_readings, local_id",
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

        return (data ?? []).map((row) => ({
          id: row.id,
          submitted_at: row.submitted_at,
          submitted_by: row.submitted_by,
          brine_supply: row.brine_supply,
          brine_return: row.brine_return,
          brine_flow: row.brine_flow,
          ice_surface_temp: row.ice_surface_temp,
          condenser_temp: row.condenser_temp,
          compressor_readings: toCompressorReadings(row.compressor_readings),
          local_id: row.local_id,
        }));
      },
    ),
});
