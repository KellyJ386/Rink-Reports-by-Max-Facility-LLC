export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { SignOutButton } from "@/app/(dashboard)/_components/SignOutButton";
import { DashboardShell } from "@/app/(dashboard)/_components/DashboardShell";
import type { NavItem } from "@/components/layout";

/**
 * Server-side auth gate for every route in the (org) group.
 *
 * Only users with at least one org_admin membership can access these
 * routes. Any user without org_admin membership is redirected to
 * /dashboard. Unauthenticated users are redirected to /login.
 *
 * Mirrors the Phase C (viewer)/layout.tsx pattern (CLAUDE.md Rule 8).
 * The orgAdminProcedure in tRPC provides the second enforcement layer.
 *
 * The org roll-up dashboard is READ-ONLY. No data entry from this view.
 */
export default async function OrgLayout({
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

  // Check for org_admin membership
  const { data: memberships } = await supabase
    .from("org_memberships")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("role", "org_admin")
    .limit(1);

  if (!memberships || memberships.length === 0) {
    // No org_admin membership — redirect to facility dashboard
    redirect("/dashboard");
  }

  // Fetch the org name for the first admin org
  const firstMembership = memberships[0]!;
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", firstMembership.organization_id)
    .maybeSingle();

  // Org nav items — Facilities, Metrics, Alerts (read-only)
  const navItems: NavItem[] = [
    { label: "Facilities", href: "/org/facilities" },
    { label: "Metrics", href: "/org/metrics" },
    { label: "Alerts", href: "/org/alerts" },
  ];

  return (
    <DashboardShell
      facilityName={org?.name ?? "Organization"}
      userName={user.email ?? ""}
      navItems={navItems}
      syncStatus="synced"
      pendingCount={0}
      headerActions={
        <>
          {/* Org Admin badge — roll-up view, no data entry */}
          <span className="rounded border border-[#4DFF00]/50 bg-[#4DFF00]/10 px-2 py-0.5 text-xs font-medium text-[#4DFF00]">
            Org Admin
          </span>
          <span className="rounded border border-[#A5ACAF]/50 bg-[#A5ACAF]/10 px-2 py-0.5 text-xs font-medium text-[#A5ACAF]">
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
