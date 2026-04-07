import "server-only";

import Stripe from "stripe";

/**
 * Singleton Stripe client. Reads STRIPE_SECRET_KEY from env at first
 * use; throws a clear error if missing so deploys without billing
 * configured fail fast in the API route rather than at module load.
 */

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set — billing endpoints are unavailable.",
    );
  }
  cached = new Stripe(key, {
    // Pin the API version so a Stripe-side change can't break us
    // silently. Update intentionally on each Stripe upgrade.
    apiVersion: "2025-09-30.clover",
    typescript: true,
  });
  return cached;
}

/**
 * Plan catalog. The actual Stripe Price IDs are read from env at
 * runtime so the same code can target test mode locally and live
 * mode in production without code changes.
 *
 * Each plan id (`starter`, `pro`, `enterprise`) maps to:
 *   - the env var name holding its Stripe Price ID
 *   - a human label for the Billing card
 *   - a marketing description
 *
 * To add a tier, add it here AND set the matching env var.
 */
export interface PlanDef {
  id: PlanId;
  label: string;
  description: string;
  envVar: string;
}

export type PlanId = "starter" | "pro" | "enterprise";

export const PLANS: ReadonlyArray<PlanDef> = [
  {
    id: "starter",
    label: "Starter",
    description: "Single rink, up to 25 staff, all modules.",
    envVar: "STRIPE_PRICE_STARTER",
  },
  {
    id: "pro",
    label: "Pro",
    description:
      "Single rink, up to 100 staff, priority support, custom branding.",
    envVar: "STRIPE_PRICE_PRO",
  },
  {
    id: "enterprise",
    label: "Enterprise",
    description: "Up to 200 staff, dedicated success manager, SLA.",
    envVar: "STRIPE_PRICE_ENTERPRISE",
  },
];

export function priceIdForPlan(planId: PlanId): string | null {
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan) return null;
  return process.env[plan.envVar] ?? null;
}

/**
 * Subscription statuses that grant the facility full access to
 * features. Anything else (past_due, canceled, unpaid, etc.) flips
 * the facility into read-only mode — see entitlement helpers in
 * src/server/entitlements.ts.
 */
export const ACTIVE_STATUSES = new Set([
  "trialing",
  "active",
]);

export function isActiveStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return ACTIVE_STATUSES.has(status);
}
