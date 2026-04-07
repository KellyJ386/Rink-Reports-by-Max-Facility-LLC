import "server-only";

import { router } from "@/server/trpc/trpc";
import { adminRouter } from "@/server/trpc/routers/admin";
import { dailyReportsRouter } from "@/server/trpc/routers/daily-reports";
import { iceOperationsRouter } from "@/server/trpc/routers/ice-operations";
import { refrigerationRouter } from "@/server/trpc/routers/refrigeration";
import { airQualityRouter } from "@/server/trpc/routers/air-quality";
import { iceDepthRouter } from "@/server/trpc/routers/ice-depth";
import { incidentsRouter } from "@/server/trpc/routers/incidents";
import { schedulingRouter } from "@/server/trpc/routers/scheduling";
import { communicationsRouter } from "@/server/trpc/routers/communications";
import { onboardingRouter } from "@/server/trpc/routers/onboarding";
import { billingRouter } from "@/server/trpc/routers/billing";
import { alertsRouter } from "@/server/trpc/routers/alerts";
import { notificationsRouter } from "@/server/trpc/routers/notifications";

export const appRouter = router({
  admin: adminRouter,
  dailyReports: dailyReportsRouter,
  iceOperations: iceOperationsRouter,
  refrigeration: refrigerationRouter,
  airQuality: airQualityRouter,
  iceDepth: iceDepthRouter,
  incidents: incidentsRouter,
  scheduling: schedulingRouter,
  communications: communicationsRouter,
  onboarding: onboardingRouter,
  billing: billingRouter,
  alerts: alertsRouter,
  notifications: notificationsRouter,
});

export type AppRouter = typeof appRouter;
