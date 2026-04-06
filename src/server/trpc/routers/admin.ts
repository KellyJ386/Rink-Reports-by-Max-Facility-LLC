import "server-only";

import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";

/**
 * Admin Control Center API.
 *
 * - facility_id is taken from `ctx.facilityId` (CLAUDE.md Rule 1).
 *   No input schema below contains a `facility_id` field.
 * - All config values live in `facility_config`. Modules read this
 *   only via the `useModuleConfig` hook (Rule 2).
 * - No business-data seeds, no defaults, no mocks (Rules 4 & 6).
 */

const ConfigKeyInput = z.object({
  module: z.string().min(1),
  key: z.string().min(1),
});

const UpsertConfigInput = ConfigKeyInput.extend({
  value: z.unknown(),
});

export const adminRouter = router({
  /**
   * Return all config rows for the caller's facility, optionally
   * filtered to a single module. Empty array if nothing is set —
   * modules render an empty state in that case.
   */
  getFacilityConfig: protectedProcedure
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
        throw new Error(error.message);
      }
      return data ?? [];
    }),

  /**
   * Upsert a single config row. Admin UI calls this for every
   * field on every panel. No bulk endpoint here — keep it simple.
   */
  upsertFacilityConfig: protectedProcedure
    .input(UpsertConfigInput)
    .mutation(async ({ ctx, input }) => {
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
        throw new Error(error.message);
      }
      return { ok: true as const };
    }),
});
