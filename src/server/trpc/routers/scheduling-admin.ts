import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { requireAdmin } from "@/server/trpc/routers/admin";
import {
  CreateCertificationInput,
  CreatePositionInput,
  DeleteCertificationInput,
  DeletePositionInput,
  SetPositionCertsInput,
  SetStaffCertsInput,
  UpdatePositionInput,
  type Certification,
  type Position,
} from "@/modules/scheduling/schema";

/**
 * Admin sub-router for the Scheduling module. Mounted at
 * `admin.scheduling`. Manages positions, certifications, the
 * position→cert and user→cert junctions.
 */
export const schedulingAdminRouter = router({
  // -------------------------------------------------------------------
  // Positions
  // -------------------------------------------------------------------
  listPositions: protectedProcedure.query(
    async ({ ctx }): Promise<Position[]> => {
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
    },
  ),

  createPosition: protectedProcedure
    .input(CreatePositionInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const { count } = await ctx.supabase
        .from("scheduling_positions")
        .select("id", { count: "exact", head: true })
        .eq("facility_id", ctx.facilityId);
      const { data, error } = await ctx.supabase
        .from("scheduling_positions")
        .insert({
          facility_id: ctx.facilityId,
          name: input.name,
          color: input.color,
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

  updatePosition: protectedProcedure
    .input(UpdatePositionInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.color !== undefined) patch.color = input.color;
      if (Object.keys(patch).length === 0) return { ok: true as const };
      const { error } = await ctx.supabase
        .from("scheduling_positions")
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

  deletePosition: protectedProcedure
    .input(DeletePositionInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const { error } = await ctx.supabase
        .from("scheduling_positions")
        .delete()
        .eq("id", input.id)
        .eq("facility_id", ctx.facilityId);
      if (error) {
        const msg = /foreign key/i.test(error.message)
          ? "This position has shifts assigned and cannot be deleted."
          : error.message;
        throw new TRPCError({ code: "CONFLICT", message: msg });
      }
      return { ok: true as const };
    }),

  // -------------------------------------------------------------------
  // Certifications
  // -------------------------------------------------------------------
  listCertifications: protectedProcedure.query(
    async ({ ctx }): Promise<Certification[]> => {
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
    },
  ),

  createCertification: protectedProcedure
    .input(CreateCertificationInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const { count } = await ctx.supabase
        .from("scheduling_certifications")
        .select("id", { count: "exact", head: true })
        .eq("facility_id", ctx.facilityId);
      const { data, error } = await ctx.supabase
        .from("scheduling_certifications")
        .insert({
          facility_id: ctx.facilityId,
          name: input.name,
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

  deleteCertification: protectedProcedure
    .input(DeleteCertificationInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const { error } = await ctx.supabase
        .from("scheduling_certifications")
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

  // -------------------------------------------------------------------
  // Position → required certs (junction)
  // -------------------------------------------------------------------
  listPositionCerts: protectedProcedure.query(async ({ ctx }) => {
    // Pull every junction row whose position belongs to this facility.
    const { data, error } = await ctx.supabase
      .from("scheduling_position_certifications")
      .select(
        "position_id, certification_id, scheduling_positions!inner(facility_id)",
      )
      .eq("scheduling_positions.facility_id", ctx.facilityId);
    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }
    return (data ?? []).map((row) => ({
      position_id: row.position_id,
      certification_id: row.certification_id,
    }));
  }),

  setPositionCerts: protectedProcedure
    .input(SetPositionCertsInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      // Verify the target position belongs to this facility.
      const { data: pos, error: posErr } = await ctx.supabase
        .from("scheduling_positions")
        .select("id")
        .eq("id", input.position_id)
        .eq("facility_id", ctx.facilityId)
        .maybeSingle();
      if (posErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: posErr.message,
        });
      }
      if (!pos) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Position not found",
        });
      }

      // Replace the row set: delete existing, then insert new.
      const { error: delErr } = await ctx.supabase
        .from("scheduling_position_certifications")
        .delete()
        .eq("position_id", input.position_id);
      if (delErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: delErr.message,
        });
      }
      if (input.certification_ids.length > 0) {
        const rows = input.certification_ids.map((cid) => ({
          position_id: input.position_id,
          certification_id: cid,
        }));
        const { error: insErr } = await ctx.supabase
          .from("scheduling_position_certifications")
          .insert(rows);
        if (insErr) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: insErr.message,
          });
        }
      }
      return { ok: true as const };
    }),

  // -------------------------------------------------------------------
  // Staff → granted certs (junction)
  // -------------------------------------------------------------------
  listStaffCerts: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("scheduling_staff_certifications")
      .select(
        "user_id, certification_id, scheduling_certifications!inner(facility_id)",
      )
      .eq("scheduling_certifications.facility_id", ctx.facilityId);
    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }
    return (data ?? []).map((row) => ({
      user_id: row.user_id,
      certification_id: row.certification_id,
    }));
  }),

  setStaffCerts: protectedProcedure
    .input(SetStaffCertsInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      // Restrict the cert ids to ones that belong to this facility.
      const { data: validCerts, error: certsErr } = await ctx.supabase
        .from("scheduling_certifications")
        .select("id")
        .eq("facility_id", ctx.facilityId)
        .in("id", input.certification_ids);
      if (certsErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: certsErr.message,
        });
      }
      const validIds = new Set((validCerts ?? []).map((c) => c.id));
      const filtered = input.certification_ids.filter((id) => validIds.has(id));

      // Delete existing rows for this user that belong to this facility.
      // We can't directly join in DELETE, so first list facility cert ids
      // and delete by user_id + certification_id IN (...).
      const { data: allFacilityCerts, error: allErr } = await ctx.supabase
        .from("scheduling_certifications")
        .select("id")
        .eq("facility_id", ctx.facilityId);
      if (allErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: allErr.message,
        });
      }
      const allFacilityCertIds = (allFacilityCerts ?? []).map((c) => c.id);
      if (allFacilityCertIds.length > 0) {
        const { error: delErr } = await ctx.supabase
          .from("scheduling_staff_certifications")
          .delete()
          .eq("user_id", input.user_id)
          .in("certification_id", allFacilityCertIds);
        if (delErr) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: delErr.message,
          });
        }
      }

      if (filtered.length > 0) {
        const rows = filtered.map((cid) => ({
          user_id: input.user_id,
          certification_id: cid,
        }));
        const { error: insErr } = await ctx.supabase
          .from("scheduling_staff_certifications")
          .insert(rows);
        if (insErr) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: insErr.message,
          });
        }
      }
      return { ok: true as const };
    }),
});

export { z };
