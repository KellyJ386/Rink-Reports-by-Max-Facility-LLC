import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { requireAdmin } from "@/server/trpc/routers/admin";
import type { Json } from "@/lib/database.types";
import {
  CreateCompressorInput,
  DeleteCompressorInput,
  ReorderCompressorsInput,
  ThresholdMap,
  UpdateCompressorInput,
  type Compressor,
} from "@/modules/refrigeration/schema";

/**
 * Admin sub-router for the Refrigeration module. Mounted at
 * `admin.refrigeration`. Handles:
 *
 *   * compressor CRUD (one row per compressor at this facility)
 *   * threshold map writes — stored in `facility_config` under
 *     module='refrigeration', key='thresholds', value=ThresholdMap.
 *
 * The threshold map is one config row, not ten, so saving is atomic
 * and the admin form can preview the whole map before committing.
 */
export const refrigerationAdminRouter = router({
  // -------------------------------------------------------------------
  // Compressors
  // -------------------------------------------------------------------
  listCompressors: protectedProcedure.query(
    async ({ ctx }): Promise<Compressor[]> => {
      const { data, error } = await ctx.supabase
        .from("refrigeration_compressors")
        .select("id, facility_id, name, position, active")
        .eq("facility_id", ctx.facilityId)
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

  createCompressor: protectedProcedure
    .input(CreateCompressorInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      const { count, error: countErr } = await ctx.supabase
        .from("refrigeration_compressors")
        .select("id", { count: "exact", head: true })
        .eq("facility_id", ctx.facilityId);
      if (countErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: countErr.message,
        });
      }

      const { data, error } = await ctx.supabase
        .from("refrigeration_compressors")
        .insert({
          facility_id: ctx.facilityId,
          name: input.name,
          position: count ?? 0,
        })
        .select("id")
        .single();
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { id: data.id };
    }),

  updateCompressor: protectedProcedure
    .input(UpdateCompressorInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.active !== undefined) patch.active = input.active;
      if (Object.keys(patch).length === 0) return { ok: true as const };

      const { error } = await ctx.supabase
        .from("refrigeration_compressors")
        .update(patch)
        .eq("id", input.id)
        .eq("facility_id", ctx.facilityId);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { ok: true as const };
    }),

  deleteCompressor: protectedProcedure
    .input(DeleteCompressorInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      // Compressors are referenced from refrigeration_readings only
      // through the JSONB compressor_readings array, so there's no
      // FK to block deletes. Historical readings will simply have
      // dangling compressor_id values until their 90-day retention
      // sweeps them. That's acceptable for an append-only log; the
      // alternative (active/inactive only) is also available.
      const { error } = await ctx.supabase
        .from("refrigeration_compressors")
        .delete()
        .eq("id", input.id)
        .eq("facility_id", ctx.facilityId);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { ok: true as const };
    }),

  reorderCompressors: protectedProcedure
    .input(ReorderCompressorsInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      for (let i = 0; i < input.ids.length; i++) {
        const id = input.ids[i]!;
        const { error } = await ctx.supabase
          .from("refrigeration_compressors")
          .update({ position: i })
          .eq("id", id)
          .eq("facility_id", ctx.facilityId);
        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }
      }
      return { ok: true as const };
    }),

  // -------------------------------------------------------------------
  // Thresholds
  // -------------------------------------------------------------------
  setThresholds: protectedProcedure
    .input(z.object({ thresholds: ThresholdMap }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      // Upsert as a single row in facility_config. The value is the
      // entire ThresholdMap as JSON.
      const { error } = await ctx.supabase
        .from("facility_config")
        .upsert(
          {
            facility_id: ctx.facilityId,
            module: "refrigeration",
            key: "thresholds",
            value: input.thresholds as unknown as Json,
          },
          { onConflict: "facility_id,module,key" },
        );

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { ok: true as const };
    }),
});
