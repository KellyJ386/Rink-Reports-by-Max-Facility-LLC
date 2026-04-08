import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import type { Json } from "@/lib/database.types";
import {
  AvailabilityBlockSchema,
  CreateShiftInput,
  DeleteShiftInput,
  SaveAvailabilityInput,
  ScheduleStatus,
  UpdateShiftInput,
  type AvailabilityBlock,
  type Schedule,
  type Shift,
} from "@/modules/scheduling/schema";
import {
  autoSuggestSchedule,
  type ShiftOpening,
} from "@/modules/scheduling/auto-suggest";
import { parseIcsToShifts } from "@/server/scheduling/importers/icsParser";
import { normalizeISportsman } from "@/server/scheduling/importers/adapters/iSportsmanAdapter";
import { normalizeMaxgalaxy } from "@/server/scheduling/importers/adapters/maxgalaxyAdapter";
import { normalizeActiveNetwork } from "@/server/scheduling/importers/adapters/activeNetworkAdapter";
import {
  matchStaff,
  type StaffMember,
  type StaffMatch,
} from "@/server/scheduling/importers/matchStaff";
import type { ParsedShift } from "@/server/scheduling/importers/types";

/**
 * Staff-facing + manager Scheduling sub-router. Mounted at the top
 * level as `scheduling`. Reads happen here; writes for shifts and
 * schedules also live here (gated by is_manager_or_admin both at
 * the DB and in the procedure body for clean error messages).
 */

function asBlocks(value: unknown): AvailabilityBlock[] {
  if (!Array.isArray(value)) return [];
  const out: AvailabilityBlock[] = [];
  for (const row of value) {
    const parsed = AvailabilityBlockSchema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

async function requireManager(ctx: {
  user: { id: string };
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/lib/database.types").Database
  >;
}): Promise<void> {
  const { data, error } = await ctx.supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: error.message,
    });
  }
  if (!data || (data.role !== "admin" && data.role !== "manager")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Manager or admin role required",
    });
  }
}

