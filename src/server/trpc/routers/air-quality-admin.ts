import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { requireAdmin } from "@/server/trpc/routers/admin";
import type { Json } from "@/lib/database.types";
import {
  ActionProtocol,
  ThresholdSet,
  validateAgainstLimits,
} from "@/modules/air-quality/schema";

/**
 * Air Quality admin sub-router. Mounted at `admin.airQuality`.
 *
 * Handles three facility_config rows under module='air-quality':
 *
 *   key='regulatory_limits' — the legal MAXIMUM threshold per cell.
 *                             Admin enters from their jurisdiction.
 *   key='thresholds'        — the working thresholds. Validated to
 *                             be ≤ the corresponding regulatory limit
 *                             on save (the "tighten only" rule).
 *   key='actions'           — per-tier action protocol text shown to
 *                             the operator alongside the live tier.
 *
 * Each row is one facility_config upsert. Admin reads them via the
 * existing admin.getConfig({module: "air-quality"}) endpoint.
 */
export const airQualityAdminRouter = router({
  // -------------------------------------------------------------------
  // Regulatory limits — the upper bound that working thresholds must
  // not exceed.
  // -------------------------------------------------------------------
  setRegulatoryLimits: protectedProcedure
    .input(z.object({ limits: ThresholdSet }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      // Also re-check the current working thresholds against the new
      // limits. If a previously-saved working value is now too loose,
      // refuse the save and tell the admin which cell to fix.
      const { data: working } = await ctx.supabase
        .from("facility_config")
        .select("value")
        .eq("facility_id", ctx.facilityId)
        .eq("module", "air-quality")
        .eq("key", "thresholds")
        .maybeSingle();

      if (working?.value) {
        const parsed = ThresholdSet.safeParse(working.value);
        if (parsed.success) {
          const issues = validateAgainstLimits(parsed.data, input.limits);
          if (issues.length > 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Existing working thresholds violate the new limits: ${issues
                .map((i) => i.message)
                .join("; ")}`,
            });
          }
        }
      }

      const { error } = await ctx.supabase.from("facility_config").upsert(
        {
          facility_id: ctx.facilityId,
          module: "air-quality",
          key: "regulatory_limits",
          value: input.limits as unknown as Json,
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

  // -------------------------------------------------------------------
  // Working thresholds — must be ≤ the regulatory limits cell-wise.
  // -------------------------------------------------------------------
  setThresholds: protectedProcedure
    .input(z.object({ thresholds: ThresholdSet }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      const { data: limitsRow } = await ctx.supabase
        .from("facility_config")
        .select("value")
        .eq("facility_id", ctx.facilityId)
        .eq("module", "air-quality")
        .eq("key", "regulatory_limits")
        .maybeSingle();

      // If limits exist, enforce. If they don't, allow the save —
      // an admin can set working thresholds before recording their
      // jurisdictional limits, and the next setRegulatoryLimits call
      // will re-validate.
      if (limitsRow?.value) {
        const parsedLimits = ThresholdSet.safeParse(limitsRow.value);
        if (parsedLimits.success) {
          const issues = validateAgainstLimits(input.thresholds, parsedLimits.data);
          if (issues.length > 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: issues.map((i) => i.message).join("; "),
            });
          }
        }
      } else {
        // Even without limits, enforce internal ordering
        // (caution ≤ action ≤ evacuate).
        const issues = validateAgainstLimits(input.thresholds, input.thresholds);
        const orderingOnly = issues.filter((i) =>
          /must be ≤/i.test(i.message),
        );
        if (orderingOnly.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: orderingOnly.map((i) => i.message).join("; "),
          });
        }
      }

      const { error } = await ctx.supabase.from("facility_config").upsert(
        {
          facility_id: ctx.facilityId,
          module: "air-quality",
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

  // -------------------------------------------------------------------
  // Per-tier action protocol text.
  // -------------------------------------------------------------------
  setActions: protectedProcedure
    .input(z.object({ actions: ActionProtocol }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const { error } = await ctx.supabase.from("facility_config").upsert(
        {
          facility_id: ctx.facilityId,
          module: "air-quality",
          key: "actions",
          value: input.actions as unknown as Json,
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
