import Link from "next/link";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { FacilitySettingsCard } from "@/app/(dashboard)/admin/_components/FacilitySettingsCard";
import { ModuleTogglesCard } from "@/app/(dashboard)/admin/_components/ModuleTogglesCard";
import { UserManagementCard } from "@/app/(dashboard)/admin/_components/UserManagementCard";
import { ModuleConfigShell } from "@/app/(dashboard)/admin/_components/ModuleConfigShell";
import { BillingConfigCard } from "@/app/(dashboard)/admin/_components/BillingConfigCard";

/**
 * Admin Control Center.
 *
 * Server-side permission gate (admin only). The (dashboard)/layout
 * already enforces auth + facility, so by the time this page renders
 * we know there is a user and a facility — we just need to check
 * the user's role.
 *
 * Non-admins see a "no permission" empty state instead of being
 * silently redirected (which is confusing UX). Each section card
 * is a client component that drives its own tRPC queries and
 * mutations.
 */
export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Layout would already have redirected, but defensive.
    return null;
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
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

      <FacilitySettingsCard />
      <BillingConfigCard />
      <ModuleTogglesCard />
      <UserManagementCard />
      <ModuleConfigShell />
    </main>
  );
}
