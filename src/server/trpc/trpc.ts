import "server-only";

import { initTRPC, TRPCError } from "@trpc/server";

import type { TRPCContext } from "@/server/trpc/context";

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Procedure that requires an authenticated user with a resolved facility_id.
 * After this middleware runs, downstream procedures can rely on
 * `ctx.facilityId` being a non-null string. See CLAUDE.md Rule 1 + 8.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not signed in" });
  }
  if (!ctx.facilityId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "User has no facility assigned",
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      facilityId: ctx.facilityId,
    },
  });
});
