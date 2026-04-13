export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { SignOutButton } from "@/app/(dashboard)/_components/SignOutButton";
import { DashboardShell } from "@/app/(dashboard)/_components/DashboardShell";
import type { NavItem } from "@/components/layout";

/**
 * Server-side auth gate for every route in the (viewer) group.
 *
 * Only users with role === 'viewer' can access these routes.
 * Any non-viewer authenticated user is redirected to /dashboard.
 * Unauthenticated users are redirected to /login.
 *
 * Redundant with src/proxy.ts on purpose (CLAUDE.md Rule 8).
 */
export default async function ViewerLayout({
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

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("facility_id, role, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.facility_id) {
    redirect("/onboarding");
  }

  // Only viewers belong in this route group
  if (profile.role !== "viewer") {
    redirect("/dashboard");
  }

  const { data: facility } = await supabase
    .from("facilities")
    .select("name")
    .eq("id", profile.facility_id)
    .maybeSingle();

  // Viewer-only nav: insights and alerts only — no data entry routes
  const navItems: NavItem[] = [
    { label: "Dashboard", href: "/viewer/dashboard" },
    { label: "Insights", href: "/viewer/dashboard" },
    { label: "Alerts", href: "/viewer/alerts" },
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
          {/* Read Only badge — viewers cannot submit data */}
          <span className="rounded border border-yellow/50 bg-yellow/10 px-2 py-0.5 text-xs font-medium text-yellow">
            Read Only
          </span>
          <SignOutButton />
        </>
      }
    >
      {children}
    </DashboardShell>
  );
}
