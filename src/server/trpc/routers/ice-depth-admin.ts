import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { requireAdmin } from "@/server/trpc/routers/admin";
import type { Json } from "@/lib/database.types";
import {
  CreateTemplateInput,
  DeleteTemplateInput,
  MAX_TEMPLATES_PER_FACILITY,
  ReorderTemplatesInput,
  UpdateTemplateInput,
  toPoints,
  type Template,
} from "@/modules/ice-depth/schema";

/**
 * Admin sub-router for the Ice Depth module. Mounted at
 * `admin.iceDepth`. Manages the up-to-8 measurement templates per
 * facility, including their (x, y) point lists.
 *
 * Templates can be partially updated — sending just `points` updates
 * the points without touching the name/unit, sending just `name`
 * renames in place, etc.
 */
export const iceDepthAdminRouter = router({
  // -------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------
  listTemplates: protectedProcedure.query(
    async ({ ctx }): Promise<Template[]> => {
      const { data, error } = await ctx.supabase
        .from("ice_depth_templates")
        .select("id, facility_id, name, position, unit, points")
        .eq("facility_id", ctx.facilityId)
        .order("position", { ascending: true });
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return (data ?? []).map((row) => ({
        id: row.id,
        facility_id: row.facility_id,
        name: row.name,
        position: row.position,
        unit: row.unit === "mm" ? "mm" : "in",
        points: toPoints(row.points),
      }));
    },
  ),

  // -------------------------------------------------------------------
  // Create — soft caps at 8 templates per facility.
  // -------------------------------------------------------------------
  createTemplate: protectedProcedure
    .input(CreateTemplateInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      const { count, error: countErr } = await ctx.supabase
        .from("ice_depth_templates")
        .select("id", { count: "exact", head: true })
        .eq("facility_id", ctx.facilityId);
      if (countErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: countErr.message,
        });
      }
      if ((count ?? 0) >= MAX_TEMPLATES_PER_FACILITY) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Maximum of ${MAX_TEMPLATES_PER_FACILITY} templates per facility`,
        });
      }

      const { data, error } = await ctx.supabase
        .from("ice_depth_templates")
        .insert({
          facility_id: ctx.facilityId,
          name: input.name,
          unit: input.unit,
          position: count ?? 0,
          points: [] as unknown as Json,
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

  updateTemplate: protectedProcedure
    .input(UpdateTemplateInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.unit !== undefined) patch.unit = input.unit;
      if (input.points !== undefined) {
        patch.points = input.points as unknown as Json;
      }
      if (Object.keys(patch).length === 0) return { ok: true as const };

      const { error } = await ctx.supabase
        .from("ice_depth_templates")
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

  deleteTemplate: protectedProcedure
    .input(DeleteTemplateInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const { error } = await ctx.supabase
        .from("ice_depth_templates")
        .delete()
        .eq("id", input.id)
        .eq("facility_id", ctx.facilityId);
      if (error) {
        const msg = /foreign key/i.test(error.message)
          ? "This template has logged sessions and cannot be deleted."
          : error.message;
        throw new TRPCError({ code: "CONFLICT", message: msg });
      }
      return { ok: true as const };
    }),

  reorderTemplates: protectedProcedure
    .input(ReorderTemplatesInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      for (let i = 0; i < input.ids.length; i++) {
        const id = input.ids[i]!;
        const { error } = await ctx.supabase
          .from("ice_depth_templates")
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

  // Re-export max constants for the admin UI to use without re-defining.
  _z: protectedProcedure.query(() => ({
    MAX_TEMPLATES_PER_FACILITY,
  })),
});

export { z };
