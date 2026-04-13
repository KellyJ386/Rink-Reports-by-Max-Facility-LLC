import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { MarkNotificationsReadInput, type SchedulingNotification } from "@/modules/scheduling/schema";

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

export const scheduleNotificationRouter = router({
  /**
   * List unread scheduling notifications for the current employee.
   * Limited to 50 most recent.
   */
  listUnread: protectedProcedure.query(async ({ ctx }) => {
    const emp = await getOwnEmployee(ctx);

    const { data, error } = await ctx.supabase
      .from("scheduling_notifications" as never)
      .select("id, employee_id, facility_id, event_type, message, payload, is_read, created_at" as never)
      .eq("employee_id" as never, emp.id as never)
      .eq("facility_id" as never, ctx.facilityId as never)
      .eq("is_read" as never, false as never)
      .order("created_at" as never, { ascending: false } as never)
      .limit(50);

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: (error as unknown as { message: string }).message,
      });
    }
    return (data ?? []) as unknown as SchedulingNotification[];
  }),

  /**
   * List all scheduling notifications for the current employee,
   * with pagination support.
   */
  listAll: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const emp = await getOwnEmployee(ctx);
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      const { data, error } = await ctx.supabase
        .from("scheduling_notifications" as never)
        .select("id, employee_id, facility_id, event_type, message, payload, is_read, created_at" as never)
        .eq("employee_id" as never, emp.id as never)
        .eq("facility_id" as never, ctx.facilityId as never)
        .order("created_at" as never, { ascending: false } as never)
        .range(offset, offset + limit - 1);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: (error as unknown as { message: string }).message,
        });
      }
      return (data ?? []) as unknown as SchedulingNotification[];
    }),

  /**
   * Mark specific notifications as read.
   * Only marks notifications belonging to the current employee.
   */
  markRead: protectedProcedure
    .input(MarkNotificationsReadInput)
    .mutation(async ({ ctx, input }) => {
      const emp = await getOwnEmployee(ctx);

      const { error } = await ctx.supabase
        .from("scheduling_notifications" as never)
        .update({ is_read: true } as never)
        .in("id" as never, input.ids as never)
        .eq("employee_id" as never, emp.id as never);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: (error as unknown as { message: string }).message,
        });
      }
      return { ok: true as const };
    }),

  /**
   * Mark all unread notifications as read for the current employee.
   */
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const emp = await getOwnEmployee(ctx);

    const { error } = await ctx.supabase
      .from("scheduling_notifications" as never)
      .update({ is_read: true } as never)
      .eq("employee_id" as never, emp.id as never)
      .eq("facility_id" as never, ctx.facilityId as never)
      .eq("is_read" as never, false as never);

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: (error as unknown as { message: string }).message,
      });
    }
    return { ok: true as const };
  }),
});
