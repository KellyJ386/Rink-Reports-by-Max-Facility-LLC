import "server-only";

import { TRPCError } from "@trpc/server";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { requireAdmin } from "@/server/trpc/routers/admin";
import {
  UpdateFacilityConfigInput,
  type SchedulingFacilityConfig,
} from "@/modules/scheduling/schema";

/** Default scheduling config values returned when no row exists. */
const DEFAULTS: SchedulingFacilityConfig = {
  facility_id: "", // will be overwritten
  swap_requires_approval: true,
  pickup_notice_hours: 24,
  swap_notice_hours: 48,
  availability_deadline_day: 15,
  email_events: [],
};

export const schedulingConfigRouter = router({
  /**
   * Get the scheduling facility config. If no row exists, return defaults.
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("scheduling_facility_config" as never)
      .select("facility_id, swap_requires_approval, pickup_notice_hours, swap_notice_hours, availability_deadline_day, email_events" as never)
      .eq("facility_id" as never, ctx.facilityId as never)
      .maybeSingle();

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: (error as unknown as { message: string }).message,
      });
    }

    if (!data) {
      return { ...DEFAULTS, facility_id: ctx.facilityId };
    }
    return data as unknown as SchedulingFacilityConfig;
  }),

  /**
   * Upsert the scheduling facility config. Admin only.
   * If the row exists, update it. Otherwise, insert.
   */
  update: protectedProcedure
    .input(UpdateFacilityConfigInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      // Check if a row already exists
      const { data: existing } = await ctx.supabase
        .from("scheduling_facility_config" as never)
        .select("facility_id" as never)
        .eq("facility_id" as never, ctx.facilityId as never)
        .maybeSingle();

      if (existing) {
        // Update — only patch fields that were provided
        const patch: Record<string, unknown> = {};
        if (input.swap_requires_approval !== undefined) patch.swap_requires_approval = input.swap_requires_approval;
        if (input.pickup_notice_hours !== undefined) patch.pickup_notice_hours = input.pickup_notice_hours;
        if (input.swap_notice_hours !== undefined) patch.swap_notice_hours = input.swap_notice_hours;
        if (input.availability_deadline_day !== undefined) patch.availability_deadline_day = input.availability_deadline_day;
        if (input.email_events !== undefined) patch.email_events = input.email_events;

        if (Object.keys(patch).length === 0) return { ok: true as const };

        const { error } = await ctx.supabase
          .from("scheduling_facility_config" as never)
          .update(patch as never)
          .eq("facility_id" as never, ctx.facilityId as never);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: (error as unknown as { message: string }).message,
          });
        }
      } else {
        // Insert with defaults merged with provided values
        const row = {
          facility_id: ctx.facilityId,
          swap_requires_approval: input.swap_requires_approval ?? DEFAULTS.swap_requires_approval,
          pickup_notice_hours: input.pickup_notice_hours ?? DEFAULTS.pickup_notice_hours,
          swap_notice_hours: input.swap_notice_hours ?? DEFAULTS.swap_notice_hours,
          availability_deadline_day: input.availability_deadline_day ?? DEFAULTS.availability_deadline_day,
          email_events: input.email_events ?? DEFAULTS.email_events,
        };

        const { error } = await ctx.supabase
          .from("scheduling_facility_config" as never)
          .insert(row as never);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: (error as unknown as { message: string }).message,
          });
        }
      }

      return { ok: true as const };
    }),
});
