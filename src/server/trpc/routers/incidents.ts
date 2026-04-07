import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { ReportInput } from "@/modules/incidents/schema";
import type { ReportInput as ReportInputType } from "@/modules/incidents/schema";

/**
 * Staff-facing sub-router for Incidents. Mounted at the top level
 * as `incidents`. Reads only — writes go through the offline-first
 * Dexie queue and /api/sync.
 */

export interface RecentIncident {
  id: string;
  kind: "incident" | "accident";
  occurred_at: string;
  location: string;
  incident_type: string;
  description: string;
  data: ReportInputType | null;
  submitted_at: string;
  submitted_by: string;
  local_id: string | null;
}

export const incidentsRouter = router({
  listRecent: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }): Promise<RecentIncident[]> => {
      const { data, error } = await ctx.supabase
        .from("incidents")
        .select(
          "id, kind, occurred_at, location, incident_type, description, data, submitted_at, submitted_by, local_id",
        )
        .eq("facility_id", ctx.facilityId)
        .order("occurred_at", { ascending: false })
        .limit(input.limit);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return (data ?? []).map((row) => {
        // The `data` JSONB column should already be a complete
        // ReportInput per the /api/sync handler's contract. Re-parse
        // defensively at the boundary.
        const parsed = ReportInput.safeParse(row.data);
        return {
          id: row.id,
          kind: row.kind === "accident" ? "accident" : "incident",
          occurred_at: row.occurred_at,
          location: row.location,
          incident_type: row.incident_type,
          description: row.description,
          data: parsed.success ? parsed.data : null,
          submitted_at: row.submitted_at,
          submitted_by: row.submitted_by,
          local_id: row.local_id,
        };
      });
    }),
});
