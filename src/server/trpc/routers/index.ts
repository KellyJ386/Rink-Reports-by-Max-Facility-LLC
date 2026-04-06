import "server-only";

import { router } from "@/server/trpc/trpc";
import { adminRouter } from "@/server/trpc/routers/admin";

export const appRouter = router({
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
