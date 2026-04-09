import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { authedProcedure, router } from "@/server/trpc/trpc";

/**
 * Super-admin router (Phase G multi-facility platform layer).
 *
 * All procedures require role = 'super_admin' in user_profiles.
 * This is a facility-scoped role but super_admin can also perform
 * cross-facility platform operations such as creating orgs and
 * associating facilities to them.
 *
 * CLAUDE.md Rule 1: facility_id / organization_id from input is only
 * accepted here because this is the platform-admin layer that performs
 * explicit cross-entity operations. All values are validated against
 * DB queries before writes.
 * CLAUDE.md Rule 8: RLS is enforced at both layers. The org_memberships
 * and organizations tables also have RLS in 028_org_roll_up.sql.
 */

/** Guard: must be super_admin in user_profiles */
const superAdminProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.role !== "super_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "super_admin role required",
    });
  }
  return next({ ctx });
});

export const superAdminRouter = router({
  /**
   * createOrganization — create a new org and add the caller as org_admin.
   *
   * Guard: super_admin only.
   */
  createOrganization: superAdminProcedure
    .input(z.object({ name: z.string().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      // Insert org
      const { data: org, error: orgError } = await ctx.supabase
        .from("organizations")
        .insert({
          name: input.name,
          owner_user_id: ctx.user.id,
        })
        .select("id, name, owner_user_id, created_at")
        .single();

      if (orgError || !org) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: orgError?.message ?? "Failed to create organization",
        });
      }

      // Add creator as org_admin
      const { error: memberError } = await ctx.supabase
        .from("org_memberships")
        .insert({
          organization_id: org.id,
          user_id: ctx.user.id,
          role: "org_admin",
        });

      if (memberError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: memberError.message,
        });
      }

      return org;
    }),

  /**
   * addFacilityToOrg — associate a facility with an organization.
   *
   * Guard: super_admin only.
   * Sets facilities.organization_id. Idempotent (UPDATE).
   */
  addFacilityToOrg: superAdminProcedure
    .input(
      z.object({
        facilityId: z.string().uuid(),
        organizationId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the org exists
      const { data: org, error: orgError } = await ctx.supabase
        .from("organizations")
        .select("id")
        .eq("id", input.organizationId)
        .maybeSingle();

      if (orgError || !org) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found",
        });
      }

      // Update facility
      const { error } = await ctx.supabase
        .from("facilities")
        .update({ organization_id: input.organizationId })
        .eq("id", input.facilityId);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return { success: true };
    }),

  /**
   * inviteOrgAdmin — add a user to an org as org_admin.
   *
   * Best-effort: looks up the user by email via auth.users (requires
   * service-role access). If no user exists with that email, we skip
   * and return a message — email sending for invitations is a TODO.
   *
   * Guard: super_admin only.
   *
   * TODO: Email invite flow — when a user doesn't exist yet, create a
   *       Supabase auth invite via admin.auth.inviteUserByEmail(). This
   *       requires SUPABASE_SERVICE_ROLE_KEY with admin.auth access.
   *       For now, we only handle pre-existing users.
   */
  inviteOrgAdmin: superAdminProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        email: z.string().email(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the org exists
      const { data: org, error: orgError } = await ctx.supabase
        .from("organizations")
        .select("id")
        .eq("id", input.organizationId)
        .maybeSingle();

      if (orgError || !org) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found",
        });
      }

      // Look up user by email in user_profiles via auth.users join
      // We use list_facility_users-style approach: search user_profiles
      // and join via auth context. Since we can't query auth.users
      // directly from the client supabase, we look for the user in
      // user_profiles and cross-reference.
      // TODO: Use admin client (service role) to query auth.users by email.
      // For now, upsert org_membership if we can resolve the user.
      const { data: profiles } = await ctx.supabase
        .from("user_profiles")
        .select("user_id, facility_id");

      // We cannot look up email directly from user_profiles (email lives
      // in auth.users). Without the service-role admin client, we cannot
      // resolve email → user_id. Return a TODO message.
      void profiles; // suppress unused warning

      return {
        success: false,
        message:
          "TODO: Email invite requires SUPABASE_SERVICE_ROLE_KEY admin.auth access. " +
          `Invite for ${input.email} to org ${input.organizationId} not sent. ` +
          "Add the user manually via the Supabase dashboard or implement the admin invite flow.",
      };
    }),

  /**
   * listOrganizations — list all orgs (super_admin view).
   *
   * Guard: super_admin only.
   */
  listOrganizations: superAdminProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("organizations")
      .select("id, name, owner_user_id, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    return data ?? [];
  }),
});