export const schedulingRouter = router({
  // -------------------------------------------------------------------
  // Roster: every user in this facility. RLS on user_profiles allows
  // facility-wide select for any authenticated member, so this works
  // for managers AND staff (the live board needs full names).
  // -------------------------------------------------------------------
  listRoster: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("user_profiles")
      .select("user_id, full_name, role")
      .eq("facility_id", ctx.facilityId)
      .order("full_name", { ascending: true });
    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }
    return data ?? [];
  }),

  // -------------------------------------------------------------------
  // Read: positions and certifications (staff need these for the
  // availability grid + live board legend).
  // -------------------------------------------------------------------
  listPositions: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("scheduling_positions")
      .select("id, facility_id, name, position, color")
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

  listCertifications: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("scheduling_certifications")
      .select("id, facility_id, name, position")
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

  // -------------------------------------------------------------------
  // Read: my own availability for a target week. Falls back to the
  // recurring template if no per-week override exists.
  // -------------------------------------------------------------------
  getMyAvailability: protectedProcedure
    .input(z.object({ week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      // Per-week override.
      const { data: override } = await ctx.supabase
        .from("scheduling_availability")
        .select("id, blocks, recurring, week_start")
        .eq("user_id", ctx.user.id)
        .eq("week_start", input.week_start)
        .maybeSingle();
      if (override) {
        return {
          source: "override" as const,
          blocks: asBlocks(override.blocks),
        };
      }
      // Recurring fallback.
      const { data: tmpl } = await ctx.supabase
        .from("scheduling_availability")
        .select("id, blocks, recurring")
        .eq("user_id", ctx.user.id)
        .eq("recurring", true)
        .maybeSingle();
      if (tmpl) {
        return { source: "recurring" as const, blocks: asBlocks(tmpl.blocks) };
      }
      return { source: "empty" as const, blocks: [] };
    }),

  saveMyAvailability: protectedProcedure
    .input(SaveAvailabilityInput)
    .mutation(async ({ ctx, input }) => {
      // Upsert. The DB has unique constraints on (recurring=true) and
      // on (user_id, week_start) so the same write path covers both.
      const row = {
        facility_id: ctx.facilityId,
        user_id: ctx.user.id,
        recurring: input.recurring,
        week_start: input.recurring ? null : input.week_start,
        blocks: input.blocks as unknown as Json,
      };

      // Find an existing row first (we can't use upsert without a
      // direct conflict target on a partial unique index).
      let existingId: string | null = null;
      if (input.recurring) {
        const { data } = await ctx.supabase
          .from("scheduling_availability")
          .select("id")
          .eq("user_id", ctx.user.id)
          .eq("recurring", true)
          .maybeSingle();
        existingId = data?.id ?? null;
      } else {
        const { data } = await ctx.supabase
          .from("scheduling_availability")
          .select("id")
          .eq("user_id", ctx.user.id)
          .eq("week_start", input.week_start!)
          .maybeSingle();
        existingId = data?.id ?? null;
      }

      if (existingId) {
        const { error } = await ctx.supabase
          .from("scheduling_availability")
          .update({
            blocks: row.blocks,
            recurring: row.recurring,
            week_start: row.week_start,
          })
          .eq("id", existingId);
        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }
      } else {
        const { error } = await ctx.supabase
          .from("scheduling_availability")
          .insert(row);
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
  // Read: availability for the entire roster (manager only — staff
  // can call but get only their own row back via RLS).
  // -------------------------------------------------------------------
  listFacilityAvailability: protectedProcedure
    .input(z.object({ week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("scheduling_availability")
        .select("user_id, blocks, recurring, week_start")
        .eq("facility_id", ctx.facilityId);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      // Resolve per-user: prefer per-week override, fall back to
      // recurring template.
      type Resolved = { user_id: string; blocks: AvailabilityBlock[] };
      const byUser = new Map<string, { override?: Resolved; recurring?: Resolved }>();
      for (const row of data ?? []) {
        const entry = byUser.get(row.user_id) ?? {};
        const r: Resolved = {
          user_id: row.user_id,
          blocks: asBlocks(row.blocks),
        };
        if (row.week_start === input.week_start) entry.override = r;
        else if (row.recurring) entry.recurring = r;
        byUser.set(row.user_id, entry);
      }
      const out: Resolved[] = [];
      for (const [, entry] of byUser) {
        if (entry.override) out.push(entry.override);
        else if (entry.recurring) out.push(entry.recurring);
      }
      return out;
    }),

  // -------------------------------------------------------------------
  // Schedules
  // -------------------------------------------------------------------
  getScheduleForWeek: protectedProcedure
    .input(z.object({ week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ ctx, input }): Promise<{
      schedule: Schedule | null;
      shifts: Shift[];
    }> => {
      const { data: schedule } = await ctx.supabase
        .from("scheduling_schedules")
        .select("id, facility_id, week_start, status, created_by, published_at")
        .eq("facility_id", ctx.facilityId)
        .eq("week_start", input.week_start)
        .maybeSingle();
      if (!schedule) return { schedule: null, shifts: [] };

      const parsedStatus = ScheduleStatus.safeParse(schedule.status);
      const typedSchedule: Schedule = {
        id: schedule.id,
        facility_id: schedule.facility_id,
        week_start: schedule.week_start,
        status: parsedStatus.success ? parsedStatus.data : "draft",
        created_by: schedule.created_by,
        published_at: schedule.published_at,
      };

      const { data: shifts } = await ctx.supabase
        .from("scheduling_shifts")
        .select("id, schedule_id, user_id, position_id, start_at, end_at, notes")
        .eq("schedule_id", schedule.id)
        .order("start_at", { ascending: true });

      return {
        schedule: typedSchedule,
        shifts: (shifts ?? []).map((s) => ({
          id: s.id,
          schedule_id: s.schedule_id,
          user_id: s.user_id,
          position_id: s.position_id,
          start_at: s.start_at,
          end_at: s.end_at,
          notes: s.notes,
        })),
      };
    }),

  ensureDraftSchedule: protectedProcedure
    .input(z.object({ week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .mutation(async ({ ctx, input }) => {
      await requireManager(ctx);
      const { data: existing } = await ctx.supabase
        .from("scheduling_schedules")
        .select("id, status")
        .eq("facility_id", ctx.facilityId)
        .eq("week_start", input.week_start)
        .maybeSingle();
      if (existing) return { id: existing.id, status: existing.status };

      const { data, error } = await ctx.supabase
        .from("scheduling_schedules")
        .insert({
          facility_id: ctx.facilityId,
          week_start: input.week_start,
          status: "draft",
          created_by: ctx.user.id,
        })
        .select("id, status")
        .single();
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { id: data.id, status: data.status };
    }),

  publishSchedule: protectedProcedure
    .input(z.object({ schedule_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireManager(ctx);
      const { error } = await ctx.supabase
        .from("scheduling_schedules")
        .update({ status: "published", published_at: new Date().toISOString() })
        .eq("id", input.schedule_id)
        .eq("facility_id", ctx.facilityId);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { ok: true as const };
    }),

  unpublishSchedule: protectedProcedure
    .input(z.object({ schedule_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireManager(ctx);
      const { error } = await ctx.supabase
        .from("scheduling_schedules")
        .update({ status: "draft", published_at: null })
        .eq("id", input.schedule_id)
        .eq("facility_id", ctx.facilityId);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { ok: true as const };
    }),

  // -------------------------------------------------------------------
  // Shifts
  // -------------------------------------------------------------------
  createShift: protectedProcedure
    .input(CreateShiftInput)
    .mutation(async ({ ctx, input }) => {
      await requireManager(ctx);
      const { data, error } = await ctx.supabase
        .from("scheduling_shifts")
        .insert({
          schedule_id: input.schedule_id,
          user_id: input.user_id,
          position_id: input.position_id,
          start_at: input.start_at,
          end_at: input.end_at,
          notes: input.notes ?? null,
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

  updateShift: protectedProcedure
    .input(UpdateShiftInput)
    .mutation(async ({ ctx, input }) => {
      await requireManager(ctx);
      const patch: Record<string, unknown> = {};
      if (input.user_id !== undefined) patch.user_id = input.user_id;
      if (input.position_id !== undefined) patch.position_id = input.position_id;
      if (input.start_at !== undefined) patch.start_at = input.start_at;
      if (input.end_at !== undefined) patch.end_at = input.end_at;
      if (input.notes !== undefined) patch.notes = input.notes;
      if (Object.keys(patch).length === 0) return { ok: true as const };
      const { error } = await ctx.supabase
        .from("scheduling_shifts")
        .update(patch)
        .eq("id", input.id);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { ok: true as const };
    }),

  deleteShift: protectedProcedure
    .input(DeleteShiftInput)
    .mutation(async ({ ctx, input }) => {
      await requireManager(ctx);
      const { error } = await ctx.supabase
        .from("scheduling_shifts")
        .delete()
        .eq("id", input.id);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { ok: true as const };
    }),

  // -------------------------------------------------------------------
  // Auto-suggest: take a list of openings and run the greedy
  // algorithm against the current roster + availability.
  // -------------------------------------------------------------------
  autoSuggest: protectedProcedure
    .input(
      z.object({
        week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        openings: z
          .array(
            z.object({
              position_id: z.string().uuid(),
              start_at: z.string().datetime(),
              end_at: z.string().datetime(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireManager(ctx);

      // Roster: every user_profile in this facility.
      const { data: roster, error: rosterErr } = await ctx.supabase
        .from("user_profiles")
        .select("user_id")
        .eq("facility_id", ctx.facilityId);
      if (rosterErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: rosterErr.message,
        });
      }

      // Position required certs.
      const { data: posCerts } = await ctx.supabase
        .from("scheduling_position_certifications")
        .select(
          "position_id, certification_id, scheduling_positions!inner(facility_id)",
        )
        .eq("scheduling_positions.facility_id", ctx.facilityId);
      const positionRequiredCerts = new Map<string, Set<string>>();
      for (const row of posCerts ?? []) {
        const set =
          positionRequiredCerts.get(row.position_id) ?? new Set<string>();
        set.add(row.certification_id);
        positionRequiredCerts.set(row.position_id, set);
      }

      // Staff certs.
      const { data: staffCerts } = await ctx.supabase
        .from("scheduling_staff_certifications")
        .select(
          "user_id, certification_id, scheduling_certifications!inner(facility_id)",
        )
        .eq("scheduling_certifications.facility_id", ctx.facilityId);
      const certsByUser = new Map<string, Set<string>>();
      for (const row of staffCerts ?? []) {
        const set = certsByUser.get(row.user_id) ?? new Set<string>();
        set.add(row.certification_id);
        certsByUser.set(row.user_id, set);
      }

      // Availability for the target week.
      const { data: avail } = await ctx.supabase
        .from("scheduling_availability")
        .select("user_id, blocks, recurring, week_start")
        .eq("facility_id", ctx.facilityId);
      const availByUser = new Map<string, AvailabilityBlock[]>();
      const overrideByUser = new Set<string>();
      // First pass: per-week overrides take priority.
      for (const row of avail ?? []) {
        if (row.week_start === input.week_start) {
          availByUser.set(row.user_id, asBlocks(row.blocks));
          overrideByUser.add(row.user_id);
        }
      }
      // Second pass: fall back to recurring templates.
      for (const row of avail ?? []) {
        if (row.recurring && !overrideByUser.has(row.user_id)) {
          availByUser.set(row.user_id, asBlocks(row.blocks));
        }
      }

      const weekStart = new Date(`${input.week_start}T00:00:00`);
      const openings: ShiftOpening[] = input.openings.map((o) => ({
        position_id: o.position_id,
        start_at: new Date(o.start_at),
        end_at: new Date(o.end_at),
      }));

      const suggestions = autoSuggestSchedule({
        openings,
        staff: (roster ?? []).map((r) => ({
          user_id: r.user_id,
          certification_ids: certsByUser.get(r.user_id) ?? new Set(),
        })),
        positionRequiredCerts,
        availability: availByUser,
        weekStart,
      });

      return suggestions.map((s) => ({
        position_id: s.opening.position_id,
        start_at: s.opening.start_at.toISOString(),
        end_at: s.opening.end_at.toISOString(),
        assigned_user_id: s.assigned_user_id,
        conflict_reason: s.conflict_reason,
      }));
    }),

  // -------------------------------------------------------------------
  // Import: preview + commit
  // -------------------------------------------------------------------
  previewImport: protectedProcedure
    .input(
      z.object({
        content: z.string().min(1),
        format: z.enum(["ics", "isportsman", "maxgalaxy", "active_network"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.facilityId) throw new TRPCError({ code: "FORBIDDEN" });
      await requireManager(ctx);

      // 1. Route to the right parser/adapter
      let shifts: ParsedShift[];
      if (input.format === "ics") {
        shifts = parseIcsToShifts(input.content);
      } else if (input.format === "isportsman") {
        shifts = parseIcsToShifts(normalizeISportsman(input.content));
      } else if (input.format === "maxgalaxy") {
        shifts = normalizeMaxgalaxy(input.content);
      } else {
        shifts = normalizeActiveNetwork(input.content);
      }

      // 2. Fetch roster for this facility (users with any role, for matching)
      const { data: rosterData, error: rosterErr } = await ctx.supabase
        .from("user_profiles")
        .select("user_id, full_name, email")
        .eq("facility_id", ctx.facilityId)
        .neq("role", "viewer");
      if (rosterErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: rosterErr.message,
        });
      }
      const roster: StaffMember[] = (rosterData ?? []).map((r) => ({
        id: r.user_id,
        name: r.full_name ?? "",
        email: r.email ?? null,
      }));

      // 3. Match staff for each shift
      const staffMatchesWithIndex: Array<StaffMatch & { shiftIndex: number }> =
        [];
      for (let i = 0; i < shifts.length; i++) {
        const shift = shifts[i]!;
        // Use first attendee email if available, otherwise shift title for identifier
        const identifier =
          shift.attendees.length > 0 ? shift.attendees[0]! : shift.title;
        const match = matchStaff(identifier, roster);
        staffMatchesWithIndex.push({ ...match, shiftIndex: i });
      }

      // 4. Check for overlaps with existing shifts for this facility
      const { data: scheduleIds } = await ctx.supabase
        .from("scheduling_schedules")
        .select("id")
        .eq("facility_id", ctx.facilityId);

      const ids = (scheduleIds ?? []).map((s) => s.id);

      type ConflictEntry = {
        shift: ParsedShift;
        conflictsWith: { id: string; startAt: string; endAt: string };
      };
      const conflicts: ConflictEntry[] = [];

      if (ids.length > 0) {
        for (const shift of shifts) {
          const { data: overlapping } = await ctx.supabase
            .from("scheduling_shifts")
            .select("id, start_at, end_at")
            .in("schedule_id", ids)
            .lt("start_at", shift.endAt.toISOString())
            .gt("end_at", shift.startAt.toISOString());
          for (const existing of overlapping ?? []) {
            conflicts.push({
              shift,
              conflictsWith: {
                id: existing.id,
                startAt: existing.start_at,
                endAt: existing.end_at,
              },
            });
          }
        }
      }

      // 5. Collect unmatched staff identifiers
      const unmatchedStaff = staffMatchesWithIndex
        .filter((m) => m.matched === null && m.parsed)
        .map((m) => m.parsed);

      return {
        shifts,
        staffMatches: staffMatchesWithIndex,
        conflicts,
        unmatchedStaff: [...new Set(unmatchedStaff)],
      };
    }),

  commitImport: protectedProcedure
    .input(
      z.object({
        shifts: z.array(
          z.object({
            externalId: z.string(),
            title: z.string(),
            startAt: z.string().datetime(),
            endAt: z.string().datetime(),
            location: z.string().nullable().optional(),
            staffId: z.string().uuid().nullable(),
            scheduleId: z.string().uuid(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.facilityId) throw new TRPCError({ code: "FORBIDDEN" });
      await requireManager(ctx);

      let imported = 0;
      let skipped = 0;

      for (const shift of input.shifts) {
        // Skip shifts without a matched staff member
        if (!shift.staffId) {
          skipped++;
          continue;
        }

        // Verify the scheduleId belongs to this facility
        const { data: schedule } = await ctx.supabase
          .from("scheduling_schedules")
          .select("id")
          .eq("id", shift.scheduleId)
          .eq("facility_id", ctx.facilityId)
          .maybeSingle();

        if (!schedule) {
          skipped++;
          continue;
        }

        // We need a position_id — use a placeholder approach: the first
        // position for this facility. If no positions exist, skip.
        const { data: firstPosition } = await ctx.supabase
          .from("scheduling_positions")
          .select("id")
          .eq("facility_id", ctx.facilityId)
          .order("position", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!firstPosition) {
          skipped++;
          continue;
        }

        const { error } = await ctx.supabase
          .from("scheduling_shifts")
          .insert({
            schedule_id: shift.scheduleId,
            user_id: shift.staffId,
            position_id: firstPosition.id,
            start_at: shift.startAt,
            end_at: shift.endAt,
            notes: shift.location ?? null,
          });

        if (error) {
          skipped++;
        } else {
          imported++;
        }
      }

      return { imported, skipped };
    }),
});
