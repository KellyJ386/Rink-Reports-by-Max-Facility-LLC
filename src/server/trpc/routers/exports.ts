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
import { generateDailyReportPdf } from "@/server/pdf/generators/dailyReport";
import { generateIceOperationsPdf } from "@/server/pdf/generators/iceOperations";
import { generateRefrigerationPdf } from "@/server/pdf/generators/refrigeration";
import { generateAirQualityPdf } from "@/server/pdf/generators/airQuality";
import { generateIncidentsPdf } from "@/server/pdf/generators/incidents";
import {
  REFRIGERATION_FIELDS,
  toCompressorReadings,
} from "@/modules/refrigeration/schema";
import { ReportInput } from "@/modules/incidents/schema";
import type {
  IncidentReportEntry,
  BodyMarkerEntry,
} from "@/server/pdf/generators/incidents";

const dateRangeInput = z.object({
  startDate: z.string(),
  endDate: z.string(),
});

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function facilityGuard(facilityId: string | null): asserts facilityId is string {
  if (!facilityId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No facility assigned" });
  }
}

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
  // -----------------------------------------------------------------------
  // Daily Report PDF
  // -----------------------------------------------------------------------
  dailyReportPdf: protectedProcedure
    .input(z.object({ reportDate: z.string() }))
    .mutation(async ({ ctx, input }) => {
      facilityGuard(ctx.facilityId);

      // Fetch facility name
      const { data: facility } = await ctx.supabase
        .from("facilities")
        .select("name")
        .eq("id", ctx.facilityId)
        .maybeSingle();

      // Fetch all daily_reports rows for that date, joined with checklist names
      const { data: reports, error } = await ctx.supabase
        .from("daily_reports")
        .select(
          "id, checklist_id, submitted_at, submitted_by, answers, daily_report_checklists(name)",
        )
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", `${input.reportDate}T00:00:00.000Z`)
        .lte("submitted_at", `${input.reportDate}T23:59:59.999Z`)
        .order("submitted_at", { ascending: true });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // Group by checklist into tabs
      const tabMap = new Map<
        string,
        { name: string; fields: Array<{ label: string; value: string }> }
      >();

      for (const row of reports ?? []) {
        const checklistName =
          (
            row.daily_report_checklists as
              | { name: string }
              | null
          )?.name ?? row.checklist_id;

        if (!tabMap.has(row.checklist_id)) {
          tabMap.set(row.checklist_id, { name: checklistName, fields: [] });
        }

        const tab = tabMap.get(row.checklist_id)!;
        const answers =
          row.answers &&
          typeof row.answers === "object" &&
          !Array.isArray(row.answers)
            ? (row.answers as Record<string, unknown>)
            : {};

        for (const [key, val] of Object.entries(answers)) {
          tab.fields.push({
            label: key,
            value: val !== null && val !== undefined ? String(val) : "—",
          });
        }
      }

      const tabs = Array.from(tabMap.values());

      const base64 = await generateDailyReportPdf({
        facilityName: facility?.name ?? "",
        reportDate: input.reportDate,
        tabs,
        submittedBy: "",
      });

      return {
        base64,
        filename: `daily-report-${ctx.facilityId}-${input.reportDate}.pdf`,
      };
    }),

  // -----------------------------------------------------------------------
  // Ice Operations PDF
  // -----------------------------------------------------------------------
  iceOperationsPdf: protectedProcedure
    .input(dateRangeInput)
    .mutation(async ({ ctx, input }) => {
      facilityGuard(ctx.facilityId);

      const { data: facility } = await ctx.supabase
        .from("facilities")
        .select("name")
        .eq("id", ctx.facilityId)
        .maybeSingle();

      // Fetch operations with joined type name and equipment name
      const { data: ops, error } = await ctx.supabase
        .from("ice_operations")
        .select(
          "id, submitted_at, submitted_by, answers, ice_operation_types(name), ice_equipment(name)",
        )
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", `${input.startDate}T00:00:00.000Z`)
        .lte("submitted_at", `${input.endDate}T23:59:59.999Z`)
        .order("submitted_at", { ascending: true });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const operations = (ops ?? []).map((row) => {
        const answers =
          row.answers &&
          typeof row.answers === "object" &&
          !Array.isArray(row.answers)
            ? (row.answers as Record<string, unknown>)
            : {};
        const notes = Object.values(answers)
          .filter((v) => v !== null && v !== undefined)
          .map(String)
          .join("; ");

        return {
          date: new Date(row.submitted_at).toLocaleString(),
          operation:
            (row.ice_operation_types as { name: string } | null)?.name ?? "—",
          equipment:
            (row.ice_equipment as { name: string } | null)?.name ?? "—",
          operator: row.submitted_by,
          notes,
        };
      });

      const dateRange = `${input.startDate} – ${input.endDate}`;
      const base64 = await generateIceOperationsPdf({
        facilityName: facility?.name ?? "",
        dateRange,
        operations,
      });

      return {
        base64,
        filename: `ice-operations-${ctx.facilityId}-${input.startDate}-${input.endDate}.pdf`,
      };
    }),

  // -----------------------------------------------------------------------
  // Refrigeration PDF
  // -----------------------------------------------------------------------
  refrigerationPdf: protectedProcedure
    .input(dateRangeInput)
    .mutation(async ({ ctx, input }) => {
      facilityGuard(ctx.facilityId);

      const { data: facility } = await ctx.supabase
        .from("facilities")
        .select("name")
        .eq("id", ctx.facilityId)
        .maybeSingle();

      // Fetch compressor names for lookup
      const { data: compressors } = await ctx.supabase
        .from("refrigeration_compressors")
        .select("id, name")
        .eq("facility_id", ctx.facilityId)
        .eq("active", true)
        .order("position", { ascending: true });

      const compressorNameById = new Map(
        (compressors ?? []).map((c) => [c.id, c.name]),
      );

      // Fetch readings
      const { data: rows, error } = await ctx.supabase
        .from("refrigeration_readings")
        .select(
          "id, submitted_at, submitted_by, brine_supply, brine_return, brine_flow, ice_surface_temp, condenser_temp, compressor_readings",
        )
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", `${input.startDate}T00:00:00.000Z`)
        .lte("submitted_at", `${input.endDate}T23:59:59.999Z`)
        .order("submitted_at", { ascending: true });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const facilityFieldDefs = REFRIGERATION_FIELDS.filter(
        (f) => f.scope === "facility",
      );
      const compressorFieldDefs = REFRIGERATION_FIELDS.filter(
        (f) => f.scope === "compressor",
      );

      const readings = (rows ?? []).map((row) => {
        const crRows = toCompressorReadings(row.compressor_readings);
        return {
          submittedAt: new Date(row.submitted_at).toLocaleString(),
          submittedBy: row.submitted_by,
          facilityFields: facilityFieldDefs.map((f) => ({
            label: f.label,
            unit: f.unit,
            value:
              (row as unknown as Record<string, number | null>)[f.key] ?? null,
          })),
          compressorReadings: crRows.map((cr) => ({
            compressorName:
              compressorNameById.get(cr.compressor_id) ?? cr.compressor_id,
            fields: compressorFieldDefs.map((f) => ({
              label: f.label,
              unit: f.unit,
              value:
                (cr as unknown as Record<string, number | null>)[f.key] ?? null,
            })),
          })),
        };
      });

      const dateRange = `${input.startDate} – ${input.endDate}`;
      const base64 = await generateRefrigerationPdf({
        facilityName: facility?.name ?? "",
        dateRange,
        readings,
        normalRanges: {},
      });

      return {
        base64,
        filename: `refrigeration-${ctx.facilityId}-${input.startDate}-${input.endDate}.pdf`,
      };
    }),

  // -----------------------------------------------------------------------
  // Air Quality PDF
  // -----------------------------------------------------------------------
  airQualityPdf: protectedProcedure
    .input(dateRangeInput)
    .mutation(async ({ ctx, input }) => {
      facilityGuard(ctx.facilityId);

      const { data: facility } = await ctx.supabase
        .from("facilities")
        .select("name")
        .eq("id", ctx.facilityId)
        .maybeSingle();

      const { data: rows, error } = await ctx.supabase
        .from("air_quality_readings")
        .select("id, submitted_at, co_ppm, no2_ppm, tier, notes")
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", `${input.startDate}T00:00:00.000Z`)
        .lte("submitted_at", `${input.endDate}T23:59:59.999Z`)
        .order("submitted_at", { ascending: true });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const readings = (rows ?? []).map((row) => ({
        timestamp: new Date(row.submitted_at).toLocaleString(),
        co: Number(row.co_ppm),
        no2: Number(row.no2_ppm),
        tier: row.tier as "normal" | "caution" | "action" | "evacuate",
        actionTaken: row.notes ?? "",
      }));

      const dateRange = `${input.startDate} – ${input.endDate}`;
      const base64 = await generateAirQualityPdf({
        facilityName: facility?.name ?? "",
        dateRange,
        readings,
      });

      return {
        base64,
        filename: `air-quality-${ctx.facilityId}-${input.startDate}-${input.endDate}.pdf`,
      };
    }),

  // -----------------------------------------------------------------------
  // Incidents PDF
  // -----------------------------------------------------------------------
  incidentsPdf: protectedProcedure
    .input(dateRangeInput)
    .mutation(async ({ ctx, input }) => {
      facilityGuard(ctx.facilityId);

      const { data: facility } = await ctx.supabase
        .from("facilities")
        .select("name")
        .eq("id", ctx.facilityId)
        .maybeSingle();

      const { data: rows, error } = await ctx.supabase
        .from("incidents")
        .select(
          "id, kind, occurred_at, location, incident_type, description, data, submitted_by",
        )
        .eq("facility_id", ctx.facilityId)
        .gte("occurred_at", `${input.startDate}T00:00:00.000Z`)
        .lte("occurred_at", `${input.endDate}T23:59:59.999Z`)
        .order("occurred_at", { ascending: true });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const incidents: IncidentReportEntry[] = (rows ?? []).map((row) => {
        const parsed = ReportInput.safeParse(row.data);
        const base: IncidentReportEntry = {
          kind: row.kind === "accident" ? "accident" : "incident",
          occurredAt: new Date(row.occurred_at).toLocaleString(),
          reportedBy: row.submitted_by,
          location: row.location,
          incidentType: row.incident_type,
          description: row.description,
          followUpRequired: false,
        };

        if (parsed.success) {
          const d = parsed.data;
          base.personsInvolved = d.persons_involved;
          base.witnesses = d.witnesses;
          base.immediateAction = d.immediate_action;
          base.followUpRequired = d.follow_up_required;
          base.followUpNotes = d.follow_up_notes;

          if (d.kind === "accident") {
            base.injuredName = d.injured_name;
            base.injuredType = d.injured_type;
            base.injuredAge = d.injured_age;
            base.natureOfInjury = d.nature_of_injury;
            base.bodyMarkers = d.body_markers.map(
              (m): BodyMarkerEntry => ({
                view: m.view,
                label: m.label,
              }),
            );
            base.firstAidAdministered = d.first_aid_administered;
            base.firstAidDetails = d.first_aid_details;
            base.emsCalled = d.ems_called;
            base.emsDetails = d.ems_details;
            base.transportedToHospital = d.transported_to_hospital;
            base.hospitalName = d.hospital_name;
          }
        }

        return base;
      });

      const dateRange = `${input.startDate} – ${input.endDate}`;
      const base64 = await generateIncidentsPdf({
        facilityName: facility?.name ?? "",
        dateRange,
        incidents,
      });

      return {
        base64,
        filename: `incidents-${ctx.facilityId}-${input.startDate}-${input.endDate}.pdf`,
      };
    }),
});
