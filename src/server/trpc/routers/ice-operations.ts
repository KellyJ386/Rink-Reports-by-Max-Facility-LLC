import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import {
  toOperationTypeField,
  type Equipment,
  type IceOperationAnswers,
  type OperationType,
} from "@/modules/ice-operations/schema";

/**
 * Staff-facing sub-router for the Ice Operations module. Mounted at
 * the top level as `iceOperations` so the staff page can call it
 * without pulling in the admin namespace.
 *
 * Reads only — writes go through the offline-first Dexie queue and
 * /api/sync per CLAUDE.md Rule 3.
 */

export interface RecentIceOperation {
  id: string;
  operation_type_id: string;
  equipment_id: string;
  submitted_at: string;
  submitted_by: string;
  answers: IceOperationAnswers;
  local_id: string | null;
}

function toAnswers(value: unknown): IceOperationAnswers {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as IceOperationAnswers;
  }
  return {};
}

export const iceOperationsRouter = router({
  // -------------------------------------------------------------------
  // Read: every operation type for this facility, with fields nested.
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
  // Read: ACTIVE equipment for this facility. Inactive equipment is
  // hidden from the staff form so retired Zambonis can't be selected
  // by mistake; admins still see inactive rows in the admin sub-router
  // so they can re-enable or rename them.
  // -------------------------------------------------------------------
  listEquipment: protectedProcedure.query(
    async ({ ctx }): Promise<Equipment[]> => {
      const { data, error } = await ctx.supabase
        .from("ice_equipment")
        .select("id, facility_id, name, position, active")
        .eq("facility_id", ctx.facilityId)
        .eq("active", true)
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
  // Read: most recent operations for this facility.
  // -------------------------------------------------------------------
  listRecent: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }): Promise<RecentIceOperation[]> => {
      const { data, error } = await ctx.supabase
        .from("ice_operations")
        .select(
          "id, operation_type_id, equipment_id, submitted_at, submitted_by, answers, local_id",
        )
        .eq("facility_id", ctx.facilityId)
        .order("submitted_at", { ascending: false })
        .limit(input.limit);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return (data ?? []).map((row) => ({
        id: row.id,
        operation_type_id: row.operation_type_id,
        equipment_id: row.equipment_id,
        submitted_at: row.submitted_at,
        submitted_by: row.submitted_by,
        answers: toAnswers(row.answers),
        local_id: row.local_id,
      }));
    }),
});
