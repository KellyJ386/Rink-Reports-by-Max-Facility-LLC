import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { DailyReportSubmissionInput } from "@/modules/daily-reports/schema";

/**
 * /api/sync — the only non-tRPC endpoint allowed for app data.
 * It exists because the offline sync engine batches Dexie writes
 * and replays them in a single round-trip; doing that through tRPC
 * would mean one HTTP request per pending write. See CLAUDE.md Rule 7.
 *
 * Per-table dispatch lives here. Every handler:
 *   - validates `payload` with the module's Zod schema
 *   - sets facility_id from the resolved profile (Rule 1)
 *   - sets submitted_by from auth.uid() (Rule 1)
 *   - relies on the unique (facility_id, local_id) index for
 *     idempotent replay (a duplicate-key error is treated as success)
 */

const QueuedRecord = z.object({
  localId: z.string().min(1),
  table: z.string().min(1),
  payload: z.unknown(),
  retryCount: z.number().int().min(0),
});

const SyncBody = z.object({
  writes: z.array(QueuedRecord),
});

interface SyncResultRow {
  localId: string;
  serverId?: string | null;
  error?: string | null;
}

export async function POST(req: Request) {
  const json: unknown = await req.json();
  const parsed = SyncBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid sync envelope" },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("facility_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.facility_id) {
    return NextResponse.json(
      { ok: false, error: "No facility for user" },
      { status: 403 },
    );
  }

  const facilityId = profile.facility_id;
  const results: SyncResultRow[] = [];

  for (const w of parsed.data.writes) {
    if (w.table === "daily_reports") {
      const payload = DailyReportSubmissionInput.safeParse(w.payload);
      if (!payload.success) {
        results.push({ localId: w.localId, error: "invalid payload" });
        continue;
      }

      const { data, error } = await supabase
        .from("daily_reports")
        .insert({
          facility_id: facilityId,
          checklist_id: payload.data.checklist_id,
          submitted_by: user.id,
          submitted_at: payload.data.submitted_at,
          answers: payload.data.answers,
          local_id: payload.data.local_id,
        })
        .select("id")
        .single();

      if (error) {
        // Idempotent replay: a second insert with the same
        // (facility_id, local_id) hits the unique index. Treat as
        // success and return the existing server id.
        const isDup = /duplicate key|unique/i.test(error.message);
        if (isDup) {
          const { data: existing } = await supabase
            .from("daily_reports")
            .select("id")
            .eq("facility_id", facilityId)
            .eq("local_id", payload.data.local_id)
            .maybeSingle();
          results.push({
            localId: w.localId,
            serverId: existing?.id ?? null,
          });
        } else {
          results.push({ localId: w.localId, error: error.message });
        }
      } else {
        results.push({ localId: w.localId, serverId: data.id });
      }
      continue;
    }

    // Unknown table — surface a clear error so the queue keeps the row
    // around for inspection rather than silently dropping it.
    results.push({
      localId: w.localId,
      error: `unknown table: ${w.table}`,
    });
  }

  return NextResponse.json({ ok: true, results });
}
