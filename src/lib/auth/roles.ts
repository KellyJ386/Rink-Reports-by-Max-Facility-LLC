/**
 * Role hierarchy and permission utilities.
 *
 * Viewer is the read-only role added in Phase C. It can access
 * insights and alerts but cannot submit data or administer the facility.
 *
 * Usage:
 *   import { canMutate, isViewer, hasPermission } from "@/lib/auth/roles";
 */

export const ROLE_HIERARCHY = {
  super_admin: 5,
  admin: 4,
  manager: 3,
  staff: 2,
  viewer: 1,
} as const;

export type Role = keyof typeof ROLE_HIERARCHY;

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
