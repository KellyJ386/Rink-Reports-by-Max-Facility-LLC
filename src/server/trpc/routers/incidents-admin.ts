import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { requireAdmin } from "@/server/trpc/routers/admin";
import type { Json } from "@/lib/database.types";
import {
  INCIDENTS_CONFIG_KEYS,
  StringList,
} from "@/modules/incidents/schema";

/**
 * Admin sub-router for the Incidents module. Mounted at
 * `admin.incidents`. There are no per-row tables to CRUD here — the
 * dropdowns the staff form uses (locations, incident types, injured-
 * person types, body regions) all live in `facility_config` rows
 * under module='incidents', one row per list.
 *
 * The admin UI calls `setList` with the new array; we validate and
 * upsert the config row. Reads happen via the existing
 * `admin.getConfig({module: "incidents"})` endpoint, same pattern as
 * the other modules.
 */
export const incidentsAdminRouter = router({
  setList: protectedProcedure
    .input(
      z.object({
        key: z.enum(INCIDENTS_CONFIG_KEYS),
        values: StringList,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const { error } = await ctx.supabase.from("facility_config").upsert(
        {
          facility_id: ctx.facilityId,
          module: "incidents",
          key: input.key,
          value: input.values as unknown as Json,
        },
        { onConflict: "facility_id,module,key" },
      );
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { ok: true as const };
    }),
});
