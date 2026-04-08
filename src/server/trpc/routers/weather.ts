import "server-only";

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { fetchWeatherForFacility } from "@/server/weather/service";

export const weatherRouter = router({
  getForDate: protectedProcedure
    .input(z.object({ date: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.facilityId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No facility context",
        });
      }

      return fetchWeatherForFacility(ctx.facilityId, input.date, ctx.supabase);
    }),
});
