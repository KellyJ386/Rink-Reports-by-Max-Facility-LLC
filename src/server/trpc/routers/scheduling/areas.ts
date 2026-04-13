import "server-only";

import { TRPCError } from "@trpc/server";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { requireAdmin } from "@/server/trpc/routers/admin";
import {
  CreateAreaInput,
  UpdateAreaInput,
  DeleteAreaInput,
  ReorderAreasInput,
  type SchedulingArea,
} from "@/modules/scheduling/schema";

export const areaRouter = router({
  /**
   * List all scheduling areas for the facility, ordered by display_order.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("scheduling_areas" as never)
      .select("id, facility_id, name, display_order, is_active" as never)
      .eq("facility_id" as never, ctx.facilityId as never)
      .order("display_order" as never, { ascending: true } as never);

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: (error as unknown as { message: string }).message,
      });
    }
    return (data ?? []) as unknown as SchedulingArea[];
  }),

  /**
   * Create a new scheduling area. Admin only.
   * display_order is auto-incremented by counting existing rows.
   */
  create: protectedProcedure
    .input(CreateAreaInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      // Count existing areas for display_order
      const { data: existing } = await ctx.supabase
        .from("scheduling_areas" as never)
        .select("id" as never)
        .eq("facility_id" as never, ctx.facilityId as never);

      const nextOrder = (existing ?? []).length;

      const row = {
        facility_id: ctx.facilityId,
        name: input.name,
        display_order: nextOrder,
        is_active: true,
      };

      const { data, error } = await (
        ctx.supabase
          .from("scheduling_areas" as never)
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
   * Update a scheduling area. Admin only.
   * Only provided fields are patched.
   */
  update: protectedProcedure
    .input(UpdateAreaInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.is_active !== undefined) patch.is_active = input.is_active;

      if (Object.keys(patch).length === 0) return { ok: true as const };

      const { error } = await ctx.supabase
        .from("scheduling_areas" as never)
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
   * Delete a scheduling area. Admin only.
   * If the area has FK references (shifts), the delete will fail
   * and the error is surfaced to the client.
   */
  delete: protectedProcedure
    .input(DeleteAreaInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      const { error } = await ctx.supabase
        .from("scheduling_areas" as never)
        .delete()
        .eq("id" as never, input.id as never)
        .eq("facility_id" as never, ctx.facilityId as never);

      if (error) {
        const msg = (error as unknown as { message: string }).message;
        // Foreign-key constraint violation — area is still referenced
        if (msg.includes("violates foreign key constraint")) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Cannot delete area — it is referenced by existing shifts. Deactivate it instead.",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: msg,
        });
      }
      return { ok: true as const };
    }),

  /**
   * Reorder scheduling areas. Admin only.
   * Accepts an ordered array of area IDs and updates display_order
   * to match the array index.
   */
  reorder: protectedProcedure
    .input(ReorderAreasInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      for (let i = 0; i < input.ids.length; i++) {
        const id = input.ids[i]!;
        const { error } = await ctx.supabase
          .from("scheduling_areas" as never)
          .update({ display_order: i } as never)
          .eq("id" as never, id as never)
          .eq("facility_id" as never, ctx.facilityId as never);

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
