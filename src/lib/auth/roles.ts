/**
 * Role hierarchy and permission utilities.
 *
 * Viewer is the read-only role added in Phase C. It can access
 * insights and alerts but cannot submit data or administer the facility.
 *
 * org_admin is orthogonal to facility roles — it is stored in
 * org_memberships, NOT in user_profiles.role. It does not appear in
 * ROLE_HIERARCHY because org-level access is checked via
 * ctx.orgRoles[orgId], not via the facility-scoped role ladder.
 *
 * Usage:
 *   import { canMutate, isViewer, isOrgAdmin, hasPermission } from "@/lib/auth/roles";
 */

export const ROLE_HIERARCHY = {
  super_admin: 5,
  admin: 4,
  manager: 3,
  staff: 2,
  viewer: 1,
} as const;

export type Role = keyof typeof ROLE_HIERARCHY;

/** Org-level membership roles — orthogonal to facility roles. */
export type OrgRole = "org_admin" | "org_viewer";

/**
 * Returns true if the user has org_admin membership in at least one org.
 * Pass ctx.orgRoles to check the full set, or check a specific org:
 *   isOrgAdmin(ctx.orgRoles['org-uuid'])
 */
export function isOrgAdmin(
  orgRoleOrMap: OrgRole | null | undefined | Record<string, OrgRole>,
): boolean {
  if (!orgRoleOrMap) return false;
  if (typeof orgRoleOrMap === "string") return orgRoleOrMap === "org_admin";
  return Object.values(orgRoleOrMap).some((r) => r === "org_admin");
}

/**
 * Returns true if `userRole` has at least the privilege level of
 * `required`. Higher numbers = more privileged.
 */
export function hasPermission(userRole: Role, required: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[required];
}

/** Returns true if the role is exactly 'viewer'. */
export function isViewer(role: Role | null | undefined): boolean {
  return role === "viewer";
}

/**
 * Returns true if the user is allowed to submit mutations (i.e. is
 * staff, manager, admin, or super_admin). Viewer and unauthenticated
 * users cannot mutate.
 */
export function canMutate(role: Role | null | undefined): boolean {
  if (!role) return false;
  return hasPermission(role, "staff");
}
