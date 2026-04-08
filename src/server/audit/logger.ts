import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";

export interface AuditEntry {
  facilityId: string | null;
  userId: string;
  userEmail: string;
  userRole: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

const SCRUBBED_KEYS = [
  "password",
  "secret",
  "token",
  "api_key",
  "stripe",
  "hashed_secret",
  "calendar_feed_token",
  "signing_secret",
];

/**
 * Recursively scrub sensitive keys from a snapshot object.
 * Returns null if input is null/undefined.
 * Matches keys case-insensitively.
 */
export function scrubSnapshot(
  obj: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!obj) return null;

  const out: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(obj)) {
    // Check if key contains any scrubbed keyword
    if (SCRUBBED_KEYS.some((s) => k.toLowerCase().includes(s))) {
      out[k] = "[REDACTED]";
      continue;
    }

    // Recursively scrub nested objects
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = scrubSnapshot(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }

  return out;
}

/**
 * Write an audit log entry. Errors are logged but do not propagate.
 * This ensures audit failures don't break the mutation itself.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    await supabase.from("audit_log").insert({
      facility_id: entry.facilityId ?? null,
      user_id: entry.userId,
      user_email: entry.userEmail,
      user_role: entry.userRole,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId ?? null,
      before_snapshot:
        (scrubSnapshot(entry.beforeSnapshot ?? null) as unknown as Json) ??
        null,
      after_snapshot:
        (scrubSnapshot(entry.afterSnapshot ?? null) as unknown as Json) ??
        null,
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ?? null,
    });
  } catch (err) {
    console.error("[audit] writeAuditLog failed", err);
  }
}

/**
 * Helper for admin mutations to log their action.
 * Called manually after a mutation succeeds. Errors are swallowed.
 */
export async function logAdminMutation(
  ctx: {
    user: { id: string; email?: string | null };
    role: string | null;
    facilityId: string | null;
  },
  options: {
    action: string;
    resourceType: string;
    resourceId?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  },
): Promise<void> {
  const userEmail =
    ctx.user?.email || `user-${ctx.user?.id.slice(0, 8)}@unknown`;
  const userRole = ctx.role || "unknown";

  await writeAuditLog({
    facilityId: ctx.facilityId,
    userId: ctx.user.id,
    userEmail,
    userRole,
    action: options.action,
    resourceType: options.resourceType,
    resourceId: options.resourceId,
    beforeSnapshot: options.before,
    afterSnapshot: options.after,
  });
}
