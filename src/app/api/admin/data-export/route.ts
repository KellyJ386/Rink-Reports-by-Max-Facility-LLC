import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";
import { logAdminMutation } from "@/server/audit/logger";

/**
 * POST /api/admin/data-export
 *
 * Exports all facility data as a JSON blob. Admin only.
 * Returns a downloadable JSON file with all facility data.
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

    // Check user role
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("facility_id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.facility_id || profile.role !== "admin" && profile.role !== "super_admin") {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 },
      );
    }

    const facilityId = profile.facility_id;

    // Use service-role client to fetch all data
    const serviceClient = createSupabaseServiceRoleClient();

    // Fetch facility data
    const [
      facilitiesRes,
      userProfilesRes,
      dailyReportsRes,
      iceOperationsRes,
      refrigerationReadingsRes,
      airQualityReadingsRes,
      iceDepthSessionsRes,
      incidentsRes,
      alertsRes,
      auditLogRes,
    ] = await Promise.all([
      serviceClient.from("facilities").select("*").eq("id", facilityId),
      serviceClient.from("user_profiles").select("*").eq("facility_id", facilityId),
      serviceClient.from("daily_reports").select("*").eq("facility_id", facilityId),
      serviceClient.from("ice_operations").select("*").eq("facility_id", facilityId),
      serviceClient.from("refrigeration_readings").select("*").eq("facility_id", facilityId),
      serviceClient.from("air_quality_readings").select("*").eq("facility_id", facilityId),
      serviceClient.from("ice_depth_sessions").select("*").eq("facility_id", facilityId),
      serviceClient.from("incidents").select("*").eq("facility_id", facilityId),
      serviceClient.from("alerts").select("*").eq("facility_id", facilityId),
      serviceClient.from("audit_log").select("*").eq("facility_id", facilityId),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      facilityId,
      facilities: facilitiesRes.data ?? [],
      userProfiles: userProfilesRes.data ?? [],
      dailyReports: dailyReportsRes.data ?? [],
      iceOperations: iceOperationsRes.data ?? [],
      refrigerationReadings: refrigerationReadingsRes.data ?? [],
      airQualityReadings: airQualityReadingsRes.data ?? [],
      iceDepthSessions: iceDepthSessionsRes.data ?? [],
      incidents: incidentsRes.data ?? [],
      alerts: alertsRes.data ?? [],
      auditLog: auditLogRes.data ?? [],
    };

    // Log the export action
    await logAdminMutation(
      {
        user: { id: user.id, email: user.email },
        role: profile.role,
        facilityId,
      },
      {
        action: "data_export",
        resourceType: "facility_data",
        resourceId: facilityId,
      },
    );

    // Return as downloadable JSON
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="rinkreports-export-${facilityId}-${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  } catch (err) {
    console.error("[data-export] POST failed", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
