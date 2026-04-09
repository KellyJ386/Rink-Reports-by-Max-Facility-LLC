import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";
import { logAdminMutation } from "@/server/audit/logger";

/**
 * POST /api/admin/data-delete
 *
 * Soft-deletes all data for a facility. Super admin only.
 * Requires confirmation phrase.
 */
export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Check user role (super_admin only)
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("facility_id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.facility_id || profile.role !== "super_admin") {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 },
      );
    }

    const facilityId = profile.facility_id;

    // Parse request body
    const body = await req.json();
    const { confirmationPhrase } = body as { confirmationPhrase?: string };

    // Fetch facility to get name for confirmation
    const serviceClient = createSupabaseServiceRoleClient();
    const { data: facility } = await serviceClient
      .from("facilities")
      .select("id, name")
      .eq("id", facilityId)
      .maybeSingle();

    if (!facility) {
      return NextResponse.json(
        { error: "Facility not found" },
        { status: 404 },
      );
    }

    // Validate confirmation phrase
    const expectedPhrase = `DELETE ${facility.name}`;
    if (confirmationPhrase !== expectedPhrase) {
      return NextResponse.json(
        { error: "Invalid confirmation phrase" },
        { status: 400 },
      );
    }

    // Soft-delete data: set archived_at for tables that support it
    const now = new Date().toISOString();
    const tablesAffected: string[] = [];

    // Phase D migration 020 added archived_at to these 4 tables, but the
    // hand-maintained database.types.ts doesn't reflect it. Cast each
    // update call to `any` so TS accepts the payload — the column exists
    // at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = serviceClient as any;
    const [
      dailyReportsRes,
      iceOperationsRes,
      refrigerationReadingsRes,
      iceDepthSessionsRes,
    ] = await Promise.all([
      sb
        .from("daily_reports")
        .update({ archived_at: now })
        .eq("facility_id", facilityId),
      sb
        .from("ice_operations")
        .update({ archived_at: now })
        .eq("facility_id", facilityId),
      sb
        .from("refrigeration_readings")
        .update({ archived_at: now })
        .eq("facility_id", facilityId),
      sb
        .from("ice_depth_sessions")
        .update({ archived_at: now })
        .eq("facility_id", facilityId),
    ]);

    // Count affected rows
    if (dailyReportsRes.count) tablesAffected.push(`daily_reports (${dailyReportsRes.count})`);
    if (iceOperationsRes.count) tablesAffected.push(`ice_operations (${iceOperationsRes.count})`);
    if (refrigerationReadingsRes.count) tablesAffected.push(`refrigeration_readings (${refrigerationReadingsRes.count})`);
    if (iceDepthSessionsRes.count) tablesAffected.push(`ice_depth_sessions (${iceDepthSessionsRes.count})`);

    // Note: incidents and air_quality_readings are NOT soft-deleted (compliance)
    // Note: facility and audit_log rows are NOT deleted

    // Log the deletion request
    await logAdminMutation(
      {
        user: { id: user.id, email: user.email },
        role: profile.role,
        facilityId,
      },
      {
        action: "data_delete",
        resourceType: "facility_data",
        resourceId: facilityId,
        after: {
          facilityName: facility.name,
          tablesAffected,
          archivedAt: now,
        },
      },
    );

    return NextResponse.json({
      softDeleted: true,
      tablesAffected,
      archivedAt: now,
    });
  } catch (err) {
    console.error("[data-delete] POST failed", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
