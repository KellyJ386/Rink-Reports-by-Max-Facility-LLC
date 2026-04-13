import { redirect } from "next/navigation";
import Link from "next/link";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { SignOutButton } from "@/app/(dashboard)/_components/SignOutButton";
import { DashboardShell } from "@/app/(dashboard)/_components/DashboardShell";
import type { NavItem } from "@/components/layout";

/**
 * Server-side auth gate for every route in the (dashboard) group.
 *
 * Redundant with src/middleware.ts on purpose (CLAUDE.md Rule 8):
 * the middleware redirects unauthenticated requests away from
 * /dashboard and /admin, and this layout *also* checks the user
 * server-side so that any future direct render path or RSC fetch
 * still fails closed if the cookie is stale.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // facility_id is read here from `user_profiles` and ONLY here on the
  // dashboard chrome. Module pages must use ctx.facilityId via tRPC.
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("facility_id, role, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.facility_id) {
    // Phase 6 multi-facility: a freshly-signed-up user with no
    // user_profiles row (or a row whose facility_id was nulled out)
    // is sent through self-serve onboarding instead of seeing the
    // dead-end "contact your administrator" page.
    redirect("/onboarding");
  }

  const { data: facility } = await supabase
    .from("facilities")
    .select("name")
    .eq("id", profile.facility_id)
    .maybeSingle();

  // Phase A: nav items mirror the dashboard route folders. Module
  // visibility (per facility_config) is enforced inside each module
  // page, not in the chrome — keeping the shell purely presentational.
  const navItems: NavItem[] = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Insights", href: "/insights" },
    { label: "Daily Reports", href: "/daily-reports" },
    { label: "Ice Operations", href: "/ice-operations" },
    { label: "Ice Depth", href: "/ice-depth" },
    { label: "Refrigeration", href: "/refrigeration" },
    { label: "Air Quality", href: "/air-quality" },
    { label: "Incidents", href: "/incidents" },
    { label: "Scheduling", href: "/scheduling" },
    { label: "My Schedule", href: "/my-schedule" },
    { label: "Communications", href: "/communications" },
    { label: "Reports", href: "/reports" },
    { label: "Billing", href: "/billing" },
    { label: "Admin", href: "/admin" },
  ];

  return (
    <DashboardShell
      facilityName={facility?.name ?? ""}
      userName={profile?.full_name ?? user.email ?? ""}
      navItems={navItems}
      syncStatus="synced"
      pendingCount={0}
      headerActions={
        <>
          <Link
            href="/admin"
            className="text-sm text-grey hover:text-white"
          >
            Admin
          </Link>
          <SignOutButton />
        </>
      }
    >
      {children}
    </DashboardShell>
  );
}
