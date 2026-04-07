import "server-only";

import { router } from "@/server/trpc/trpc";
import { adminRouter } from "@/server/trpc/routers/admin";
import { dailyReportsRouter } from "@/server/trpc/routers/daily-reports";
import { iceOperationsRouter } from "@/server/trpc/routers/ice-operations";

export const appRouter = router({
  admin: adminRouter,
  dailyReports: dailyReportsRouter,
  iceOperations: iceOperationsRouter,
});

export type AppRouter = typeof appRouter;
