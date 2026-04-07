import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { requireAdmin } from "@/server/trpc/routers/admin";
import {
  CreateEquipmentInput,
  CreateFieldInput,
  CreateOperationTypeInput,
  DeleteEquipmentInput,
  DeleteFieldInput,
  DeleteOperationTypeInput,
  ReorderEquipmentInput,
  ReorderFieldsInput,
  ReorderOperationTypesInput,
  UpdateEquipmentInput,
  UpdateFieldInput,
  UpdateOperationTypeInput,
  toOperationTypeField,
  type Equipment,
  type OperationType,
} from "@/modules/ice-operations/schema";

/**
 * Admin sub-router for the Ice Operations module.
 * Mounted under adminRouter as `admin.iceOperations`.
 *
 * Mirrors the daily-reports-admin shape: read-anything-as-staff,
 * mutate-as-admin. Reads are still scoped via Postgres RLS to the
 * caller's facility. Writes go through requireAdmin() for clean
 * error messages on top of the RLS gate (CLAUDE.md Rule 8).
 *
 * Never accepts facility_id from input — Rule 1.
 */
export const iceOperationsAdminRouter = router({
  // -------------------------------------------------------------------
  // Read: every operation type for this facility, with fields nested
  // -------------------------------------------------------------------
  listOperationTypes: protectedProcedure.query(
    async ({ ctx }): Promise<OperationType[]> => {
      const { data, error } = await ctx.supabase
        .from("ice_operation_types")
        .select(
          "id, facility_id, name, position, fields:ice_operation_type_fields(id, operation_type_id, position, label, type, required, options)",
        )
        .eq("facility_id", ctx.facilityId)
        .order("position", { ascending: true })
        .order("position", {
          ascending: true,
          referencedTable: "ice_operation_type_fields",
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
        fields: (row.fields ?? []).map(toOperationTypeField),
      }));
    },
  ),

  // -------------------------------------------------------------------
  // Read: equipment for this facility (admin sees inactive too so it
  // can edit them — staff-facing reads filter to active=true).
  // -------------------------------------------------------------------
  listEquipment: protectedProcedure.query(
    async ({ ctx }): Promise<Equipment[]> => {
      const { data, error } = await ctx.supabase
        .from("ice_equipment")
        .select("id, facility_id, name, position, active")
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

  // -------------------------------------------------------------------
  // Operation type mutations
  // -------------------------------------------------------------------
  createOperationType: protectedProcedure
    .input(CreateOperationTypeInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      const { count, error: countErr } = await ctx.supabase
        .from("ice_operation_types")
        .select("id", { count: "exact", head: true })
        .eq("facility_id", ctx.facilityId);
      if (countErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: countErr.message,
        });
      }

      const { data, error } = await ctx.supabase
        .from("ice_operation_types")
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

  updateOperationType: protectedProcedure
    .input(UpdateOperationTypeInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const { error } = await ctx.supabase
        .from("ice_operation_types")
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

  deleteOperationType: protectedProcedure
    .input(DeleteOperationTypeInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const { error } = await ctx.supabase
        .from("ice_operation_types")
        .delete()
        .eq("id", input.id)
        .eq("facility_id", ctx.facilityId);
      if (error) {
        const msg = /foreign key/i.test(error.message)
          ? "This operation type has logged entries and cannot be deleted. Remove or archive the entries first."
          : error.message;
        throw new TRPCError({ code: "CONFLICT", message: msg });
      }
      return { ok: true as const };
    }),

  reorderOperationTypes: protectedProcedure
    .input(ReorderOperationTypesInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      for (let i = 0; i < input.ids.length; i++) {
        const id = input.ids[i]!;
        const { error } = await ctx.supabase
          .from("ice_operation_types")
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
  // Field mutations
  // -------------------------------------------------------------------
  createField: protectedProcedure
    .input(CreateFieldInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      const { data: parent, error: parentErr } = await ctx.supabase
        .from("ice_operation_types")
        .select("id")
        .eq("id", input.operation_type_id)
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
          message: "Operation type not found",
        });
      }

      const { count, error: countErr } = await ctx.supabase
        .from("ice_operation_type_fields")
        .select("id", { count: "exact", head: true })
        .eq("operation_type_id", input.operation_type_id);
      if (countErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: countErr.message,
        });
      }

      const { data, error } = await ctx.supabase
        .from("ice_operation_type_fields")
        .insert({
          operation_type_id: input.operation_type_id,
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

  updateField: protectedProcedure
    .input(UpdateFieldInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      const { data: current, error: currentErr } = await ctx.supabase
        .from("ice_operation_type_fields")
        .select("operation_type_id, type, options")
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
          message: "Field not found",
        });
      }

      const { data: parent, error: parentErr } = await ctx.supabase
        .from("ice_operation_types")
        .select("id")
        .eq("id", current.operation_type_id)
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
          message: "Field not found",
        });
      }

      // Resolve final shape: enforce dropdown-options invariant the
      // same way daily-reports-admin does.
      const finalType = input.type ?? current.type;
      const inputOptions = input.options;
      let finalOptions: string[] | null;
      if (finalType === "dropdown") {
        if (inputOptions === null || inputOptions === undefined) {
          if (Array.isArray(current.options)) {
            finalOptions = current.options.filter(
              (v): v is string => typeof v === "string",
            );
          } else {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Dropdown fields need at least one option",
            });
          }
        } else {
          finalOptions = inputOptions;
        }
        if (finalOptions.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Dropdown fields need at least one option",
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
        .from("ice_operation_type_fields")
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

  deleteField: protectedProcedure
    .input(DeleteFieldInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const { error } = await ctx.supabase
        .from("ice_operation_type_fields")
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

  reorderFields: protectedProcedure
    .input(ReorderFieldsInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      const { data: parent, error: parentErr } = await ctx.supabase
        .from("ice_operation_types")
        .select("id")
        .eq("id", input.operation_type_id)
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
          message: "Operation type not found",
        });
      }

      for (let i = 0; i < input.ids.length; i++) {
        const id = input.ids[i]!;
        const { error } = await ctx.supabase
          .from("ice_operation_type_fields")
          .update({ position: i })
          .eq("id", id)
          .eq("operation_type_id", input.operation_type_id);
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
  // Equipment mutations
  // -------------------------------------------------------------------
  createEquipment: protectedProcedure
    .input(CreateEquipmentInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      const { count, error: countErr } = await ctx.supabase
        .from("ice_equipment")
        .select("id", { count: "exact", head: true })
        .eq("facility_id", ctx.facilityId);
      if (countErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: countErr.message,
        });
      }

      const { data, error } = await ctx.supabase
        .from("ice_equipment")
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

  updateEquipment: protectedProcedure
    .input(UpdateEquipmentInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.active !== undefined) patch.active = input.active;
      if (Object.keys(patch).length === 0) {
        return { ok: true as const };
      }
      const { error } = await ctx.supabase
        .from("ice_equipment")
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

  deleteEquipment: protectedProcedure
    .input(DeleteEquipmentInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const { error } = await ctx.supabase
        .from("ice_equipment")
        .delete()
        .eq("id", input.id)
        .eq("facility_id", ctx.facilityId);
      if (error) {
        const msg = /foreign key/i.test(error.message)
          ? "This equipment has logged operations and cannot be deleted. Mark it inactive instead."
          : error.message;
        throw new TRPCError({ code: "CONFLICT", message: msg });
      }
      return { ok: true as const };
    }),

  reorderEquipment: protectedProcedure
    .input(ReorderEquipmentInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      for (let i = 0; i < input.ids.length; i++) {
        const id = input.ids[i]!;
        const { error } = await ctx.supabase
          .from("ice_equipment")
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
});

export { z };
