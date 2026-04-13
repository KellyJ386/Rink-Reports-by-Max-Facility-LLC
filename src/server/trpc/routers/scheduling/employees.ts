import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { requireAdmin } from "@/server/trpc/routers/admin";
import {
  CreateEmployeeInput,
  UpdateEmployeeInput,
  type SchedulingEmployee,
} from "@/modules/scheduling/schema";

export const employeeRouter = router({
  /**
   * List scheduling employees for the facility.
   * Optionally filter by is_active.
   */
  list: protectedProcedure
    .input(z.object({ is_active: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("scheduling_employees" as never)
        .select("id, facility_id, user_id, name, email, phone, employment_type, home_area_id, hire_date, is_active, max_hours_week, min_hours_week" as never)
        .eq("facility_id" as never, ctx.facilityId as never);

      if (input?.is_active !== undefined) {
        query = query.eq("is_active" as never, input.is_active as never);
      }

      const { data, error } = await query.order("name" as never, { ascending: true } as never);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: (error as unknown as { message: string }).message,
        });
      }
      return (data ?? []) as unknown as SchedulingEmployee[];
    }),

  /**
   * Get a single scheduling employee by ID. Facility guard ensures
   * the caller can only see employees in their own facility.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("scheduling_employees" as never)
        .select("id, facility_id, user_id, name, email, phone, employment_type, home_area_id, hire_date, is_active, max_hours_week, min_hours_week" as never)
        .eq("id" as never, input.id as never)
        .eq("facility_id" as never, ctx.facilityId as never)
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
          message: "Employee not found",
        });
      }
      return data as unknown as SchedulingEmployee;
    }),

  /**
   * Create a new scheduling employee. Admin only.
   * facility_id is injected from ctx.
   */
  create: protectedProcedure
    .input(CreateEmployeeInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      const row = {
        facility_id: ctx.facilityId,
        user_id: input.user_id,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        employment_type: input.employment_type,
        home_area_id: input.home_area_id ?? null,
        hire_date: input.hire_date ?? null,
        is_active: true,
        max_hours_week: input.max_hours_week ?? null,
        min_hours_week: input.min_hours_week ?? null,
      };

      const { data, error } = await (
        ctx.supabase
          .from("scheduling_employees" as never)
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
   * Update a scheduling employee. Admin only.
   * Only provided fields are patched.
   */
  update: protectedProcedure
    .input(UpdateEmployeeInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.email !== undefined) patch.email = input.email;
      if (input.phone !== undefined) patch.phone = input.phone;
      if (input.employment_type !== undefined) patch.employment_type = input.employment_type;
      if (input.home_area_id !== undefined) patch.home_area_id = input.home_area_id;
      if (input.hire_date !== undefined) patch.hire_date = input.hire_date;
      if (input.is_active !== undefined) patch.is_active = input.is_active;
      if (input.max_hours_week !== undefined) patch.max_hours_week = input.max_hours_week;
      if (input.min_hours_week !== undefined) patch.min_hours_week = input.min_hours_week;

      if (Object.keys(patch).length === 0) return { ok: true as const };

      const { error } = await ctx.supabase
        .from("scheduling_employees" as never)
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
   * Deactivate a scheduling employee. Admin only.
   * Soft-deletes by setting is_active=false.
   */
  deactivate: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      const { error } = await ctx.supabase
        .from("scheduling_employees" as never)
        .update({ is_active: false } as never)
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
});
