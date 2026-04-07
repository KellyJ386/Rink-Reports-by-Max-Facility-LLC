import Link from "next/link";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { FacilitySettingsCard } from "@/app/(dashboard)/admin/_components/FacilitySettingsCard";
import { DailyReportsChecklistEditor } from "@/app/(dashboard)/admin/_components/DailyReportsChecklistEditor";
import { IceOperationsConfigCard } from "@/app/(dashboard)/admin/_components/IceOperationsConfigCard";
import { IceDepthConfigCard } from "@/app/(dashboard)/admin/_components/IceDepthConfigCard";
import { RefrigerationConfigCard } from "@/app/(dashboard)/admin/_components/RefrigerationConfigCard";
import { AirQualityConfigCard } from "@/app/(dashboard)/admin/_components/AirQualityConfigCard";
import { PositionsCertificationsCard } from "@/app/(dashboard)/admin/_components/PositionsCertificationsCard";
import { UserManagementCard } from "@/app/(dashboard)/admin/_components/UserManagementCard";
import { ShiftConfigurationCard } from "@/app/(dashboard)/admin/_components/ShiftConfigurationCard";
import { BrandingDisplayCard } from "@/app/(dashboard)/admin/_components/BrandingDisplayCard";
import { ModuleTogglesCard } from "@/app/(dashboard)/admin/_components/ModuleTogglesCard";
import { BillingConfigCard } from "@/app/(dashboard)/admin/_components/BillingConfigCard";
import { ModuleConfigShell } from "@/app/(dashboard)/admin/_components/ModuleConfigShell";
import { NotificationPrefsCard } from "@/app/(dashboard)/admin/_components/NotificationPrefsCard";

/**
 * Admin Control Center.
 *
 * Server-side permission gate (admin or super_admin only). The
 * (dashboard)/layout already enforces auth + facility, so by the
 * time this page renders we know there is a user and a facility —
 * we just need to check the user's role.
 *
 * The page is laid out in the 10-section structure from the Admin
 * Control Center spec, plus three platform-layer cards (Module
 * Toggles, Billing, and the catch-all ModuleConfigShell that hosts
 * any module-specific config not covered by the 10 sections).
 *
 *   1.  Facility Profile
 *   2.  Daily Report Tabs
 *   3.  Ice Operations Config
 *   4.  Ice Depth Templates
 *   5.  Refrigeration Config
 *   6.  Air Quality Thresholds
 *   7.  Positions & Certifications
 *   8.  Staff Roster (with role + cert grants)
 *   9.  Shift Configuration
 *   10. Branding & Display
 *   --- platform extras below ---
 *   * Module Toggles
 *   * Billing
 *   * Other module config (Incidents, Communications, Scheduling extras)
 */
export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
    return (
      <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-4 px-6 py-16">
        <h1 className="text-2xl font-semibold text-navy">
          You don&rsquo;t have access to the Admin Control Center
        </h1>
        <p className="text-grey">
          Only facility admins can view and edit facility settings, modules,
          and users.
        </p>
        <div>
          <Link
            href="/dashboard"
            className="text-sm text-grey hover:text-white"
          >
            ← Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold text-navy">
          Admin Control Center
        </h1>
        <p className="text-sm text-grey">
          Configure your facility, enable modules, and manage users.
        </p>
      </header>

      {/* 10 Configuration Sections (Admin Control Center spec) */}
      <FacilitySettingsCard />
      <DailyReportsChecklistEditor />
      <IceOperationsConfigCard />
      <IceDepthConfigCard />
      <RefrigerationConfigCard />
      <AirQualityConfigCard />
      <PositionsCertificationsCard />
      <UserManagementCard />
      <ShiftConfigurationCard />
      <BrandingDisplayCard />

      {/* Platform-layer extras */}
      <ModuleTogglesCard />
      <BillingConfigCard />
      <NotificationPrefsCard />
      <ModuleConfigShell />
    </main>
  );
}
