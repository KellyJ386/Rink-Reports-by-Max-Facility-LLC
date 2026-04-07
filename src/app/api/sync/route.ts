import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { DailyReportSyncPayload } from "@/modules/daily-reports/schema";

/**
 * /api/sync — the only non-tRPC endpoint allowed for app data.
 * It exists because the offline sync engine batches Dexie writes
 * and replays them in a single round-trip; doing that through tRPC
 * would mean one HTTP request per pending write. See CLAUDE.md Rule 7.
 *
 * Each `writes[i]` is dispatched by `table` to a per-module handler.
 * Handlers must:
 *   - Resolve `facility_id` from the caller's profile (Rule 1)
 *   - Use the row's `local_id` as an idempotency token so retries
 *     don't double-insert
 *   - Return either `{ serverId }` on success or `{ error }` on failure
 *
 * The response shape mirrors what the client sync engine expects in
 * `flush()`: `{ ok, results: [{ localId, serverId?, error? }] }`.
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

type SyncResultRow = {
  localId: string;
  serverId?: string;
  error?: string;
};

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

  for (const write of parsed.data.writes) {
    if (write.table === "daily_reports") {
      const payload = DailyReportSyncPayload.safeParse(write.payload);
      if (!payload.success) {
        results.push({
          localId: write.localId,
          error: "Invalid daily_reports payload",
        });
        continue;
      }

      // Verify the target checklist belongs to the caller's facility.
      // RLS would also reject the insert, but doing the check here
      // gives a much friendlier error in the queue.
      const { data: checklist, error: checklistErr } = await supabase
        .from("daily_report_checklists")
        .select("id")
        .eq("id", payload.data.checklist_id)
        .eq("facility_id", facilityId)
        .maybeSingle();

      if (checklistErr) {
        results.push({ localId: write.localId, error: checklistErr.message });
        continue;
      }
      if (!checklist) {
        results.push({
          localId: write.localId,
          error: "Checklist not found",
        });
        continue;
      }

      const { data: inserted, error: insertErr } = await supabase
        .from("daily_reports")
        .insert({
          facility_id: facilityId,
          checklist_id: payload.data.checklist_id,
          submitted_at: payload.data.submitted_at,
          submitted_by: user.id,
          // Json column. The schema validated the runtime shape; cast
          // through unknown so TypeScript accepts the union.
          answers: payload.data.answers as unknown as never,
          local_id: payload.data.local_id,
        })
        .select("id")
        .single();

      if (insertErr) {
        // Idempotent retry: if the unique (facility_id, local_id)
        // index fires we already wrote this row in a prior attempt,
        // so look it up and report success.
        const isUniqueViolation =
          insertErr.code === "23505" ||
          /duplicate key/i.test(insertErr.message);

        if (isUniqueViolation) {
          const { data: existing } = await supabase
            .from("daily_reports")
            .select("id")
            .eq("facility_id", facilityId)
            .eq("local_id", payload.data.local_id)
            .maybeSingle();
          if (existing?.id) {
            results.push({ localId: write.localId, serverId: existing.id });
            continue;
          }
        }
        results.push({ localId: write.localId, error: insertErr.message });
        continue;
      }

      results.push({ localId: write.localId, serverId: inserted.id });
      continue;
    }

    // Unknown table — fail loudly so the client surfaces it instead
    // of silently looping. New modules add their branch above.
    results.push({
      localId: write.localId,
      error: `Unknown sync table: ${write.table}`,
    });
  }

  return NextResponse.json({
    ok: true,
    received: parsed.data.writes.length,
    processed: results.filter((r) => !r.error).length,
    results,
  });
}
