import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { generateOshaLog, type OshaIncident } from "@/server/pdf/packs/oshaInjuryLog";
import { generateEpaRmpLog } from "@/server/pdf/packs/epaRmpLog";
import {
  generateUsaHockeySafety,
  type AirQualityReadingData,
  type IncidentRowData,
  type IceDepthSessionData,
  type DailyReportCompletionData,
} from "@/server/pdf/packs/usaHockeyRinkSafety";
import {
  generateMonthlyBoardPack,
  type AirQualitySummary,
  type RefrigerationSummary,
  type IncidentSummary,
  type CompletionRate,
  type ActiveAlert,
} from "@/server/pdf/packs/monthlyBoardPack";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build the ISO date range strings for a calendar year.
 * Used for Supabase .gte / .lte filters.
 */
function yearRange(year: number): { from: string; to: string } {
  return {
    from: `${year}-01-01T00:00:00.000Z`,
    to: `${year}-12-31T23:59:59.999Z`,
  };
}

/**
 * Build ISO date range strings for a given YYYY-MM month.
 */
function monthRange(yyyyMm: string): { from: string; to: string } {
  const [year, month] = yyyyMm.split("-").map(Number) as [number, number];
  const from = new Date(year, month - 1, 1).toISOString();
  // Last ms of the month: first day of next month minus 1ms
  const toDate = new Date(year, month, 1);
  toDate.setMilliseconds(-1);
  return { from, to: toDate.toISOString() };
}

// ============================================================================
// Router
// ============================================================================

