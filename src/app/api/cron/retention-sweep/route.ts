import "server-only";

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * GET /api/cron/retention-sweep
 *
 * Vercel cron endpoint (see vercel.json). Runs daily at 2am UTC.
 * Vercel sends `Authorization: Bearer {CRON_SECRET}` automatically.
 *
 * This route:
 *   1. Verifies the cron secret.
 *   2. Uses the service-role Supabase client (bypasses RLS — the cron
 *      has no user session and operates across all facilities).
 *   3. Fetches all active facility IDs.
 *   4. Per facility: reads retention_policies, soft-deletes rows older
 *      than the policy limit, and hard-deletes rows that were
 *      soft-deleted >30 days ago.
 *   5. Returns a JSON summary; never lets errors 500 the cron.
 *
 * COMPLIANCE SAFETY:
 *   incidents and air_quality_readings are intentionally excluded
 *   from RETENTION_TABLES. They are never touched by this sweep
 *   regardless of what a facility's retention_policies JSONB contains.
 *
 * facility_id comes from the database, never from request input
 * (CLAUDE.md Rule 1).
 */

const RETENTION_TABLES = [
  { table: "daily_reports", key: "dailyReports" },
  { table: "ice_operations", key: "iceOperations" },
  { table: "refrigeration_readings", key: "refrigerationReadings" },
  { table: "ice_depth_sessions", key: "iceDepthSessions" },
] as const;
// incidents + air_quality_readings intentionally excluded — compliance.

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Fetch all active facilities
    const { data: facilities, error: facErr } = await supabase
      .from("facilities")
      .select("id");
    if (facErr) throw facErr;

    let totalSoftDeleted = 0;
    let totalHardDeleted = 0;

    const facilityResults = await Promise.allSettled(
      (facilities ?? []).map(async (f) => {
        return processFacility(f.id, supabase);
      }),
    );

    for (const r of facilityResults) {
      if (r.status === "fulfilled") {
        totalSoftDeleted += r.value.softDeleted;
        totalHardDeleted += r.value.hardDeleted;
      } else {
        Sentry.captureException(r.reason);
      }
    }

    return NextResponse.json({
      ok: true,
      facilitiesProcessed: facilities?.length ?? 0,
      totalSoftDeleted,
      totalHardDeleted,
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

async function processFacility(
  facilityId: string,
  supabase: SupabaseClient<Database>,
): Promise<{ softDeleted: number; hardDeleted: number }> {
  let softDeleted = 0;
  let hardDeleted = 0;

  // Fetch retention policy for this facility
  const { data: configRow } = await supabase
    .from("facility_config")
    .select("retention_policies")
    .eq("facility_id", facilityId)
    .maybeSingle();
  const policies = (configRow?.retention_policies ?? {}) as Record<string, number | null>;

  for (const { table, key } of RETENTION_TABLES) {
    const days = policies[key];
    if (days === null || days === undefined) continue; // skip disabled
    if (typeof days !== "number" || days < 1) continue;

    const softCutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Soft delete: rows older than policy, not yet archived
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const softRes = await (supabase as any)
      .from(table)
      .update({ archived_at: new Date().toISOString() })
      .eq("facility_id", facilityId)
      .is("archived_at", null)
      .lt("created_at", softCutoff)
      .select("id");
    if (!softRes.error && softRes.data) {
      softDeleted += (softRes.data as unknown[]).length;
    }

    // Hard delete: rows archived more than 30 days ago
    const hardCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hardRes = await (supabase as any)
      .from(table)
      .delete()
      .eq("facility_id", facilityId)
      .lt("archived_at", hardCutoff)
      .select("id");
    if (!hardRes.error && hardRes.data) {
      hardDeleted += (hardRes.data as unknown[]).length;
    }
  }

  return { softDeleted, hardDeleted };
}
