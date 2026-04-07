import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { dailyReportsAdminRouter } from "@/server/trpc/routers/daily-reports-admin";
import { iceOperationsAdminRouter } from "@/server/trpc/routers/ice-operations-admin";
import { refrigerationAdminRouter } from "@/server/trpc/routers/refrigeration-admin";
import { airQualityAdminRouter } from "@/server/trpc/routers/air-quality-admin";
import { iceDepthAdminRouter } from "@/server/trpc/routers/ice-depth-admin";
import { incidentsAdminRouter } from "@/server/trpc/routers/incidents-admin";
import { schedulingAdminRouter } from "@/server/trpc/routers/scheduling-admin";
import { communicationsAdminRouter } from "@/server/trpc/routers/communications-admin";
import { shiftsAdminRouter } from "@/server/trpc/routers/shifts-admin";
import { brandingAdminRouter } from "@/server/trpc/routers/branding-admin";

/**
 * Admin Control Center API.
 *
 * - facility_id is taken from `ctx.facilityId` (CLAUDE.md Rule 1).
 *   No input schema below contains a `facility_id` field.
 * - All config values live in `facility_config`. Modules read this
 *   only via the `useModuleConfig` hook (Rule 2).
 * - No business-data seeds, no defaults, no mocks (Rules 4 & 6).
 * - Procedures that mutate facility-wide state additionally require
 *   the caller to be an admin in their facility. The check is done
 *   here in TS for clean error messages, but RLS at the database
 *   would also reject non-admin writes (Rule 8).
 */

const ConfigKeyInput = z.object({
  module: z.string().min(1),
  key: z.string().min(1),
});

const SetConfigInput = ConfigKeyInput.extend({
  value: z.unknown(),
});

const UpdateFacilityInput = z.object({
  // Profile basics
  name:           z.string().min(1).max(200),
  timezone:       z.string().min(1).max(64),
  // Address (every field optional so partial updates work)
  address_line1:  z.string().max(200).nullable().optional(),
  address_line2:  z.string().max(200).nullable().optional(),
  city:           z.string().max(120).nullable().optional(),
  state:          z.string().max(80).nullable().optional(),
  postal_code:    z.string().max(20).nullable().optional(),
  country:        z.string().min(1).max(8).optional(),
  // Contact
  contact_email:  z.string().email().max(200).nullable().optional(),
  contact_phone:  z.string().max(40).nullable().optional(),
  // Unit preferences
  temp_unit:      z.enum(["f", "c"]).optional(),
  length_unit:    z.enum(["in", "mm"]).optional(),
});

const SetModuleEnabledInput = z.object({
  module: z.string().min(1),
  enabled: z.boolean(),
});

// 'super_admin' was added in migration 014. The platform treats it
// as strictly more privileged than 'admin'.
const UserRoleEnum = z.enum(["super_admin", "admin", "manager", "staff", "viewer"]);

const UpdateUserRoleInput = z.object({
  user_id: z.string().uuid(),
  role: UserRoleEnum,
});

/**
 * Throws FORBIDDEN unless the caller's user_profiles.role is at
 * least 'admin' for their facility. After migration 014 the
 * 'super_admin' role is also accepted (super_admin is strictly
 * more privileged than admin). Used by every mutation that touches
 * facility configuration or other users. Exported so per-module
 * sub-routers can reuse it.
 */
export async function requireAdmin(ctx: {
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/lib/database.types").Database
  >;
  user: { id: string };
}): Promise<void> {
  const { data: profile, error } = await ctx.supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  if (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: error.message,
    });
  }
  if (
    !profile ||
    (profile.role !== "admin" && profile.role !== "super_admin")
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin role required",
    });
  }
}

