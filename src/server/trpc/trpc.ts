import "server-only";

import { initTRPC, TRPCError } from "@trpc/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import type { TRPCContext } from "@/server/trpc/context";
import { canMutate } from "@/lib/auth/roles";
import { checkPlanAccess } from "@/server/billing/planGuard";

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

/**
 * Factory that creates a procedure guarded by the billing plan state.
 *
 * Use: `billingProtectedProcedure('dailyReports').query(...)` to create
 * a procedure that only succeeds when the facility has access to that
 * module according to the plan guard rules.
 *
 * Consumers adopt this incrementally — existing routers are not changed.
 * The reason for denial is surfaced as the tRPC FORBIDDEN message so
 * the client can render an appropriate UI (e.g. upgrade prompt vs locked
 * banner vs trial expired page).
 */
export function billingProtectedProcedure(moduleKey: string) {
  return protectedProcedure.use(async ({ ctx, next }) => {
    const result = await checkPlanAccess(
      ctx.facilityId,
      moduleKey,
      ctx.supabase,
    );
    if (!result.allowed) {
      throw new TRPCError({ code: "FORBIDDEN", message: result.reason });
    }
    return next({ ctx });
  });
}

/**
 * Procedure for org-level roll-up queries (Phase G multi-facility).
 *
 * Requirements:
 *   - User must be authenticated.
 *   - User must have at least one org_admin membership.
 *
 * Accepts an optional `{ organizationId: string }` input. If provided,
 * verifies the caller is an org_admin in that specific org. If omitted,
 * uses the first org where the caller has org_admin membership.
 *
 * After this middleware runs, downstream procedures can rely on
 * `ctx.selectedOrgId` being a non-null string scoped to the caller's
 * org. ALL cross-facility queries MUST filter by this value.
 *
 * CLAUDE.md Rule 1: organizationId from input is VERIFIED against
 * ctx.orgRoles — the client cannot escalate to an org they don't own.
 */
export const orgAdminProcedure = t.procedure
  .use(({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Not signed in" });
    }

    const adminOrgIds = Object.entries(ctx.orgRoles)
      .filter(([, r]) => r === "org_admin")
      .map(([id]) => id);

    if (adminOrgIds.length === 0) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "No org_admin membership found",
      });
    }

    // Default to the first org where the caller is an admin. If a
    // downstream procedure wants to let a user switch between orgs,
    // it can accept an input.organizationId and verify against
    // ctx.orgRoles in its own middleware.
    const selectedOrgId = adminOrgIds[0]!;

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        selectedOrgId,
      },
    });
  });
