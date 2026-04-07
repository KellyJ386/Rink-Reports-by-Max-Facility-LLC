import "server-only";

import { initTRPC, TRPCError } from "@trpc/server";
import * as Sentry from "@sentry/nextjs";

import type { TRPCContext } from "@/server/trpc/context";
import { canMutate } from "@/lib/auth/roles";

const t = initTRPC.context<TRPCContext>().create({
  errorFormatter({ shape, error }) {
    if (shape.data?.code === "INTERNAL_SERVER_ERROR") {
      Sentry.captureException(error);
    }
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Procedure that requires an authenticated user but NOT a facility.
 * Used by Phase 6 onboarding — a freshly-signed-up user has a
 * Supabase Auth session but no `user_profiles` row yet, so they
 * can't satisfy the facilityId guard until they pick a facility name.
 */
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not signed in" });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

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

/**
 * Procedure that blocks mutations for viewer-role users.
 *
 * Extends `protectedProcedure`: all auth + facility checks still
 * apply. In addition, any mutation attempted by a viewer is rejected
 * with FORBIDDEN. Queries are allowed — viewers can read data.
 *
 * Use this on any router procedure that is exposed to viewer-role
 * users but must not allow writes (e.g. alerts.list is a query and
 * is fine; alerts.resolve is a mutation and must block viewers).
 *
 * Prefer `protectedProcedure` for procedures that viewers should
 * never reach at all (admin, data-entry forms).
 */
export const viewerProcedure = protectedProcedure.use(({ ctx, next, type }) => {
  if (type === "mutation" && !canMutate(ctx.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Viewer role cannot perform mutations",
    });
  }
  return next({ ctx });
});
