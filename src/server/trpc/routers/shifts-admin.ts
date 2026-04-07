import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { requireAdmin } from "@/server/trpc/routers/admin";

/**
 * Shift Configuration admin sub-router (mounted at admin.shifts).
 *
 * Manages the facility-wide shared shift catalog (facility_shifts).
 * Both the Refrigeration staff form and the Scheduling editor read
 * from this list — defining a shift in one place keeps the names
 * and times consistent across modules per the Admin Control Center
 * spec section 9.
 */

const TimeRegex = /^\d{2}:\d{2}(:\d{2})?$/;

const CreateShiftInput = z.object({
  name:       z.string().min(1).max(60),
  start_time: z.string().regex(TimeRegex, "HH:MM or HH:MM:SS"),
  end_time:   z.string().regex(TimeRegex, "HH:MM or HH:MM:SS"),
});

const UpdateShiftInput = z.object({
  id:         z.string().uuid(),
  name:       z.string().min(1).max(60).optional(),
  start_time: z.string().regex(TimeRegex).optional(),
  end_time:   z.string().regex(TimeRegex).optional(),
});

const DeleteShiftInput = z.object({ id: z.string().uuid() });

const ReorderShiftsInput = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export const shiftsAdminRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("facility_shifts")
      .select("id, name, start_time, end_time, position")
      .eq("facility_id", ctx.facilityId)
      .order("position", { ascending: true });
    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }
    return data ?? [];
  }),

  create: protectedProcedure
    .input(CreateShiftInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const { count } = await ctx.supabase
        .from("facility_shifts")
        .select("id", { count: "exact", head: true })
        .eq("facility_id", ctx.facilityId);
      const { data, error } = await ctx.supabase
        .from("facility_shifts")
        .insert({
          facility_id: ctx.facilityId,
          name: input.name,
          start_time: input.start_time,
          end_time: input.end_time,
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

  update: protectedProcedure
    .input(UpdateShiftInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const patch: Record<string, unknown> = {};
      if (input.name       !== undefined) patch.name       = input.name;
      if (input.start_time !== undefined) patch.start_time = input.start_time;
      if (input.end_time   !== undefined) patch.end_time   = input.end_time;
      if (Object.keys(patch).length === 0) return { ok: true as const };
      const { error } = await ctx.supabase
        .from("facility_shifts")
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

  delete: protectedProcedure
    .input(DeleteShiftInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const { error } = await ctx.supabase
        .from("facility_shifts")
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

  reorder: protectedProcedure
    .input(ReorderShiftsInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      for (let i = 0; i < input.ids.length; i++) {
        const id = input.ids[i]!;
        const { error } = await ctx.supabase
          .from("facility_shifts")
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
});
