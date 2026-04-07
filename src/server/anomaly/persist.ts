import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import type { DetectionResult } from "@/server/anomaly/types";
import type { Alert } from "@/lib/offline/types";

export type PersistResult = {
  inserted: number;
  skipped: number;
  errors: number;
  insertedAlerts: Alert[];
};

/**
 * Persist a batch of DetectionResults to the alerts table.
 *
 * Dedup contract: if an unresolved alert already exists for the same
 * (facility_id, alert_type, target_identifier), the new result is
 * skipped. The partial index `idx_alerts_unresolved` makes the check fast.
 *
 * Uses Promise.allSettled so one insertion failure does not block the
 * rest of the batch.
 */
export async function persistAlerts(
  results: DetectionResult[],
  supabase: SupabaseClient<Database>,
): Promise<PersistResult> {
  if (results.length === 0) {
    return { inserted: 0, skipped: 0, errors: 0, insertedAlerts: [] };
  }

  const settled = await Promise.allSettled(
    results.map((result) => persistOne(result, supabase)),
  );

  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  const insertedAlerts: Alert[] = [];

  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      if (outcome.value === "skipped") {
        skipped++;
      } else {
        inserted++;
        insertedAlerts.push(outcome.value);
      }
    } else {
      errors++;
      Sentry.captureException(outcome.reason, {
        tags: { context: "anomaly-persist" },
      });
    }
  }

  return { inserted, skipped, errors, insertedAlerts };
}

async function persistOne(
  result: DetectionResult,
  supabase: SupabaseClient<Database>,
): Promise<Alert | "skipped"> {
  // Dedup check: is there already an unresolved alert for this exact
  // (facility_id, alert_type, target_identifier) triple?
  // target_identifier can be null: use .is() for null, .eq() for non-null.
  let query = supabase
    .from("alerts")
    .select("id")
    .eq("facility_id", result.facilityId)
    .eq("alert_type", result.alertType)
    .is("resolved_at", null);

  if (result.targetIdentifier == null) {
    query = query.is("target_identifier", null);
  } else {
    query = query.eq("target_identifier", result.targetIdentifier);
  }

  const { data: existing, error: selectErr } = await query
    .limit(1)
    .maybeSingle();

  if (selectErr) {
    throw new Error(
      `Dedup SELECT failed for ${result.alertType}/${result.targetIdentifier ?? "null"}: ${selectErr.message}`,
    );
  }

  if (existing) {
    return "skipped";
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("alerts")
    .insert({
      facility_id: result.facilityId,
      alert_type: result.alertType,
      severity: result.severity,
      target_identifier: result.targetIdentifier ?? null,
      title: result.title,
      description: result.description,
      metadata: (result.metadata ?? {}) as Json,
    })
    .select(
      "id, facility_id, alert_type, severity, target_identifier, title, description, metadata, resolved_at, resolved_by, created_at",
    )
    .single();

  if (insertErr || !inserted) {
    throw new Error(
      `INSERT failed for ${result.alertType}/${result.targetIdentifier ?? "null"}: ${insertErr?.message ?? "no row returned"}`,
    );
  }

  return {
    id: inserted.id,
    facilityId: inserted.facility_id,
    alertType: inserted.alert_type,
    severity: inserted.severity as "info" | "warning" | "critical",
    targetIdentifier: inserted.target_identifier,
    title: inserted.title,
    description: inserted.description,
    metadata: (inserted.metadata as Record<string, unknown>) ?? {},
    resolvedAt: inserted.resolved_at,
    resolvedBy: inserted.resolved_by,
    createdAt: inserted.created_at,
  };
}
