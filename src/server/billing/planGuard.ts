import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Plan guard for billing-protected tRPC procedures.
 *
 * Reads plan_status, trial_ends_at, past_due_since, and enabled_modules
 * from facility_config and returns an access decision.
 *
 * The state machine:
 *   - cancelled    → always denied
 *   - locked       → always denied (past_due > 7 days or unpaid/incomplete)
 *   - trial        → allowed if trial_ends_at > now, denied if expired
 *   - past_due     → allowed for 7-day grace, denied after
 *   - active       → allowed if the requested module is enabled
 */

export type PlanGuardReason =
  | "active"
  | "trial_valid"
  | "trial_expired"
  | "past_due_grace"
  | "past_due_locked"
  | "cancelled"
  | "module_disabled";

export interface PlanGuardResult {
  allowed: boolean;
  reason: PlanGuardReason;
}

const PAST_DUE_GRACE_DAYS = 7;

export async function checkPlanAccess(
  facilityId: string,
  moduleKey: string,
  supabase: SupabaseClient<Database>,
): Promise<PlanGuardResult> {
  const { data } = await supabase
    .from("facility_config")
    .select("plan_status, trial_ends_at, past_due_since, enabled_modules")
    .eq("facility_id", facilityId)
    .limit(1)
    .maybeSingle();

  // If facility_config row is missing, fail closed.
  if (!data) {
    return { allowed: false, reason: "cancelled" };
  }

  const { plan_status, trial_ends_at, past_due_since, enabled_modules } = data;

  // 1. Permanently blocked states
  if (plan_status === "cancelled") {
    return { allowed: false, reason: "cancelled" };
  }
  if (plan_status === "locked") {
    return { allowed: false, reason: "past_due_locked" };
  }

  // 2. Trial state
  if (plan_status === "trial") {
    if (!trial_ends_at) {
      // No expiry set → treat as expired
      return { allowed: false, reason: "trial_expired" };
    }
    const expiresAt = new Date(trial_ends_at);
    if (expiresAt > new Date()) {
      return { allowed: true, reason: "trial_valid" };
    }
    return { allowed: false, reason: "trial_expired" };
  }

  // 3. Past due state — 7-day grace window
  if (plan_status === "past_due") {
    if (!past_due_since) {
      // No timestamp recorded → grant grace (edge case)
      return { allowed: true, reason: "past_due_grace" };
    }
    const since = new Date(past_due_since);
    const graceCutoff = new Date(
      since.getTime() + PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000,
    );
    if (graceCutoff > new Date()) {
      return { allowed: true, reason: "past_due_grace" };
    }
    return { allowed: false, reason: "past_due_locked" };
  }

  // 4. Active state — check module enablement
  if (plan_status === "active") {
    const modules = enabled_modules as Record<string, unknown> | null;
    if (modules && modules[moduleKey] === true) {
      return { allowed: true, reason: "active" };
    }
    return { allowed: false, reason: "module_disabled" };
  }

  // Fallback — unknown status, fail closed
  return { allowed: false, reason: "cancelled" };
}
