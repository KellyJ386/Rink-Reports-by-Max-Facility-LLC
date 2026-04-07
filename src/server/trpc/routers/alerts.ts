import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import type { Alert } from "@/lib/offline/types";

/**
 * Alerts sub-router. Mounted at the top level as `alerts`.
 *
 * Rows in the `alerts` table are written only by the Vercel cron
 * anomaly scanner (service-role client, bypasses RLS). Authenticated
 * users can list and resolve their facility's alerts.
 *
 * facility_id always comes from ctx.facilityId — never from input
 * (CLAUDE.md Rule 1).
 */
export const alertsRouter = router({
  /**
   * list — Return alerts for the calling user's facility.
   *
   * Filters:
   *   - resolved: false (default) → only open alerts
   *   - severity: optional filter
   *   - limit: 1–100, default 20
   */
  list: protectedProcedure
    .input(
      z.object({
        resolved: z.boolean().default(false),
        severity: z.enum(["info", "warning", "critical"]).optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }): Promise<Alert[]> => {
      let query = ctx.supabase
        .from("alerts")
        .select(
          "id, facility_id, alert_type, severity, target_identifier, title, description, metadata, resolved_at, resolved_by, created_at",
        )
        .eq("facility_id", ctx.facilityId)
        .order("created_at", { ascending: false })
        .limit(input.limit);

      if (input.resolved) {
        query = query.not("resolved_at", "is", null);
      } else {
        query = query.is("resolved_at", null);
      }

      if (input.severity) {
        query = query.eq("severity", input.severity);
      }

      const { data, error } = await query;

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return (data ?? []).map((row) => ({
        id: row.id,
        facilityId: row.facility_id,
        alertType: row.alert_type,
        severity: row.severity as "info" | "warning" | "critical",
        targetIdentifier: row.target_identifier,
        title: row.title,
        description: row.description,
        metadata: (row.metadata as Record<string, unknown>) ?? {},
        resolvedAt: row.resolved_at,
        resolvedBy: row.resolved_by,
        createdAt: row.created_at,
      }));
    }),

  /**
   * resolve — Mark an alert as resolved.
   *
   * Verifies the alert belongs to ctx.facilityId before updating.
   * Sets resolved_at = now() and resolved_by = the calling user's ID.
   */
  resolve: protectedProcedure
    .input(z.object({ alertId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      // Confirm the alert belongs to this facility before updating.
      const { data: existing, error: selectErr } = await ctx.supabase
        .from("alerts")
        .select("id, facility_id")
        .eq("id", input.alertId)
        .eq("facility_id", ctx.facilityId)
        .is("resolved_at", null)
        .maybeSingle();

      if (selectErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: selectErr.message,
        });
      }

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Alert not found or already resolved",
        });
      }

      const { error: updateErr } = await ctx.supabase
        .from("alerts")
        .update({
          resolved_at: new Date().toISOString(),
          resolved_by: ctx.user.id,
        })
        .eq("id", input.alertId)
        .eq("facility_id", ctx.facilityId);

      if (updateErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: updateErr.message,
        });
      }

      return { ok: true };
    }),
});
