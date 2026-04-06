import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase-server";

/**
 * /api/sync — the only non-tRPC endpoint allowed for app data.
 * It exists because the offline sync engine batches Dexie writes
 * and replays them in a single round-trip; doing that through tRPC
 * would mean one HTTP request per pending write. See CLAUDE.md Rule 7.
 *
 * Phase 0: validates the envelope and resolves the caller's facility.
 * Per-module write handlers are added in their respective phases.
 */

const PendingWrite = z.object({
  id: z.string(),
  module: z.string().min(1),
  payload: z.unknown(),
  createdAt: z.number(),
});

const SyncBody = z.object({
  writes: z.array(PendingWrite),
});

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

  // Phase 0: no module write handlers exist yet. Acknowledge the
  // envelope so the client engine can mark its queue as drained
  // during local development. Real handlers land per phase.
  return NextResponse.json({
    ok: true,
    processed: 0,
    received: parsed.data.writes.length,
  });
}
