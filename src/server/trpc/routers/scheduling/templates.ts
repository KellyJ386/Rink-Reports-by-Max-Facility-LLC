import "server-only";

import { TRPCError } from "@trpc/server";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import {
  CreateTemplateInput,
  LoadTemplateInput,
  DeleteTemplateInput,
  type SchedulingTemplate,
} from "@/modules/scheduling/schema";
import { requireManager } from "./base";

/**
 * Shape of a template shift row stored in scheduling_template_shifts.
 * Not yet in the generated DB types, so we define it here.
 */
interface TemplateShiftRow {
  id: string;
  template_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  position_id: string | null;
  area_id: string | null;
  notes: string | null;
}

export const templateRouter = router({
  /**
   * List all scheduling templates for the facility.
   * Manager or admin only.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    await requireManager(ctx);

    const { data, error } = await ctx.supabase
      .from("scheduling_templates" as never)
      .select("id, facility_id, name, created_by, created_at" as never)
      .eq("facility_id" as never, ctx.facilityId as never)
      .order("created_at" as never, { ascending: false } as never);

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: (error as unknown as { message: string }).message,
      });
    }
    return (data ?? []) as unknown as SchedulingTemplate[];
  }),

  /**
   * Save the current week's schedule as a reusable template.
   * Reads the schedule + shifts for the given week, then creates a
   * template row and template_shifts rows.
   */
  save: protectedProcedure
    .input(CreateTemplateInput)
    .mutation(async ({ ctx, input }) => {
      await requireManager(ctx);

      // 1. Find the schedule for the given week
      const { data: schedule } = await ctx.supabase
        .from("scheduling_schedules")
        .select("id")
        .eq("facility_id", ctx.facilityId)
        .eq("week_start", input.week_start)
        .maybeSingle();

      if (!schedule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No schedule exists for this week",
        });
      }

      // 2. Get all shifts for the schedule
      const { data: shifts, error: shiftsErr } = await ctx.supabase
        .from("scheduling_shifts")
        .select("id, position_id, start_at, end_at, notes, area_id")
        .eq("schedule_id", schedule.id);

      if (shiftsErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: shiftsErr.message,
        });
      }

      if (!shifts || shifts.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No shifts to save as template",
        });
      }

      // 3. Create the template row
      const { data: tmpl, error: tmplErr } = await (
        ctx.supabase
          .from("scheduling_templates" as never)
          .insert({
            facility_id: ctx.facilityId,
            name: input.name,
            created_by: ctx.user.id,
          } as never) as unknown as { select: (cols: string) => { single: () => Promise<{ data: unknown; error: unknown }> } }
      ).select("id").single();

      if (tmplErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: (tmplErr as unknown as { message: string }).message,
        });
      }

      const templateId = (tmpl as unknown as { id: string }).id;

      // 4. For each shift, extract day_of_week + start_time/end_time and insert template_shifts
      const weekStartDate = new Date(`${input.week_start}T00:00:00Z`);

      for (const shift of shifts) {
        const shiftStart = new Date(shift.start_at);
        const shiftEnd = new Date(shift.end_at);

        // day_of_week: 0=Monday in our schema
        const jsDay = shiftStart.getUTCDay(); // 0=Sunday
        const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;

        // Extract time-of-day as HH:MM
        const startTime = `${String(shiftStart.getUTCHours()).padStart(2, "0")}:${String(shiftStart.getUTCMinutes()).padStart(2, "0")}`;
        const endTime = `${String(shiftEnd.getUTCHours()).padStart(2, "0")}:${String(shiftEnd.getUTCMinutes()).padStart(2, "0")}`;

        const raw = shift as unknown as Record<string, unknown>;
        const { error: shiftInsertErr } = await ctx.supabase
          .from("scheduling_template_shifts" as never)
          .insert({
            template_id: templateId,
            day_of_week: dayOfWeek,
            start_time: startTime,
            end_time: endTime,
            position_id: shift.position_id,
            area_id: (raw.area_id as string | null) ?? null,
            notes: shift.notes,
          } as never);

        if (shiftInsertErr) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: (shiftInsertErr as unknown as { message: string }).message,
          });
        }
      }

      return { id: templateId };
    }),

  /**
   * Load a template into a week. Creates concrete shifts from the
   * template's template_shifts. Ensures a draft schedule exists first.
   */
  load: protectedProcedure
    .input(LoadTemplateInput)
    .mutation(async ({ ctx, input }) => {
      await requireManager(ctx);

      // 1. Read template shifts
      const { data: templateShifts, error: tsErr } = await ctx.supabase
        .from("scheduling_template_shifts" as never)
        .select("id, template_id, day_of_week, start_time, end_time, position_id, area_id, notes" as never)
        .eq("template_id" as never, input.template_id as never);

      if (tsErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: (tsErr as unknown as { message: string }).message,
        });
      }

      const shifts = (templateShifts ?? []) as unknown as TemplateShiftRow[];
      if (shifts.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Template has no shifts",
        });
      }

      // Verify the template belongs to this facility
      const { data: tmpl } = await ctx.supabase
        .from("scheduling_templates" as never)
        .select("id, facility_id" as never)
        .eq("id" as never, input.template_id as never)
        .maybeSingle();

      const tmplRow = tmpl as unknown as { id: string; facility_id: string } | null;
      if (!tmplRow || tmplRow.facility_id !== ctx.facilityId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }

      // 2. Ensure a draft schedule for the target week
      const { data: existing } = await ctx.supabase
        .from("scheduling_schedules")
        .select("id, status")
        .eq("facility_id", ctx.facilityId)
        .eq("week_start", input.week_start)
        .maybeSingle();

      let scheduleId: string;
      if (existing) {
        scheduleId = existing.id;
      } else {
        const { data: newSched, error: schedErr } = await ctx.supabase
          .from("scheduling_schedules")
          .insert({
            facility_id: ctx.facilityId,
            week_start: input.week_start,
            status: "draft",
            created_by: ctx.user.id,
          })
          .select("id")
          .single();
        if (schedErr) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: schedErr.message,
          });
        }
        scheduleId = newSched.id;
      }

      // 3. Create concrete shifts from template
      const weekStartDate = new Date(`${input.week_start}T00:00:00Z`);
      let created = 0;

      for (const ts of shifts) {
        // Calculate the concrete date for this day_of_week
        const shiftDate = new Date(weekStartDate);
        shiftDate.setUTCDate(shiftDate.getUTCDate() + ts.day_of_week);

        const [startHour, startMin] = ts.start_time.split(":").map(Number);
        const [endHour, endMin] = ts.end_time.split(":").map(Number);

        const startAt = new Date(shiftDate);
        startAt.setUTCHours(startHour ?? 0, startMin ?? 0, 0, 0);

        const endAt = new Date(shiftDate);
        endAt.setUTCHours(endHour ?? 0, endMin ?? 0, 0, 0);

        // If end is before start, it wraps to next day
        if (endAt <= startAt) {
          endAt.setUTCDate(endAt.getUTCDate() + 1);
        }

        const { error: insertErr } = await ctx.supabase
          .from("scheduling_shifts")
          .insert({
            schedule_id: scheduleId,
            user_id: null,
            position_id: ts.position_id,
            area_id: ts.area_id ?? null,
            start_at: startAt.toISOString(),
            end_at: endAt.toISOString(),
            notes: ts.notes,
          } as never);

        if (!insertErr) {
          created++;
        }
      }

      return { schedule_id: scheduleId, created };
    }),

  /**
   * Delete a template. Manager only.
   * CASCADE on scheduling_template_shifts handles child rows.
   */
  delete: protectedProcedure
    .input(DeleteTemplateInput)
    .mutation(async ({ ctx, input }) => {
      await requireManager(ctx);

      // Verify facility ownership
      const { data: tmpl } = await ctx.supabase
        .from("scheduling_templates" as never)
        .select("id, facility_id" as never)
        .eq("id" as never, input.id as never)
        .maybeSingle();

      const tmplRow = tmpl as unknown as { id: string; facility_id: string } | null;
      if (!tmplRow || tmplRow.facility_id !== ctx.facilityId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }

      const { error } = await ctx.supabase
        .from("scheduling_templates" as never)
        .delete()
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
