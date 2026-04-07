import "server-only";

import { router } from "@/server/trpc/trpc";
import { adminRouter } from "@/server/trpc/routers/admin";
import { dailyReportsRouter } from "@/server/trpc/routers/daily-reports";

export const appRouter = router({
  admin: adminRouter,
  dailyReports: dailyReportsRouter,
});

export type AppRouter = typeof appRouter;
