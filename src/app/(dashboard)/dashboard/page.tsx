import Link from "next/link";

import { createSupabaseServerClient } from "@/lib/supabase-server";

/**
 * Dashboard home.
 *
 * Server component. Reads the caller's facility_id from user_profiles
 * (the same pattern as the surrounding layout) and renders a grid of
 * cards for every module that's enabled for this facility.
 *
 * Disabled modules do not appear. Modules whose routes don't exist yet
 * show "Coming soon" next to the "Manage" link so admins can at least
 * reach the config panel while the staff-facing page is still being
 * built in a later phase.
 */

// Routes that are actually live under (dashboard). Other modules are
// enabled-but-not-yet-built: they appear on the dashboard as config-only
// cards. Add a slug here when its module page ships.
const LIVE_MODULE_ROUTES = new Set<string>([
  "daily-reports",
  "ice-operations",
]);

const MODULE_BLURBS: Record<string, string> = {
  "daily-reports":
    "Custom checklists your staff fill out throughout the day.",
  "ice-operations":
    "Log ice cuts, edge work, and Zamboni runs as they happen.",
  refrigeration:
    "Compressor runtimes, brine temperatures, and alarms.",
  "air-quality":
    "CO, CO₂, NO₂, and humidity spot checks.",
  "ice-depth":
    "Painted-line depth readings across the surface grid.",
  incidents:
    "Injury reports, near-misses, and equipment failures.",
  scheduling:
    "Staff and ice-time scheduling.",
  communications:
    "Facility-wide notices and shift handoff notes.",
};

function moduleLabel(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The (dashboard) layout already redirects unauthenticated requests,
  // so by the time we render here we always have a user + facility.
  if (!user) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("facility_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.facility_id) return null;

  const { data: modules } = await supabase
    .from("facility_modules")
    .select("module, enabled")
    .eq("facility_id", profile.facility_id)
    .eq("enabled", true)
    .order("module");

  const enabled = modules ?? [];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold text-navy">Dashboard</h1>
        <p className="text-sm text-grey">
          Enabled modules for this facility. Admins can enable more in the
          Admin Control Center.
        </p>
      </header>

      {enabled.length === 0 ? (
        <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-8 text-center">
          <p className="text-grey">
            No modules are enabled yet. Go to{" "}
            <Link href="/admin" className="text-navy hover:text-white">
              Admin Control Center
            </Link>{" "}
            to turn on the modules you want to use.
          </p>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {enabled.map((row) => {
            const isLive = LIVE_MODULE_ROUTES.has(row.module);
            const slug = row.module;
            const label = moduleLabel(slug);
            const blurb = MODULE_BLURBS[slug] ?? "";

            return (
              <article
                key={slug}
                className="flex flex-col rounded-lg border border-grey/30 bg-darkbg/40 p-5"
              >
                <div className="flex flex-1 flex-col gap-2">
                  <h2 className="text-lg font-semibold text-white">
                    {label}
                  </h2>
                  {blurb && (
                    <p className="text-sm text-grey">{blurb}</p>
                  )}
                </div>
                <div className="mt-4 flex items-center gap-3 text-sm">
                  {isLive ? (
                    <Link
                      href={`/${slug}`}
                      className="rounded bg-navy px-3 py-1.5 font-medium text-white hover:opacity-90"
                    >
                      Open
                    </Link>
                  ) : (
                    <span className="rounded border border-grey/40 px-3 py-1.5 text-grey">
                      Coming soon
                    </span>
                  )}
                  <Link
                    href="/admin"
                    className="text-grey hover:text-white"
                  >
                    Manage
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
