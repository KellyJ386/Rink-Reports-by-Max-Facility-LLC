import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { handlerRegistry } from "@/server/sync/registry";
import type { SyncResultRow } from "@/server/sync/types";

const QueuedRecord = z.object({
  localId: z.string().min(1),
  table: z.string().min(1),
  payload: z.unknown(),
  retryCount: z.number().int().min(0),
});

const SyncBody = z.object({ writes: z.array(QueuedRecord) });

export async function POST(req: Request) {
  try {
    const json: unknown = await req.json();
    const parsed = SyncBody.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid sync envelope" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("facility_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile?.facility_id) {
      return NextResponse.json({ ok: false, error: "No facility for user" }, { status: 403 });
    }

    const ctx = { facilityId: profile.facility_id, userId: user.id, supabase };
    const results: SyncResultRow[] = [];
    for (const w of parsed.data.writes) {
      const handler = handlerRegistry.get(w.table);
      if (!handler) {
        results.push({ localId: w.localId, error: `unknown table: ${w.table}` });
        continue;
      }
      results.push(await handler.handle(w, ctx));
    }
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
