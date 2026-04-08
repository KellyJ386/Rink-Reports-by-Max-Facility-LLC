import "server-only";

import { z } from "zod";

import { orgAdminProcedure, router } from "@/server/trpc/trpc";

/**
 * Org roll-up router (Phase G multi-facility).
 *
 * All procedures use orgAdminProcedure which:
 *   1. Requires authenticated user
 *   2. Verifies org_admin membership
 *   3. Resolves ctx.selectedOrgId — the org scope for this request
 *
 * CLAUDE.md Rule 1: organizationId comes from ctx.selectedOrgId
 * (verified by the middleware), never raw from client input.
 * CLAUDE.md Rule 8: Supabase RLS also scopes org reads via
 * get_user_org_ids() in 028_org_roll_up.sql.
 *
 * All procedures are READ-ONLY. No data entry from the org roll-up view.
 */
export const orgRouter = router({
  /**
   * listFacilities — returns all facilities belonging to the selected org
   * with per-facility summary stats.
   *
   * Stats per facility:
   *   - activeAlertCount: unresolved alerts
   *   - lastDailyReportAt: most recent daily_reports.submitted_at
   *   - staffCount: count of user_profiles rows for this facility
   *   - planStatus: from facility_subscriptions.status (may be null)
   *
   * TODO: Volume concern — iterates facilities with Promise.all. If an
   * org has many facilities (100+), this will fan out N supabase queries.
   * Replace with a single SQL view or RPC function if needed.
   */
  listFacilities: orgAdminProcedure.query(
    async ({
      ctx,
    }): Promise<
      {
        facilityId: string;
        facilityName: string;
        planStatus: string | null;
        activeAlertCount: number;
        lastDailyReportAt: string | null;
        staffCount: number;
      }[]
    > => {
      // Fetch all facilities in this org
      const { data: facilities, error } = await ctx.supabase
        .from("facilities")
        .select("id, name, organization_id")
        .eq("organization_id", ctx.selectedOrgId);

      if (error) throw error;
      if (!facilities || facilities.length === 0) return [];

      const facilityIds = facilities.map((f) => f.id);

      // Fetch stats in parallel for all facilities
      const [alertsResult, reportsResult, staffResult, subsResult] =
        await Promise.all([
          // Active alert counts per facility
          ctx.supabase
            .from("alerts")
            .select("facility_id")
            .in("facility_id", facilityIds)
            .is("resolved_at", null),

          // Most recent daily report per facility
          ctx.supabase
            .from("daily_reports")
            .select("facility_id, submitted_at")
            .in("facility_id", facilityIds)
            .order("submitted_at", { ascending: false }),

          // Staff count per facility
          ctx.supabase
            .from("user_profiles")
            .select("facility_id")
            .in("facility_id", facilityIds),

          // Plan status from facility_subscriptions
          ctx.supabase
            .from("facility_subscriptions")
            .select("facility_id, status")
            .in("facility_id", facilityIds),
        ]);

      // Build lookup maps
      const alertCountMap: Record<string, number> = {};
      if (alertsResult.data) {
        for (const row of alertsResult.data) {
          alertCountMap[row.facility_id] =
            (alertCountMap[row.facility_id] ?? 0) + 1;
        }
      }

      // lastDailyReportAt: first row per facility (already ordered DESC)
      const lastReportMap: Record<string, string> = {};
      if (reportsResult.data) {
        for (const row of reportsResult.data) {
          if (!lastReportMap[row.facility_id]) {
            lastReportMap[row.facility_id] = row.submitted_at;
          }
        }
      }

      const staffCountMap: Record<string, number> = {};
      if (staffResult.data) {
        for (const row of staffResult.data) {
          staffCountMap[row.facility_id] =
            (staffCountMap[row.facility_id] ?? 0) + 1;
        }
      }

      const planStatusMap: Record<string, string> = {};
      if (subsResult.data) {
        for (const row of subsResult.data) {
          planStatusMap[row.facility_id] = row.status;
        }
      }

      return facilities.map((f) => ({
        facilityId: f.id,
        facilityName: f.name,
        planStatus: planStatusMap[f.id] ?? null,
        activeAlertCount: alertCountMap[f.id] ?? 0,
        lastDailyReportAt: lastReportMap[f.id] ?? null,
        staffCount: staffCountMap[f.id] ?? 0,
      }));
    },
  ),

  /**
   * getRollupMetrics — aggregate metrics across all facilities in the org.
   *
   * Returns:
   *   - totalIncidents: count of incidents in the date window
   *   - totalAccidents: count of incidents where is_accident = true
   *   - avgAirQualityTier: average tier across all AQ readings in window
   *   - facilitiesWithOpenAlerts: count of facilities with ≥ 1 unresolved alert
   *   - dailyReportCompletionRate: fraction of facility-days with a daily report
   *   - facilitiesOnTrial: facilities with subscription status = 'trialing'
   *   - facilitiesActive: facilities with subscription status = 'active'
   *
   * TODO: plan_status columns — depends on phase-g/stripe-billing completing.
   *       facilitiesOnTrial / facilitiesActive use facility_subscriptions.status
   *       which exists from 013_multi_facility.sql.
   */
  getRollupMetrics: orgAdminProcedure
    .input(z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]) }))
    .query(
      async ({
        ctx,
        input,
      }): Promise<{
        totalIncidents: number;
        totalAccidents: number;
        avgAirQualityTier: number | null;
        facilitiesWithOpenAlerts: number;
        dailyReportCompletionRate: number;
        facilitiesOnTrial: number;
        facilitiesActive: number;
      }> => {
        // Fetch all facility IDs in this org
        const { data: facilities } = await ctx.supabase
          .from("facilities")
          .select("id")
          .eq("organization_id", ctx.selectedOrgId);

        if (!facilities || facilities.length === 0) {
          return {
            totalIncidents: 0,
            totalAccidents: 0,
            avgAirQualityTier: null,
            facilitiesWithOpenAlerts: 0,
            dailyReportCompletionRate: 0,
            facilitiesOnTrial: 0,
            facilitiesActive: 0,
          };
        }

        const facilityIds = facilities.map((f) => f.id);
        const since = new Date(
          Date.now() - input.days * 24 * 60 * 60 * 1000,
        ).toISOString();

        const [
          incidentsResult,
          aqResult,
          alertsResult,
          reportsResult,
          subsResult,
        ] = await Promise.all([
          ctx.supabase
            .from("incidents")
            .select("id, kind")
            .in("facility_id", facilityIds)
            .gte("occurred_at", since),

          ctx.supabase
            .from("air_quality_readings")
            .select("tier")
            .in("facility_id", facilityIds)
            .gte("submitted_at", since),

          ctx.supabase
            .from("alerts")
            .select("facility_id")
            .in("facility_id", facilityIds)
            .is("resolved_at", null),

          ctx.supabase
            .from("daily_reports")
            .select("facility_id, submitted_at")
            .in("facility_id", facilityIds)
            .gte("submitted_at", since),

          ctx.supabase
            .from("facility_subscriptions")
            .select("facility_id, status")
            .in("facility_id", facilityIds),
        ]);

        const totalIncidents = incidentsResult.data?.length ?? 0;
        // Accidents are incidents with kind === 'accident'
        const totalAccidents =
          incidentsResult.data?.filter((i) => i.kind === "accident").length ?? 0;

        // Average AQ tier — tiers are stored as strings like "1","2","3"
        let avgAirQualityTier: number | null = null;
        if (aqResult.data && aqResult.data.length > 0) {
          const sum = aqResult.data.reduce(
            (acc, r) => acc + Number(r.tier),
            0,
          );
          avgAirQualityTier = sum / aqResult.data.length;
        }

        // Count distinct facilities with at least one open alert
        const facilitiesWithAlerts = new Set(
          (alertsResult.data ?? []).map((r) => r.facility_id),
        );
        const facilitiesWithOpenAlerts = facilitiesWithAlerts.size;

        // Daily report completion rate:
        //   expected = facilityCount × days
        //   actual   = distinct (facility_id, date) pairs with a report
        const reportDays = new Set(
          (reportsResult.data ?? []).map(
            (r) =>
              `${r.facility_id}:${r.submitted_at.substring(0, 10)}`,
          ),
        );
        const expectedReports = facilityIds.length * input.days;
        const dailyReportCompletionRate =
          expectedReports > 0 ? reportDays.size / expectedReports : 0;

        const subs = subsResult.data ?? [];
        const facilitiesOnTrial = subs.filter(
          (s) => s.status === "trialing",
        ).length;
        const facilitiesActive = subs.filter(
          (s) => s.status === "active",
        ).length;

        return {
          totalIncidents,
          totalAccidents,
          avgAirQualityTier,
          facilitiesWithOpenAlerts,
          dailyReportCompletionRate,
          facilitiesOnTrial,
          facilitiesActive,
        };
      },
    ),

  /**
   * getFacilityAlerts — all unresolved alerts across the org, with facilityName.
   *
   * Sorted: critical > warning > info, then created_at DESC within each severity.
   * READ-ONLY — org_admin cannot resolve facility alerts.
   */
  getFacilityAlerts: orgAdminProcedure.query(
    async ({
      ctx,
    }): Promise<
      {
        id: string;
        facilityId: string;
        facilityName: string;
        alertType: string;
        severity: string;
        title: string;
        description: string;
        createdAt: string;
      }[]
    > => {
      const { data: facilities } = await ctx.supabase
        .from("facilities")
        .select("id, name")
        .eq("organization_id", ctx.selectedOrgId);

      if (!facilities || facilities.length === 0) return [];

      const facilityIds = facilities.map((f) => f.id);
      const facilityNameMap: Record<string, string> = Object.fromEntries(
        facilities.map((f) => [f.id, f.name]),
      );

      const { data: alerts, error } = await ctx.supabase
        .from("alerts")
        .select(
          "id, facility_id, alert_type, severity, title, description, created_at",
        )
        .in("facility_id", facilityIds)
        .is("resolved_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!alerts) return [];

      const severityOrder: Record<string, number> = {
        critical: 3,
        warning: 2,
        info: 1,
      };

      const sorted = [...alerts].sort((a, b) => {
        const diff =
          (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0);
        if (diff !== 0) return diff;
        return b.created_at < a.created_at ? 1 : -1;
      });

      return sorted.map((a) => ({
        id: a.id,
        facilityId: a.facility_id,
        facilityName: facilityNameMap[a.facility_id] ?? "",
        alertType: a.alert_type,
        severity: a.severity,
        title: a.title,
        description: a.description,
        createdAt: a.created_at,
      }));
    },
  ),
});