export const exportsRouter = router({
  // --------------------------------------------------------------------------
  // OSHA 300/300A Injury Log
  // --------------------------------------------------------------------------
  oshaLog: protectedProcedure
    .input(
      z.object({
        year: z.number().int().min(2020).max(2030),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // ctx.facilityId is guaranteed non-null by protectedProcedure middleware
      // (see src/server/trpc/trpc.ts). Never read from input. CLAUDE.md Rule 1.
      if (!ctx.facilityId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Fetch facility info (name and address for OSHA 300A establishment section)
      const { data: facility } = await ctx.supabase
        .from("facilities")
        .select("name, address_line1, city, state, postal_code")
        .eq("id", ctx.facilityId)
        .maybeSingle();

      // Compose a single address string from the structured address columns
      const facilityAddress = [
        facility?.address_line1,
        facility?.city,
        facility?.state,
        facility?.postal_code,
      ]
        .filter(Boolean)
        .join(", ");

      const { from, to } = yearRange(input.year);

      // Fetch all incidents for the year for this facility
      // Field mapping per 29 CFR 1904 — see oshaInjuryLog.ts for full field comments
      const { data: incidents, error: incError } = await ctx.supabase
        .from("incidents")
        .select(
          "id, kind, occurred_at, location, incident_type, description, data",
        )
        .eq("facility_id", ctx.facilityId)
        .gte("occurred_at", from)
        .lte("occurred_at", to)
        .order("occurred_at", { ascending: true });

      if (incError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch incidents: ${incError.message}`,
        });
      }

      // Map DB rows to OshaIncident shape.
      // TODO: This mapping is best-effort. OSHA 300 requires the employer to
      // determine recordability per 29 CFR 1904.7 before logging — all incidents
      // are included here and the admin must pre-filter for recordability.
      //
      // Field mapping:
      //   caseNo           → row index + 1 (sequential within this export)
      //   employeeName     → data.injured_name for accidents; "N/A" for incidents
      //                      (OSHA 300 Column B)
      //   jobTitle         → data.injured_type for accidents; "N/A" for incidents
      //                      (OSHA 300 Column C — closest available field)
      //   dateOfInjury     → occurred_at (OSHA 300 Column D)
      //   location         → location (OSHA 300 Column E)
      //   description      → description (OSHA 300 Column F)
      //   classification   → defaults to "other" (OSHA 300 Columns G–J)
      //                      TODO: classification is not stored in the incidents
      //                      table — it should be added in a future migration or
      //                      mapped from incident_type by the admin.
      //   daysAway         → 0 (TODO: not stored in incidents table)
      //   daysRestricted   → 0 (TODO: not stored in incidents table)
      //   injuryType       → data.nature_of_injury for accidents; incident_type otherwise
      const mapped: OshaIncident[] = (incidents ?? []).map((row, i) => {
        const data =
          typeof row.data === "object" && row.data !== null
            ? (row.data as Record<string, unknown>)
            : {};

        return {
          caseNo: i + 1,
          // OSHA Column B — Employee's Name
          employeeName:
            row.kind === "accident" && typeof data["injured_name"] === "string"
              ? data["injured_name"]
              : "N/A",
          // OSHA Column C — Job Title (closest available field)
          jobTitle:
            row.kind === "accident" && typeof data["injured_type"] === "string"
              ? data["injured_type"]
              : "N/A",
          // OSHA Column D — Date of injury
          dateOfInjury: (row.occurred_at as string).slice(0, 10),
          // OSHA Column E — Where the event occurred
          location: row.location as string,
          // OSHA Column F — Describe injury/illness
          description: row.description as string,
          // OSHA Columns G–J — Classification (TODO: not stored; defaults to "other")
          classification: "other" as const,
          // OSHA Column K — Days away from work (TODO: not stored)
          daysAway: 0,
          // OSHA Column L — Days of restricted work (TODO: not stored)
          daysRestricted: 0,
          // OSHA Columns M1–M6 — Injury type
          injuryType:
            typeof data["nature_of_injury"] === "string"
              ? data["nature_of_injury"]
              : (row.incident_type as string),
        };
      });

      const base64 = await generateOshaLog({
        facilityName: facility?.name ?? "",
        // Address composed from structured columns: address_line1, city, state, postal_code
        facilityAddress,
        year: input.year,
        incidents: mapped,
        facilityId: ctx.facilityId,
      });

      return {
        base64,
        filename: `osha-${ctx.facilityId.slice(0, 8)}-${input.year}.pdf`,
      };
    }),

  // --------------------------------------------------------------------------
  // EPA RMP Refrigerant Log
  // --------------------------------------------------------------------------
  epaRmpLog: protectedProcedure
    .input(
      z.object({
        year: z.number().int().min(2020).max(2030),
        // Refrigerant type string — provided by the facility admin.
        // Example: "R-717 (Ammonia)", "R-22", "R-404A"
        refrigerantType: z.string().min(1).max(120),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.facilityId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { data: epaFacility } = await ctx.supabase
        .from("facilities")
        .select("name, address_line1, city, state, postal_code")
        .eq("id", ctx.facilityId)
        .maybeSingle();

      const epaFacilityAddress = [
        epaFacility?.address_line1,
        epaFacility?.city,
        epaFacility?.state,
        epaFacility?.postal_code,
      ]
        .filter(Boolean)
        .join(", ");

      const { from, to } = yearRange(input.year);

      const { data: readings, error } = await ctx.supabase
        .from("refrigeration_readings")
        .select(
          "submitted_at, brine_supply, brine_return, brine_flow, ice_surface_temp, condenser_temp",
        )
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", from)
        .lte("submitted_at", to)
        .order("submitted_at", { ascending: true });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch refrigeration readings: ${error.message}`,
        });
      }

      const base64 = await generateEpaRmpLog({
        facilityName: epaFacility?.name ?? "",
        facilityAddress: epaFacilityAddress,
        year: input.year,
        refrigerantType: input.refrigerantType,
        readings: (readings ?? []).map((r) => ({
          submitted_at: r.submitted_at,
          brine_supply: r.brine_supply ?? null,
          brine_return: r.brine_return ?? null,
          brine_flow: r.brine_flow ?? null,
          ice_surface_temp: r.ice_surface_temp ?? null,
          condenser_temp: r.condenser_temp ?? null,
        })),
      });

      return {
        base64,
        filename: `epa-rmp-${ctx.facilityId.slice(0, 8)}-${input.year}.pdf`,
      };
    }),

  // --------------------------------------------------------------------------
  // USA Hockey Rink Safety Report
  // --------------------------------------------------------------------------
  usaHockeySafety: protectedProcedure
    .input(
      z.object({
        // ISO date string for the report period end (e.g. "2026-03-31")
        reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        // ISO YYYY-MM for the month being reported (e.g. "2026-03")
        month: z.string().regex(/^\d{4}-\d{2}$/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.facilityId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { data: facility } = await ctx.supabase
        .from("facilities")
        .select("name")
        .eq("id", ctx.facilityId)
        .maybeSingle();

      const { from, to } = monthRange(input.month);

      // Fetch ice depth sessions
      const { data: iceSessions } = await ctx.supabase
        .from("ice_depth_sessions")
        .select("submitted_at, resurfacing_status, measurements, notes, status")
        .eq("facility_id", ctx.facilityId)
        .eq("status", "completed")
        .gte("submitted_at", from)
        .lte("submitted_at", to)
        .order("submitted_at", { ascending: true });

      // Fetch air quality readings
      const { data: aqReadings } = await ctx.supabase
        .from("air_quality_readings")
        .select("submitted_at, co_ppm, no2_ppm, tier")
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", from)
        .lte("submitted_at", to)
        .order("submitted_at", { ascending: true });

      // Fetch incidents
      const { data: incidents } = await ctx.supabase
        .from("incidents")
        .select("occurred_at, kind, incident_type, location, description")
        .eq("facility_id", ctx.facilityId)
        .gte("occurred_at", from)
        .lte("occurred_at", to)
        .order("occurred_at", { ascending: true });

      // Fetch daily reports for completion stats
      // Group by checklist_id to compute submitted/missed
      const { data: dailyReports } = await ctx.supabase
        .from("daily_reports")
        .select("checklist_id, submitted_at")
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", from)
        .lte("submitted_at", to);

      // Fetch checklist names
      const { data: checklists } = await ctx.supabase
        .from("daily_report_checklists")
        .select("id, name")
        .eq("facility_id", ctx.facilityId);

      // Compute completion rates per checklist
      const [year, monthNum] = input.month.split("-").map(Number) as [number, number];
      const daysInMonth = new Date(year, monthNum, 0).getDate();

      const submittedByChecklist: Record<string, number> = {};
      for (const dr of dailyReports ?? []) {
        const cid = dr.checklist_id as string;
        submittedByChecklist[cid] = (submittedByChecklist[cid] ?? 0) + 1;
      }

      const drData: DailyReportCompletionData[] = (checklists ?? []).map((cl) => {
        const submitted = submittedByChecklist[cl.id as string] ?? 0;
        const missed = Math.max(0, daysInMonth - submitted);
        return {
          checklistName: cl.name as string,
          submitted,
          missed,
          totalDays: daysInMonth,
        };
      });

      const iceDepthData: IceDepthSessionData[] = (iceSessions ?? []).map((s) => ({
        submitted_at: s.submitted_at as string,
        resurfacing_status: s.resurfacing_status as "pre" | "mid" | "post" | null,
        measurements: (typeof s.measurements === "object" && s.measurements !== null
          ? Object.fromEntries(
              Object.entries(s.measurements as Record<string, unknown>).filter(
                ([, v]) => typeof v === "number",
              ),
            )
          : {}) as Record<string, number>,
        notes: s.notes as string | null,
      }));

      const airQualityData: AirQualityReadingData[] = (aqReadings ?? []).map((r) => ({
        submitted_at: r.submitted_at as string,
        co_ppm: r.co_ppm as number,
        no2_ppm: r.no2_ppm as number,
        tier: (r.tier as string | null) ?? "normal",
      }));

      const incidentData: IncidentRowData[] = (incidents ?? []).map((r) => ({
        occurred_at: r.occurred_at as string,
        kind: r.kind as "incident" | "accident",
        incident_type: r.incident_type as string,
        location: r.location as string,
        description: r.description as string,
      }));

      const base64 = await generateUsaHockeySafety({
        facilityName: facility?.name ?? "",
        reportDate: input.reportDate,
        iceDepthData,
        airQualityData,
        incidentData,
        dailyReportData: drData,
      });

      return {
        base64,
        filename: `usa-hockey-${ctx.facilityId.slice(0, 8)}-${input.month}.pdf`,
      };
    }),

  // --------------------------------------------------------------------------
  // Monthly Board Pack
  // --------------------------------------------------------------------------
  monthlyBoardPack: protectedProcedure
    .input(
      z.object({
        // ISO YYYY-MM for the month being reported (e.g. "2026-03")
        month: z.string().regex(/^\d{4}-\d{2}$/),
        // Human-readable label for the month (e.g. "March 2026")
        monthLabel: z.string().min(1).max(40),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.facilityId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { data: facility } = await ctx.supabase
        .from("facilities")
        .select("name")
        .eq("id", ctx.facilityId)
        .maybeSingle();

      const { from, to } = monthRange(input.month);
      const [year, monthNum] = input.month.split("-").map(Number) as [number, number];
      const daysInMonth = new Date(year, monthNum, 0).getDate();

      // ---- Air Quality Summary ----
      const { data: aqReadings } = await ctx.supabase
        .from("air_quality_readings")
        .select("co_ppm, no2_ppm, tier")
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", from)
        .lte("submitted_at", to);

      const aqSummary: AirQualitySummary = (() => {
        if (!aqReadings || aqReadings.length === 0) {
          return {
            avgCoPpm: null,
            avgNo2Ppm: null,
            daysNormal: 0,
            daysCaution: 0,
            daysAction: 0,
            daysEvacuate: 0,
            trend: "no_data" as const,
          };
        }
        const avgCo =
          aqReadings.reduce((s, r) => s + (r.co_ppm as number), 0) /
          aqReadings.length;
        const avgNo2 =
          aqReadings.reduce((s, r) => s + (r.no2_ppm as number), 0) /
          aqReadings.length;

        // Days by tier: count unique days (or use reading count as approximation)
        const tierCounts: Record<string, number> = {
          normal: 0,
          caution: 0,
          action: 0,
          evacuate: 0,
        };
        for (const r of aqReadings) {
          const tier = (r.tier as string | null) ?? "normal";
          tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
        }

        return {
          avgCoPpm: avgCo,
          avgNo2Ppm: avgNo2,
          daysNormal: tierCounts["normal"] ?? 0,
          daysCaution: tierCounts["caution"] ?? 0,
          daysAction: tierCounts["action"] ?? 0,
          daysEvacuate: tierCounts["evacuate"] ?? 0,
          trend: "stable" as const, // TODO: compare to prior month for real trend
        };
      })();

      // ---- Refrigeration Summary ----
      const { data: refReadings } = await ctx.supabase
        .from("refrigeration_readings")
        .select("submitted_at, brine_supply, brine_return")
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", from)
        .lte("submitted_at", to);

      const refSummary: RefrigerationSummary = (() => {
        if (!refReadings || refReadings.length === 0) {
          return {
            avgBrineDeltaT: null,
            daysOutsideNormal: 0,
            totalReadingDays: 0,
            trend: "no_data" as const,
          };
        }
        const deltaTValues = refReadings
          .filter(
            (r) => r.brine_supply !== null && r.brine_return !== null,
          )
          .map((r) => (r.brine_supply as number) - (r.brine_return as number));

        const avgDeltaT =
          deltaTValues.length > 0
            ? deltaTValues.reduce((a, b) => a + b, 0) / deltaTValues.length
            : null;

        // Unique reading days
        const readingDays = new Set(
          refReadings.map((r) => (r.submitted_at as string).slice(0, 10)),
        );

        // TODO: daysOutsideNormal requires threshold config from facility_config.
        // For now, report 0 — a future enhancement should fetch the thresholds.
        return {
          avgBrineDeltaT: avgDeltaT,
          daysOutsideNormal: 0,
          totalReadingDays: readingDays.size,
          trend: "stable" as const,
        };
      })();

      // ---- Incident Summary ----
      const { data: incidents } = await ctx.supabase
        .from("incidents")
        .select("kind, incident_type")
        .eq("facility_id", ctx.facilityId)
        .gte("occurred_at", from)
        .lte("occurred_at", to);

      const incSummary: IncidentSummary = (() => {
        if (!incidents || incidents.length === 0) {
          return { byType: {}, total: 0, accidents: 0 };
        }
        const byType: Record<string, number> = {};
        let accidents = 0;
        for (const r of incidents) {
          byType[r.incident_type as string] =
            (byType[r.incident_type as string] ?? 0) + 1;
          if (r.kind === "accident") accidents++;
        }
        return { byType, total: incidents.length, accidents };
      })();

      // ---- Checklist Completion Rates ----
      const { data: checklists } = await ctx.supabase
        .from("daily_report_checklists")
        .select("id, name")
        .eq("facility_id", ctx.facilityId);

      const { data: dailyReports } = await ctx.supabase
        .from("daily_reports")
        .select("checklist_id")
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", from)
        .lte("submitted_at", to);

      const submittedByCl: Record<string, number> = {};
      for (const dr of dailyReports ?? []) {
        const cid = dr.checklist_id as string;
        submittedByCl[cid] = (submittedByCl[cid] ?? 0) + 1;
      }

      const completionRates: CompletionRate[] = (checklists ?? []).map((cl) => {
        const submitted = submittedByCl[cl.id as string] ?? 0;
        return {
          checklistName: cl.name as string,
          submitted,
          missed: Math.max(0, daysInMonth - submitted),
          totalDays: daysInMonth,
        };
      });

      // ---- Active Alerts ----
      const { data: alertRows } = await ctx.supabase
        .from("alerts")
        .select("title, severity, created_at, alert_type")
        .eq("facility_id", ctx.facilityId)
        .is("resolved_at", null)
        .order("created_at", { ascending: false });

      const alerts: ActiveAlert[] = (alertRows ?? []).map((a) => ({
        title: a.title as string,
        severity: a.severity as "info" | "warning" | "critical",
        createdAt: a.created_at as string,
        alertType: a.alert_type as string,
      }));

      const base64 = await generateMonthlyBoardPack({
        facilityName: facility?.name ?? "",
        month: input.monthLabel,
        airQualitySummary: aqSummary,
        refrigerationSummary: refSummary,
        incidentSummary: incSummary,
        completionRates,
        alerts,
      });

      return {
        base64,
        filename: `board-pack-${ctx.facilityId.slice(0, 8)}-${input.month}.pdf`,
      };
    }),
});
