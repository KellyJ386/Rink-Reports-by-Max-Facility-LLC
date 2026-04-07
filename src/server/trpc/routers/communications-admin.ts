import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { requireAdmin } from "@/server/trpc/routers/admin";
import type { Json } from "@/lib/database.types";
import { TemperatureUnitEnum } from "@/modules/communications/schema";

/**
 * Communications admin sub-router. Mounted at admin.communications.
 *
 * Stores the facility's postal code, country code, and preferred
 * temperature unit (°F / °C) in `facility_config` rows under
 * module='communications'. The PDF generator reads them via the
 * regular admin.getConfig path on the client.
 */

const SetSettingsInput = z.object({
  postal_code: z.string().min(1).max(20),
  country: z.string().min(1).max(8),
  temp_unit: TemperatureUnitEnum,
});

export const communicationsAdminRouter = router({
  setSettings: protectedProcedure
    .input(SetSettingsInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const rows = [
        { key: "postal_code", value: input.postal_code as unknown as Json },
        { key: "country", value: input.country as unknown as Json },
        { key: "temp_unit", value: input.temp_unit as unknown as Json },
      ];
      for (const row of rows) {
        const { error } = await ctx.supabase.from("facility_config").upsert(
          {
            facility_id: ctx.facilityId,
            module: "communications",
            key: row.key,
            value: row.value,
          },
          { onConflict: "facility_id,module,key" },
        );
        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }
      }
      return { ok: true as const };
    }),
});
