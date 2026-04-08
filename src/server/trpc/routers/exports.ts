import "server-only";

import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { router, protectedProcedure } from "@/server/trpc/trpc";
import { arrayToCsv } from "@/server/exports/csv";
import {
  createWorkbook,
  addWorksheet,
  workbookToBase64,
} from "@/server/exports/xlsx";
import { formatDailyReportRows } from "@/server/exports/formatters/dailyReport";
import { formatIceOperationRows } from "@/server/exports/formatters/iceOperations";
import { formatRefrigerationRows } from "@/server/exports/formatters/refrigerationReadings";
import { formatAirQualityRows } from "@/server/exports/formatters/airQualityReadings";
import { formatIncidentRows } from "@/server/exports/formatters/incidents";

const dateRangeInput = z.object({
  startDate: z.string(),
  endDate: z.string(),
});

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const exportsRouter = router({
  // ─── Daily Reports ───────────────────────────────────────────────────────

  dailyReportCsv: protectedProcedure
    .input(dateRangeInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.facilityId)
        throw new TRPCError({ code: "FORBIDDEN" });

      const { data, error } = await ctx.supabase
        .from("daily_reports")
        .select("*, checklist:checklist_id(name)")
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", input.startDate)
        .lte("submitted_at", input.endDate);

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });

      const { headers, rows } = formatDailyReportRows(
        (data ?? []) as Parameters<typeof formatDailyReportRows>[0],
      );
      const csv = arrayToCsv(headers, rows);

      return {
        base64: Buffer.from(csv, "utf-8").toString("base64"),
        filename: `daily-reports-${input.startDate}-${input.endDate}.csv`,
        mimeType: "text/csv",
      };
    }),

  dailyReportXlsx: protectedProcedure
    .input(dateRangeInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.facilityId)
        throw new TRPCError({ code: "FORBIDDEN" });

      const { data, error } = await ctx.supabase
        .from("daily_reports")
        .select("*, checklist:checklist_id(name)")
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", input.startDate)
        .lte("submitted_at", input.endDate);

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });

      const { headers, rows } = formatDailyReportRows(
        (data ?? []) as Parameters<typeof formatDailyReportRows>[0],
      );
      const wb = createWorkbook();
      addWorksheet(wb, "Daily Reports", headers, rows);
      const base64 = await workbookToBase64(wb);

      return {
        base64,
        filename: `daily-reports-${input.startDate}-${input.endDate}.xlsx`,
        mimeType: XLSX_MIME,
      };
    }),

  // ─── Ice Operations ───────────────────────────────────────────────────────

  iceOperationsCsv: protectedProcedure
    .input(dateRangeInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.facilityId)
        throw new TRPCError({ code: "FORBIDDEN" });

      const { data, error } = await ctx.supabase
        .from("ice_operations")
        .select(
          "*, operation_type:operation_type_id(name), equipment:equipment_id(name)",
        )
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", input.startDate)
        .lte("submitted_at", input.endDate);

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });

      const { headers, rows } = formatIceOperationRows(
        (data ?? []) as Parameters<typeof formatIceOperationRows>[0],
      );
      const csv = arrayToCsv(headers, rows);

      return {
        base64: Buffer.from(csv, "utf-8").toString("base64"),
        filename: `ice-operations-${input.startDate}-${input.endDate}.csv`,
        mimeType: "text/csv",
      };
    }),

  iceOperationsXlsx: protectedProcedure
    .input(dateRangeInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.facilityId)
        throw new TRPCError({ code: "FORBIDDEN" });

      const { data, error } = await ctx.supabase
        .from("ice_operations")
        .select(
          "*, operation_type:operation_type_id(name), equipment:equipment_id(name)",
        )
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", input.startDate)
        .lte("submitted_at", input.endDate);

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });

      const { headers, rows } = formatIceOperationRows(
        (data ?? []) as Parameters<typeof formatIceOperationRows>[0],
      );
      const wb = createWorkbook();
      addWorksheet(wb, "Ice Operations", headers, rows);
      const base64 = await workbookToBase64(wb);

      return {
        base64,
        filename: `ice-operations-${input.startDate}-${input.endDate}.xlsx`,
        mimeType: XLSX_MIME,
      };
    }),

  // ─── Refrigeration ───────────────────────────────────────────────────────

  refrigerationCsv: protectedProcedure
    .input(dateRangeInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.facilityId)
        throw new TRPCError({ code: "FORBIDDEN" });

      const { data, error } = await ctx.supabase
        .from("refrigeration_readings")
        .select("*")
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", input.startDate)
        .lte("submitted_at", input.endDate);

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });

      const { headers, rows } = formatRefrigerationRows(
        (data ?? []) as Parameters<typeof formatRefrigerationRows>[0],
      );
      const csv = arrayToCsv(headers, rows);

      return {
        base64: Buffer.from(csv, "utf-8").toString("base64"),
        filename: `refrigeration-${input.startDate}-${input.endDate}.csv`,
        mimeType: "text/csv",
      };
    }),

  refrigerationXlsx: protectedProcedure
    .input(dateRangeInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.facilityId)
        throw new TRPCError({ code: "FORBIDDEN" });

      const { data, error } = await ctx.supabase
        .from("refrigeration_readings")
        .select("*")
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", input.startDate)
        .lte("submitted_at", input.endDate);

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });

      const { headers, rows } = formatRefrigerationRows(
        (data ?? []) as Parameters<typeof formatRefrigerationRows>[0],
      );
      const wb = createWorkbook();
      addWorksheet(wb, "Refrigeration", headers, rows);
      const base64 = await workbookToBase64(wb);

      return {
        base64,
        filename: `refrigeration-${input.startDate}-${input.endDate}.xlsx`,
        mimeType: XLSX_MIME,
      };
    }),

  // ─── Air Quality ─────────────────────────────────────────────────────────

  airQualityCsv: protectedProcedure
    .input(dateRangeInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.facilityId)
        throw new TRPCError({ code: "FORBIDDEN" });

      const { data, error } = await ctx.supabase
        .from("air_quality_readings")
        .select("*")
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", input.startDate)
        .lte("submitted_at", input.endDate);

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });

      const { headers, rows } = formatAirQualityRows(
        (data ?? []) as Parameters<typeof formatAirQualityRows>[0],
      );
      const csv = arrayToCsv(headers, rows);

      return {
        base64: Buffer.from(csv, "utf-8").toString("base64"),
        filename: `air-quality-${input.startDate}-${input.endDate}.csv`,
        mimeType: "text/csv",
      };
    }),

  airQualityXlsx: protectedProcedure
    .input(dateRangeInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.facilityId)
        throw new TRPCError({ code: "FORBIDDEN" });

      const { data, error } = await ctx.supabase
        .from("air_quality_readings")
        .select("*")
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", input.startDate)
        .lte("submitted_at", input.endDate);

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });

      const { headers, rows } = formatAirQualityRows(
        (data ?? []) as Parameters<typeof formatAirQualityRows>[0],
      );
      const wb = createWorkbook();
      addWorksheet(wb, "Air Quality", headers, rows);
      const base64 = await workbookToBase64(wb);

      return {
        base64,
        filename: `air-quality-${input.startDate}-${input.endDate}.xlsx`,
        mimeType: XLSX_MIME,
      };
    }),

  // ─── Incidents ────────────────────────────────────────────────────────────

  incidentsCsv: protectedProcedure
    .input(dateRangeInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.facilityId)
        throw new TRPCError({ code: "FORBIDDEN" });

      const { data, error } = await ctx.supabase
        .from("incidents")
        .select("*")
        .eq("facility_id", ctx.facilityId)
        .gte("occurred_at", input.startDate)
        .lte("occurred_at", input.endDate);

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });

      const { headers, rows } = formatIncidentRows(
        (data ?? []) as Parameters<typeof formatIncidentRows>[0],
      );
      const csv = arrayToCsv(headers, rows);

      return {
        base64: Buffer.from(csv, "utf-8").toString("base64"),
        filename: `incidents-${input.startDate}-${input.endDate}.csv`,
        mimeType: "text/csv",
      };
    }),

  incidentsXlsx: protectedProcedure
    .input(dateRangeInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.facilityId)
        throw new TRPCError({ code: "FORBIDDEN" });

      const { data, error } = await ctx.supabase
        .from("incidents")
        .select("*")
        .eq("facility_id", ctx.facilityId)
        .gte("occurred_at", input.startDate)
        .lte("occurred_at", input.endDate);

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });

      const { headers, rows } = formatIncidentRows(
        (data ?? []) as Parameters<typeof formatIncidentRows>[0],
      );
      const wb = createWorkbook();
      addWorksheet(wb, "Incidents", headers, rows);
      const base64 = await workbookToBase64(wb);

      return {
        base64,
        filename: `incidents-${input.startDate}-${input.endDate}.xlsx`,
        mimeType: XLSX_MIME,
      };
    }),
});
