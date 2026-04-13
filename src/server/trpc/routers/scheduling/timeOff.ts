import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import {
  SubmitTimeOffInput,
  ReviewTimeOffInput,
  type TimeOffRequest,
} from "@/modules/scheduling/schema";
import { requireManager } from "./base";

/**
 * Look up the scheduling_employees record for the current user.
 * Throws NOT_FOUND if no employee record exists.
 */
async function getOwnEmployee(ctx: {
  user: { id: string };
  facilityId: string;
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/lib/database.types").Database
  >;
}): Promise<{ id: string }> {
  const { data, error } = await ctx.supabase
    .from("scheduling_employees" as never)
    .select("id" as never)
    .eq("facility_id" as never, ctx.facilityId as never)
    .eq("user_id" as never, ctx.user.id as never)
    .maybeSingle();

  if (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: (error as unknown as { message: string }).message,
    });
  }
  if (!data) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No employee record found for current user",
    });
  }
  return data as unknown as { id: string };
}

export const timeOffRouter = router({
  /**
   * List time-off requests.
   * Managers see all requests for the facility.
   * Staff sees only their own requests.
   */
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "approved", "denied"]).optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      // Check if the caller is a manager/admin
      const { data: profile } = await ctx.supabase
        .from("user_profiles")
        .select("role")
        .eq("user_id", ctx.user.id)
        .maybeSingle();

      const isManager =
        profile?.role === "admin" ||
        profile?.role === "super_admin" ||
        profile?.role === "manager";

      let query = ctx.supabase
        .from("time_off_requests" as never)
        .select("id, employee_id, facility_id, start_date, end_date, category, status, reason, admin_note, requested_at, reviewed_at, reviewed_by" as never)
        .eq("facility_id" as never, ctx.facilityId as never)
        .order("requested_at" as never, { ascending: false } as never);

      if (!isManager) {
        // Staff: filter to own employee record
        const emp = await getOwnEmployee(ctx);
        query = query.eq("employee_id" as never, emp.id as never);
      }

      if (input?.status) {
        query = query.eq("status" as never, input.status as never);
      }

      const { data, error } = await query;
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: (error as unknown as { message: string }).message,
        });
      }
      return (data ?? []) as unknown as TimeOffRequest[];
    }),

  /**
   * Submit a time-off request as the current user.
   */
  submit: protectedProcedure
    .input(SubmitTimeOffInput)
    .mutation(async ({ ctx, input }) => {
      const emp = await getOwnEmployee(ctx);

      const row = {
        employee_id: emp.id,
        facility_id: ctx.facilityId,
        start_date: input.start_date,
        end_date: input.end_date,
        category: input.category,
        status: "pending",
        reason: input.reason ?? null,
        admin_note: null,
        requested_at: new Date().toISOString(),
        reviewed_at: null,
        reviewed_by: null,
      };

      const { data, error } = await (
        ctx.supabase
          .from("time_off_requests" as never)
          .insert(row as never) as unknown as { select: (cols: string) => { single: () => Promise<{ data: unknown; error: unknown }> } }
      ).select("id").single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: (error as unknown as { message: string }).message,
        });
      }
      return data as unknown as { id: string };
    }),

  /**
   * Review (approve/deny) a time-off request. Manager only.
   */
  review: protectedProcedure
    .input(ReviewTimeOffInput)
    .mutation(async ({ ctx, input }) => {
      await requireManager(ctx);

      const patch = {
        status: input.status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: ctx.user.id,
        admin_note: input.admin_note ?? null,
      };

      const { error } = await ctx.supabase
        .from("time_off_requests" as never)
        .update(patch as never)
        .eq("id" as never, input.id as never)
        .eq("facility_id" as never, ctx.facilityId as never);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: (error as unknown as { message: string }).message,
        });
      }
      return { ok: true as const };
    }),

  /**
   * Cancel a pending time-off request. Only the requesting employee
   * can cancel, and only while the request is still pending.
   */
  cancel: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const emp = await getOwnEmployee(ctx);

      // Verify the request belongs to this employee and is pending
      const { data: request, error: fetchErr } = await ctx.supabase
        .from("time_off_requests" as never)
        .select("id, employee_id, status" as never)
        .eq("id" as never, input.id as never)
        .eq("facility_id" as never, ctx.facilityId as never)
        .maybeSingle();

      if (fetchErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: (fetchErr as unknown as { message: string }).message,
        });
      }

      const req = request as unknown as { id: string; employee_id: string; status: string } | null;
      if (!req) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Time-off request not found",
        });
      }
      if (req.employee_id !== emp.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only cancel your own requests",
        });
      }
      if (req.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending requests can be cancelled",
        });
      }

      const { error } = await ctx.supabase
        .from("time_off_requests" as never)
        .update({
          status: "denied",
          admin_note: "Cancelled by employee",
        } as never)
        .eq("id" as never, input.id as never);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: (error as unknown as { message: string }).message,
        });
      }
      return { ok: true as const };
    }),
});
