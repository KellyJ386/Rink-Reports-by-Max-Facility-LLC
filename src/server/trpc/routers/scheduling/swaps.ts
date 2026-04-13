import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import {
  RequestSwapInput,
  ReviewSwapInput,
  CancelSwapInput,
} from "@/modules/scheduling/schema";
import { requireManager } from "./base";

/**
 * Shape of a swap request row from the database.
 */
interface SwapRequest {
  id: string;
  facility_id: string;
  requester_employee_id: string;
  requester_shift_id: string;
  target_shift_id: string | null;
  target_employee_id: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/**
 * Look up the scheduling_employees record for the current user.
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

export const swapRouter = router({
  /**
   * List shift swap requests.
   * Managers see all pending for the facility.
   * Staff sees only their own requests.
   */
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "approved", "denied", "cancelled"]).optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
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
        .from("shift_swap_requests" as never)
        .select("id, facility_id, requester_employee_id, requester_shift_id, target_shift_id, target_employee_id, status, reviewed_by, reviewed_at, created_at" as never)
        .eq("facility_id" as never, ctx.facilityId as never)
        .order("created_at" as never, { ascending: false } as never);

      if (!isManager) {
        const emp = await getOwnEmployee(ctx);
        query = query.eq("requester_employee_id" as never, emp.id as never);
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
      return (data ?? []) as unknown as SwapRequest[];
    }),

  /**
   * Create a shift swap request. The caller must own the requester_shift.
   */
  create: protectedProcedure
    .input(RequestSwapInput)
    .mutation(async ({ ctx, input }) => {
      const emp = await getOwnEmployee(ctx);

      // Verify the requester owns the shift
      const { data: shift } = await ctx.supabase
        .from("scheduling_shifts")
        .select("id, user_id")
        .eq("id", input.requester_shift_id)
        .maybeSingle();

      if (!shift) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Requester shift not found",
        });
      }

      // Verify the shift belongs to this employee's user_id
      const { data: empFull } = await ctx.supabase
        .from("scheduling_employees" as never)
        .select("id, user_id" as never)
        .eq("id" as never, emp.id as never)
        .maybeSingle();

      const empRow = empFull as unknown as { id: string; user_id: string } | null;
      if (!empRow || shift.user_id !== empRow.user_id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only request swaps for your own shifts",
        });
      }

      const row = {
        facility_id: ctx.facilityId,
        requester_employee_id: emp.id,
        requester_shift_id: input.requester_shift_id,
        target_shift_id: input.target_shift_id ?? null,
        target_employee_id: input.target_employee_id ?? null,
        status: "pending",
      };

      const { data, error } = await (
        ctx.supabase
          .from("shift_swap_requests" as never)
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
   * Review (approve/deny) a swap request. Manager only.
   * If approved, swap the user_id on the two shifts.
   */
  review: protectedProcedure
    .input(ReviewSwapInput)
    .mutation(async ({ ctx, input }) => {
      await requireManager(ctx);

      // Fetch the swap request
      const { data: swapData } = await ctx.supabase
        .from("shift_swap_requests" as never)
        .select("id, requester_shift_id, target_shift_id, status, facility_id" as never)
        .eq("id" as never, input.id as never)
        .eq("facility_id" as never, ctx.facilityId as never)
        .maybeSingle();

      const swap = swapData as unknown as {
        id: string;
        requester_shift_id: string;
        target_shift_id: string | null;
        status: string;
        facility_id: string;
      } | null;

      if (!swap) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Swap request not found",
        });
      }

      if (swap.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending swap requests can be reviewed",
        });
      }

      // If approved and there's a target shift, swap user_ids
      if (input.status === "approved" && swap.target_shift_id) {
        // Get both shifts
        const { data: requesterShift } = await ctx.supabase
          .from("scheduling_shifts")
          .select("id, user_id")
          .eq("id", swap.requester_shift_id)
          .maybeSingle();

        const { data: targetShift } = await ctx.supabase
          .from("scheduling_shifts")
          .select("id, user_id")
          .eq("id", swap.target_shift_id)
          .maybeSingle();

        if (requesterShift && targetShift) {
          // Swap user_ids
          await ctx.supabase
            .from("scheduling_shifts")
            .update({ user_id: targetShift.user_id })
            .eq("id", requesterShift.id);

          await ctx.supabase
            .from("scheduling_shifts")
            .update({ user_id: requesterShift.user_id })
            .eq("id", targetShift.id);
        }
      }

      // Update the swap request status
      const { error } = await ctx.supabase
        .from("shift_swap_requests" as never)
        .update({
          status: input.status,
          reviewed_by: ctx.user.id,
          reviewed_at: new Date().toISOString(),
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

  /**
   * Cancel a pending swap request. Only the requester can cancel.
   */
  cancel: protectedProcedure
    .input(CancelSwapInput)
    .mutation(async ({ ctx, input }) => {
      const emp = await getOwnEmployee(ctx);

      const { data: swapData } = await ctx.supabase
        .from("shift_swap_requests" as never)
        .select("id, requester_employee_id, status" as never)
        .eq("id" as never, input.id as never)
        .eq("facility_id" as never, ctx.facilityId as never)
        .maybeSingle();

      const swap = swapData as unknown as {
        id: string;
        requester_employee_id: string;
        status: string;
      } | null;

      if (!swap) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Swap request not found",
        });
      }
      if (swap.requester_employee_id !== emp.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only cancel your own swap requests",
        });
      }
      if (swap.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending swap requests can be cancelled",
        });
      }

      const { error } = await ctx.supabase
        .from("shift_swap_requests" as never)
        .update({ status: "cancelled" } as never)
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
