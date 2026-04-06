import { redirect } from "next/navigation";
import Link from "next/link";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { SignOutButton } from "@/app/(dashboard)/_components/SignOutButton";

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
    return (
      <div className="mx-auto flex max-w-3xl flex-1 flex-col gap-4 px-6 py-16">
        <h1 className="text-2xl font-semibold text-navy">
          Awaiting facility assignment
        </h1>
        <p className="text-grey">
          Your account exists but is not yet linked to a facility. Please
          contact your administrator.
        </p>
        <div>
          <SignOutButton />
        </div>
      </div>
    );
  }

  const { data: facility } = await supabase
    .from("facilities")
    .select("name")
    .eq("id", profile.facility_id)
    .maybeSingle();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-grey/30 bg-darkbg px-6 py-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-lg font-semibold text-navy">
            RinkReports
          </Link>
          {facility?.name && (
            <span className="text-sm text-grey">{facility.name}</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-grey sm:inline">
            {user.email}
          </span>
          <Link href="/admin" className="text-sm text-grey hover:text-white">
            Admin
          </Link>
          <SignOutButton />
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
