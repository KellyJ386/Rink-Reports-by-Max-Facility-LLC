import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { TIER_RANK, type Tier } from "@/modules/air-quality/schema";
import { toMeasurements } from "@/modules/ice-depth/schema";

/**
 * Analytics sub-router for Phase C Insights Layer.
 * Mounted at the top level as `analytics`.
 *
 * ALL procedures use protectedProcedure so ctx.facilityId is always
 * a non-null string (CLAUDE.md Rule 1 + 8). facility_id is NEVER
 * accepted from client input.
 */

const DaysInput = z.union([z.literal(7), z.literal(30), z.literal(90)]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Truncate an ISO timestamp string to a YYYY-MM-DD date string. */
function toDateStr(isoString: string): string {
  return isoString.slice(0, 10);
}

/** Compute days-ago ISO datetime string for Supabase .gte() filters. */
function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const analyticsRouter = router({
  // -------------------------------------------------------------------------
  // 1. Air Quality Trend
  // -------------------------------------------------------------------------
  airQualityTrend: protectedProcedure
    .input(z.object({ days: DaysInput }))
    .output(
      z.array(
        z.object({
          date: z.string(),
          avgCo: z.number().nullable(),
          avgNo2: z.number().nullable(),
          maxTier: z.number(),
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("air_quality_readings")
        .select("submitted_at, co_ppm, no2_ppm, tier")
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", daysAgoISO(input.days))
        .order("submitted_at", { ascending: true });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // Aggregate by date in JS
      const byDate = new Map<
        string,
        { coSum: number; no2Sum: number; count: number; maxTierRank: number }
      >();

      for (const row of data ?? []) {
        const date = toDateStr(row.submitted_at);
        const entry = byDate.get(date) ?? {
          coSum: 0,
          no2Sum: 0,
          count: 0,
          maxTierRank: 0,
        };
        entry.coSum += typeof row.co_ppm === "number" ? row.co_ppm : 0;
        entry.no2Sum += typeof row.no2_ppm === "number" ? row.no2_ppm : 0;
        entry.count += 1;
        const tierRank =
          TIER_RANK[row.tier as Tier] ?? 0;
        if (tierRank > entry.maxTierRank) entry.maxTierRank = tierRank;
        byDate.set(date, entry);
      }

      return Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, entry]) => ({
          date,
          avgCo: entry.count > 0 ? entry.coSum / entry.count : null,
          avgNo2: entry.count > 0 ? entry.no2Sum / entry.count : null,
          maxTier: entry.maxTierRank,
        }));
    }),

  // -------------------------------------------------------------------------
  // 2. Refrigeration Brine Delta Trend
  // -------------------------------------------------------------------------
  refrigerationBrineDeltaTrend: protectedProcedure
    .input(z.object({ days: DaysInput }))
    .output(
      z.array(
        z.object({
          date: z.string(),
          avgDeltaT: z.number().nullable(),
          shiftLabel: z.string(),
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("refrigeration_readings")
        .select("submitted_at, brine_supply, brine_return")
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", daysAgoISO(input.days))
        .order("submitted_at", { ascending: true });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // No shift column exists in the refrigeration_readings table —
      // group by date only and return a single shiftLabel "all".
      // TODO Phase C polish: add shift detection (AM/PM based on hour)
      // once facility config exposes shift boundaries.
      const byDate = new Map<
        string,
        { deltaSum: number; count: number }
      >();

      for (const row of data ?? []) {
        const date = toDateStr(row.submitted_at);
        const supply =
          typeof row.brine_supply === "number" ? row.brine_supply : null;
        const ret =
          typeof row.brine_return === "number" ? row.brine_return : null;
        if (supply === null || ret === null) continue;
        const delta = ret - supply;
        const entry = byDate.get(date) ?? { deltaSum: 0, count: 0 };
        entry.deltaSum += delta;
        entry.count += 1;
        byDate.set(date, entry);
      }

      return Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, entry]) => ({
          date,
          avgDeltaT: entry.count > 0 ? entry.deltaSum / entry.count : null,
          shiftLabel: "all",
        }));
    }),

  // -------------------------------------------------------------------------
  // 3. Ice Depth Heatmap Delta
  // -------------------------------------------------------------------------
  iceDepthHeatmapDelta: protectedProcedure
    .input(
      z.object({
        days: DaysInput,
        templateId: z.string(),
      }),
    )
    .output(
      z.array(
        z.object({
          pointIndex: z.number(),
          avgDepth: z.number(),
          deltaFromBaseline: z.number().nullable(),
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      // Fetch the window rows
      const { data: windowData, error: windowError } = await ctx.supabase
        .from("ice_depth_sessions")
        .select("measurements")
        .eq("facility_id", ctx.facilityId)
        .eq("template_id", input.templateId)
        .gte("submitted_at", daysAgoISO(input.days));

      if (windowError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: windowError.message,
        });
      }

      // Fetch the 90-day baseline
      const { data: baselineData, error: baselineError } = await ctx.supabase
        .from("ice_depth_sessions")
        .select("measurements")
        .eq("facility_id", ctx.facilityId)
        .eq("template_id", input.templateId)
        .gte("submitted_at", daysAgoISO(90));

      if (baselineError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: baselineError.message,
        });
      }

      // Helper: aggregate measurements JSONB array into per-point avg
      function aggregateByPoint(
        rows: { measurements: unknown }[],
      ): Map<number, { sum: number; count: number }> {
        const acc = new Map<number, { sum: number; count: number }>();
        for (const row of rows) {
          const m = toMeasurements(row.measurements);
          for (const [keyStr, value] of Object.entries(m)) {
            const idx = parseInt(keyStr, 10);
            if (!Number.isFinite(idx)) continue;
            const entry = acc.get(idx) ?? { sum: 0, count: 0 };
            entry.sum += value;
            entry.count += 1;
            acc.set(idx, entry);
          }
        }
        return acc;
      }

      const windowAgg = aggregateByPoint(windowData ?? []);
      const baselineAgg = aggregateByPoint(baselineData ?? []);

      const result: {
        pointIndex: number;
        avgDepth: number;
        deltaFromBaseline: number | null;
      }[] = [];

      for (const [idx, entry] of windowAgg.entries()) {
        const avgDepth = entry.sum / entry.count;
        const baselineEntry = baselineAgg.get(idx);
        let deltaFromBaseline: number | null = null;
        if (baselineEntry && baselineEntry.count > 0) {
          const baselineAvg = baselineEntry.sum / baselineEntry.count;
          deltaFromBaseline = avgDepth - baselineAvg;
        }
        result.push({ pointIndex: idx, avgDepth, deltaFromBaseline });
      }

      return result.sort((a, b) => a.pointIndex - b.pointIndex);
    }),

  // -------------------------------------------------------------------------
  // 4. Incidents Frequency by Location
  // -------------------------------------------------------------------------
  incidentsFrequencyByLocation: protectedProcedure
    .input(z.object({ days: DaysInput }))
    .output(
      z.array(
        z.object({
          location: z.string(),
          count: z.number(),
          incidentType: z.string(),
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("incidents")
        .select("location, incident_type")
        .eq("facility_id", ctx.facilityId)
        .gte("occurred_at", daysAgoISO(input.days));

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // Group by location + incident_type, count
      const grouped = new Map<string, number>();
      for (const row of data ?? []) {
        const key = `${row.location}|||${row.incident_type}`;
        grouped.set(key, (grouped.get(key) ?? 0) + 1);
      }

      return Array.from(grouped.entries()).map(([key, count]) => {
        const [location, incidentType] = key.split("|||");
        return { location: location ?? "", incidentType: incidentType ?? "", count };
      });
    }),

  // -------------------------------------------------------------------------
  // 5. Daily Report Completion Rate
  // -------------------------------------------------------------------------
  dailyReportCompletionRate: protectedProcedure
    .input(z.object({ days: DaysInput }))
    .output(
      z.array(
        z.object({
          date: z.string(),
          submittedTabs: z.number(),
          totalConfiguredTabs: z.number(),
          completionPct: z.number(),
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      // Count distinct checklist submissions per day.
      const { data, error } = await ctx.supabase
        .from("daily_reports")
        .select("submitted_at, checklist_id")
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", daysAgoISO(input.days))
        .order("submitted_at", { ascending: true });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // Count configured checklists for this facility
      const { data: checklists, error: checklistError } = await ctx.supabase
        .from("daily_report_checklists")
        .select("id")
        .eq("facility_id", ctx.facilityId);

      if (checklistError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: checklistError.message,
        });
      }

      const totalConfiguredTabs = (checklists ?? []).length;

      // Aggregate distinct checklist IDs per day
      const byDate = new Map<string, Set<string>>();
      for (const row of data ?? []) {
        const date = toDateStr(row.submitted_at);
        const set = byDate.get(date) ?? new Set<string>();
        set.add(row.checklist_id);
        byDate.set(date, set);
      }

      // TODO Phase C polish: if totalConfiguredTabs === 0, fall back to
      // max(submittedTabs across window) as the denominator so the
      // completionPct is still meaningful even before admin sets up checklists.
      const effectiveTotal =
        totalConfiguredTabs > 0
          ? totalConfiguredTabs
          : Math.max(...Array.from(byDate.values()).map((s) => s.size), 1);

      return Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, tabSet]) => {
          const submittedTabs = tabSet.size;
          const completionPct = Math.min(
            100,
            (submittedTabs / effectiveTotal) * 100,
          );
          return {
            date,
            submittedTabs,
            totalConfiguredTabs: effectiveTotal,
            completionPct,
          };
        });
    }),
});
