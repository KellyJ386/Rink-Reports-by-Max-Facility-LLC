import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { requireAdmin } from "@/server/trpc/routers/admin";
import {
  CreateChecklistInput,
  CreateItemInput,
  DeleteChecklistInput,
  DeleteItemInput,
  ReorderChecklistsInput,
  ReorderItemsInput,
  UpdateChecklistInput,
  UpdateItemInput,
  toChecklistItem,
  type Checklist,
} from "@/modules/daily-reports/schema";

/**
 * Admin sub-router for the Daily Reports module.
 * Mounted under adminRouter as `admin.dailyReports`.
 *
 * All procedures:
 *   - Go through protectedProcedure (requires authenticated user
 *     with a resolved facility_id in ctx)
 *   - Call requireAdmin() before writes (for clean error messages;
 *     RLS at the DB also gates these)
 *   - Never accept facility_id as input (CLAUDE.md Rule 1)
 *
 * Reads are scoped via Postgres RLS to the caller's facility.
 */

export const dailyReportsAdminRouter = router({
  // -------------------------------------------------------------------
  // Read: all checklists for the caller's facility, with items nested
  // -------------------------------------------------------------------
  listChecklists: protectedProcedure.query(async ({ ctx }): Promise<Checklist[]> => {
    const { data, error } = await ctx.supabase
      .from("daily_report_checklists")
      .select(
        "id, facility_id, name, position, items:daily_report_items(id, checklist_id, position, label, type, required, options)",
      )
      .eq("facility_id", ctx.facilityId)
      .order("position", { ascending: true })
      .order("position", {
        ascending: true,
        referencedTable: "daily_report_items",
      });

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
      items: (row.items ?? []).map(toChecklistItem),
    }));
  }),

  // -------------------------------------------------------------------
  // Checklist mutations
  // -------------------------------------------------------------------
  createChecklist: protectedProcedure
    .input(CreateChecklistInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      // Next position = count of existing rows for this facility.
      const { count, error: countErr } = await ctx.supabase
        .from("daily_report_checklists")
        .select("id", { count: "exact", head: true })
        .eq("facility_id", ctx.facilityId);
      if (countErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: countErr.message,
        });
      }

      const { data, error } = await ctx.supabase
        .from("daily_report_checklists")
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

  updateChecklist: protectedProcedure
    .input(UpdateChecklistInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const { error } = await ctx.supabase
        .from("daily_report_checklists")
        .update({ name: input.name })
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

  deleteChecklist: protectedProcedure
    .input(DeleteChecklistInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const { error } = await ctx.supabase
        .from("daily_report_checklists")
        .delete()
        .eq("id", input.id)
        .eq("facility_id", ctx.facilityId);
      if (error) {
        // Most common failure: FK violation from daily_reports rows
        // referencing this checklist. Surface a friendlier message.
        const msg = /foreign key/i.test(error.message)
          ? "This checklist has report submissions and cannot be deleted. Remove or archive the submissions first."
          : error.message;
        throw new TRPCError({ code: "CONFLICT", message: msg });
      }
      return { ok: true as const };
    }),

  reorderChecklists: protectedProcedure
    .input(ReorderChecklistsInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      // Per-row updates; RLS filters to the caller's facility so any
      // id that doesn't belong is silently skipped. Not transactional
      // but safe at Tennity scale (single admin, no concurrent edits).
      for (let i = 0; i < input.ids.length; i++) {
        const id = input.ids[i]!;
        const { error } = await ctx.supabase
          .from("daily_report_checklists")
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

  // -------------------------------------------------------------------
  // Item mutations
  // -------------------------------------------------------------------
  createItem: protectedProcedure
    .input(CreateItemInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      // Verify the target checklist belongs to the caller's facility.
      // (RLS on the insert would also block cross-facility writes, but
      // returning a clean error here is nicer than a Postgres code.)
      const { data: parent, error: parentErr } = await ctx.supabase
        .from("daily_report_checklists")
        .select("id")
        .eq("id", input.checklist_id)
        .eq("facility_id", ctx.facilityId)
        .maybeSingle();
      if (parentErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: parentErr.message,
        });
      }
      if (!parent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Checklist not found",
        });
      }

      // Next position = count of existing items for this checklist.
      const { count, error: countErr } = await ctx.supabase
        .from("daily_report_items")
        .select("id", { count: "exact", head: true })
        .eq("checklist_id", input.checklist_id);
      if (countErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: countErr.message,
        });
      }

      const { data, error } = await ctx.supabase
        .from("daily_report_items")
        .insert({
          checklist_id: input.checklist_id,
          label: input.label,
          type: input.type,
          required: input.required,
          options: input.type === "dropdown" ? (input.options ?? null) : null,
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

  updateItem: protectedProcedure
    .input(UpdateItemInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      // Fetch the current row to resolve partial updates against the
      // dropdown/options invariant.
      const { data: current, error: currentErr } = await ctx.supabase
        .from("daily_report_items")
        .select("checklist_id, type, options")
        .eq("id", input.id)
        .maybeSingle();
      if (currentErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: currentErr.message,
        });
      }
      if (!current) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Item not found",
        });
      }

      // Verify the parent checklist belongs to the caller's facility.
      const { data: parent, error: parentErr } = await ctx.supabase
        .from("daily_report_checklists")
        .select("id")
        .eq("id", current.checklist_id)
        .eq("facility_id", ctx.facilityId)
        .maybeSingle();
      if (parentErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: parentErr.message,
        });
      }
      if (!parent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Item not found",
        });
      }

      // Resolve the final shape: merge current with input, then enforce
      // the dropdown/options invariant. If the client is changing type
      // AWAY from dropdown, clear options; if changing TO dropdown, the
      // client must supply options.
      const finalType = input.type ?? (current.type as typeof input.type extends undefined ? string : typeof input.type);
      const inputOptions = input.options;

      let finalOptions: string[] | null;
      if (finalType === "dropdown") {
        if (inputOptions === null || inputOptions === undefined) {
          // Keep existing options if not supplied
          if (Array.isArray(current.options)) {
            finalOptions = current.options.filter(
              (v): v is string => typeof v === "string",
            );
          } else {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Dropdown items need at least one option",
            });
          }
        } else {
          finalOptions = inputOptions;
        }
        if (finalOptions.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Dropdown items need at least one option",
          });
        }
      } else {
        finalOptions = null;
      }

      const patch: Record<string, unknown> = {};
      if (input.label !== undefined) patch.label = input.label;
      if (input.type !== undefined) patch.type = input.type;
      if (input.required !== undefined) patch.required = input.required;
      patch.options = finalOptions;

      const { error } = await ctx.supabase
        .from("daily_report_items")
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

  deleteItem: protectedProcedure
    .input(DeleteItemInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const { error } = await ctx.supabase
        .from("daily_report_items")
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

  reorderItems: protectedProcedure
    .input(ReorderItemsInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      // Verify the parent checklist belongs to the caller's facility.
      const { data: parent, error: parentErr } = await ctx.supabase
        .from("daily_report_checklists")
        .select("id")
        .eq("id", input.checklist_id)
        .eq("facility_id", ctx.facilityId)
        .maybeSingle();
      if (parentErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: parentErr.message,
        });
      }
      if (!parent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Checklist not found",
        });
      }

      for (let i = 0; i < input.ids.length; i++) {
        const id = input.ids[i]!;
        const { error } = await ctx.supabase
          .from("daily_report_items")
          .update({ position: i })
          .eq("id", id)
          .eq("checklist_id", input.checklist_id);
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

// Re-export for consumers that only need the input schemas without
// touching @trpc/server:
export { z };