export const adminRouter = router({
  // -------------------------------------------------------------------
  // Module config (Phase 0 — already in production)
  // -------------------------------------------------------------------

  /**
   * Return all config rows for the caller's facility, optionally
   * filtered to a single module. Empty array if nothing is set —
   * modules render an empty state in that case.
   */
  getConfig: protectedProcedure
    .input(z.object({ module: z.string().min(1).optional() }).optional())
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("facility_config")
        .select("module, key, value")
        .eq("facility_id", ctx.facilityId);

      if (input?.module) {
        query = query.eq("module", input.module);
      }

      const { data, error } = await query;
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return data ?? [];
    }),

  /**
   * Upsert a single config row. Admin UI calls this for every
   * field on every panel. No bulk endpoint here — keep it simple.
   */
  setConfig: protectedProcedure
    .input(SetConfigInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const { error } = await ctx.supabase.from("facility_config").upsert({
        facility_id: ctx.facilityId,
        module: input.module,
        key: input.key,
        // Cast to the JSON column type. The runtime value is whatever
        // the admin entered; the Zod schema above only guarantees it
        // is JSON-serialisable when called from a browser.
        value: input.value as never,
      });
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { ok: true as const };
    }),

  // -------------------------------------------------------------------
  // Phase 1 — facility settings
  // -------------------------------------------------------------------

  /**
   * Return the caller's facility row with the full Facility Profile
   * surface (address, contact, unit preferences). Used by the
   * Facility Profile card in the Admin Control Center.
   */
  getFacility: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("facilities")
      .select(
        "id, name, timezone, address_line1, address_line2, city, state, postal_code, country, contact_email, contact_phone, temp_unit, length_unit, updated_at",
      )
      .eq("id", ctx.facilityId)
      .maybeSingle();

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }
    if (!data) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Facility not found",
      });
    }
    return data;
  }),

  /**
   * Update the Facility Profile. Admin only. Every field except
   * name + timezone is optional so the form can save partial
   * updates without clobbering unrelated columns.
   */
  updateFacility: protectedProcedure
    .input(UpdateFacilityInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      const patch: Record<string, unknown> = {
        name: input.name,
        timezone: input.timezone,
      };
      if (input.address_line1 !== undefined) patch.address_line1 = input.address_line1;
      if (input.address_line2 !== undefined) patch.address_line2 = input.address_line2;
      if (input.city          !== undefined) patch.city          = input.city;
      if (input.state         !== undefined) patch.state         = input.state;
      if (input.postal_code   !== undefined) patch.postal_code   = input.postal_code;
      if (input.country       !== undefined) patch.country       = input.country;
      if (input.contact_email !== undefined) patch.contact_email = input.contact_email;
      if (input.contact_phone !== undefined) patch.contact_phone = input.contact_phone;
      if (input.temp_unit     !== undefined) patch.temp_unit     = input.temp_unit;
      if (input.length_unit   !== undefined) patch.length_unit   = input.length_unit;

      const { error } = await ctx.supabase
        .from("facilities")
        .update(patch)
        .eq("id", ctx.facilityId);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { ok: true as const };
    }),

  // -------------------------------------------------------------------
  // Phase 1 — module toggles
  // -------------------------------------------------------------------

  /**
   * Return one row per known module slug, joined with
   * facility_modules to know whether the caller's facility has
   * each module enabled. Slugs come from the public.known_modules()
   * function so the list is sourced from the database, not from
   * a hardcoded TS array (Rule 2).
   */
  listModules: protectedProcedure.query(async ({ ctx }) => {
    const { data: known, error: knownErr } = await ctx.supabase
      .rpc("known_modules");
    if (knownErr) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: knownErr.message,
      });
    }

    const { data: rows, error: rowsErr } = await ctx.supabase
      .from("facility_modules")
      .select("module, enabled")
      .eq("facility_id", ctx.facilityId);
    if (rowsErr) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: rowsErr.message,
      });
    }

    const enabledMap = new Map<string, boolean>();
    for (const row of rows ?? []) {
      enabledMap.set(row.module, row.enabled);
    }

    const knownList = (known ?? []) as readonly string[];
    return knownList.map((module) => ({
      module,
      enabled: enabledMap.get(module) ?? false,
      known: true as const,
    }));
  }),

  /**
   * Flip the enabled flag on a single facility_modules row.
   * Admin only. Upsert because the row may not yet exist for
   * facilities created after a new module slug was added.
   */
  setModuleEnabled: protectedProcedure
    .input(SetModuleEnabledInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const { error } = await ctx.supabase.from("facility_modules").upsert({
        facility_id: ctx.facilityId,
        module: input.module,
        enabled: input.enabled,
      });
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { ok: true as const };
    }),

  // -------------------------------------------------------------------
  // Phase 1 — user management
  // -------------------------------------------------------------------

  /**
   * Return every user in the caller's facility. Backed by the
   * SECURITY DEFINER `list_facility_users()` function which itself
   * gates on `get_user_role() = 'admin'`. The TS-side requireAdmin
   * is for clean error messages — non-admins get a 403 instead of
   * a silently-empty array.
   */
  listUsers: protectedProcedure.query(async ({ ctx }) => {
    await requireAdmin(ctx);
    const { data, error } = await ctx.supabase.rpc("list_facility_users");
    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }
    return data ?? [];
  }),

  /**
   * Return the calling user's own profile (id, role, full_name).
   * Open to any authenticated user — used by client UIs that need
   * to gate sub-features on the caller's role (e.g. the Scheduling
   * editor tab is manager+admin only).
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("user_profiles")
      .select("user_id, full_name, role, facility_id")
      .eq("user_id", ctx.user.id)
      .maybeSingle();
    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }
    if (!data) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Profile not found",
      });
    }
    return data;
  }),

  /**
   * Update a user's role within the caller's facility.
   *
   * Three guards:
   *   1. Caller must be admin (requireAdmin).
   *   2. Caller cannot change their own role (the UI also disables
   *      this, but enforced server-side too).
   *   3. The target user must already belong to the caller's facility
   *      (the UPDATE WHERE clause filters on facility_id).
   */
  updateUserRole: protectedProcedure
    .input(UpdateUserRoleInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      if (input.user_id === ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot change your own role",
        });
      }

      const { error } = await ctx.supabase
        .from("user_profiles")
        .update({ role: input.role })
        .eq("user_id", input.user_id)
        .eq("facility_id", ctx.facilityId);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { ok: true as const };
    }),

  // -------------------------------------------------------------------
  // Module sub-routers
  // -------------------------------------------------------------------

  /**
   * Daily Reports admin sub-router. Lives in
   * src/server/trpc/routers/daily-reports-admin.ts.
   *
   * Client calls: trpc.admin.dailyReports.listChecklists.useQuery()
   * and friends. Each module phase mounts its own admin sub-router
   * here so the top-level admin router stays tidy.
   */
  dailyReports: dailyReportsAdminRouter,

  /**
   * Ice Operations admin sub-router. Lives in
   * src/server/trpc/routers/ice-operations-admin.ts.
   *
   * Client calls: trpc.admin.iceOperations.listOperationTypes.useQuery()
   * and friends. Manages operation types, their fields, and equipment.
   */
  iceOperations: iceOperationsAdminRouter,

  /**
   * Refrigeration admin sub-router. Mounted as
   * `admin.refrigeration`. Manages compressors and the threshold map
   * for facility-specific normal operating ranges.
   */
  refrigeration: refrigerationAdminRouter,

  /**
   * Air Quality admin sub-router. Mounted as `admin.airQuality`.
   * Manages regulatory limits, working thresholds, and per-tier
   * action protocol text.
   */
  airQuality: airQualityAdminRouter,

  /**
   * Ice Depth admin sub-router. Mounted as `admin.iceDepth`.
   * Manages up to 8 measurement templates per facility, each with
   * a unit ('in' or 'mm') and up to 60 numbered (x, y) points.
   */
  iceDepth: iceDepthAdminRouter,

  /**
   * Incidents admin sub-router. Mounted as `admin.incidents`.
   * Manages the four facility-config string lists that drive the
   * staff form dropdowns: locations, incident types, injured-person
   * types, and body region labels.
   */
  incidents: incidentsAdminRouter,

  /**
   * Scheduling admin sub-router. Mounted as `admin.scheduling`.
   * Manages positions, certifications, the position→cert junction,
   * and the staff→cert junction. Schedule + shift mutations live on
   * the top-level scheduling router (manager + admin).
   */
  scheduling: schedulingAdminRouter,

  /**
   * Communications admin sub-router. Mounted as `admin.communications`.
   * Manages the facility's postal code, country, and preferred
   * temperature unit (used by the Universal Module Header on PDFs).
   */
  communications: communicationsAdminRouter,

  /**
   * Shift Configuration sub-router (mounted as `admin.shifts`).
   * Manages the facility-wide named shift catalog used by both
   * Refrigeration and Scheduling — Admin Control Center spec
   * section 9.
   */
  shifts: shiftsAdminRouter,

  /**
   * Branding & Display sub-router (mounted as `admin.branding`).
   * Manages the facility logo (in the 'branding' Storage bucket),
   * brand colors, and the optional PDF header override — Admin
   * Control Center spec section 10.
   */
  branding: brandingAdminRouter,

  // -------------------------------------------------------------------
  // Phase D — retention policy
  // -------------------------------------------------------------------

  /**
   * Return the per-module retention policy for the caller's facility.
   * Defaults to sensible values if the facility has no row or the
   * retention_policies column is NULL.
   *
   * incidents and airQualityReadings are always null (compliance —
   * never deleted regardless of config).
   */
  getRetentionPolicies: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.facilityId) throw new TRPCError({ code: "FORBIDDEN" });
    const { data } = await ctx.supabase
      .from("facility_config")
      .select("retention_policies")
      .eq("facility_id", ctx.facilityId)
      .maybeSingle();
    return (data?.retention_policies ?? {
      dailyReports: 365,
      iceOperations: 365,
      refrigerationReadings: 730,
      airQualityReadings: null,
      iceDepthSessions: 365,
      incidents: null,
    });
  }),

  /**
   * Update the per-module retention policy for the caller's facility.
   * Admin only. Rules:
   *   - Each numeric field must be >= 365 (admin can only increase).
   *   - incidents and airQualityReadings must always be null —
   *     compliance records are never deleted.
   */
  updateRetentionPolicies: protectedProcedure
    .input(
      z.object({
        dailyReports: z.number().int().min(365),
        iceOperations: z.number().int().min(365),
        refrigerationReadings: z.number().int().min(365),
        iceDepthSessions: z.number().int().min(365),
        // Compliance — admin cannot change these
        airQualityReadings: z.null(),
        incidents: z.null(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.facilityId) throw new TRPCError({ code: "FORBIDDEN" });
      await requireAdmin(ctx);
      // retention_policies is a JSONB column on facility_config rows.
      // We update all config rows for this facility in one call — the
      // column value is the same regardless of (module, key).
      const { error } = await ctx.supabase
        .from("facility_config")
        .update({ retention_policies: input as unknown as import("@/lib/database.types").Json })
        .eq("facility_id", ctx.facilityId);
      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      return { ok: true as const };
    }),
});
