"use client";

import { trpc } from "@/lib/trpc";
import { IncidentsConfigCard } from "@/app/(dashboard)/admin/_components/IncidentsConfigCard";
import { CommunicationsConfigCard } from "@/app/(dashboard)/admin/_components/CommunicationsConfigCard";

/**
 * Per-module configuration shell.
 *
 * Hosts the module-specific config panels that are NOT covered by
 * the 10 fixed Admin Control Center sections. The big seven —
 * Facility Profile, Daily Reports, Ice Operations, Ice Depth,
 * Refrigeration, Air Quality, and Scheduling/Positions/Staff/Shifts
 * — render as dedicated top-level cards on /admin. This shell only
 * picks up the leftover modules (Incidents, Communications) and
 * any future modules that haven't been promoted yet.
 *
 * Modules that ARE covered by a top-level section are filtered out
 * here so the admin doesn't see two copies of the same UI.
 */
const PANELS: Record<string, () => React.JSX.Element> = {
  incidents: IncidentsConfigCard,
  communications: CommunicationsConfigCard,
};

// Modules that have been lifted into dedicated top-level sections
// in /admin/page.tsx — never render them inside this shell.
const TOP_LEVEL_MODULES = new Set<string>([
  "daily-reports",
  "ice-operations",
  "ice-depth",
  "refrigeration",
  "air-quality",
  "scheduling",
]);

function moduleLabel(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function ModuleConfigShell() {
  const list = trpc.admin.listModules.useQuery();
  const enabled =
    list.data
      ?.filter((m) => m.enabled)
      .filter((m) => !TOP_LEVEL_MODULES.has(m.module)) ?? [];

  return (
    <div className="flex flex-col gap-6">
      {list.isLoading && (
        <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
          <p className="text-sm text-grey">Loading modules…</p>
        </section>
      )}

      {!list.isLoading && enabled.length === 0 && (
        <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
          <h2 className="text-xl font-semibold text-white">
            Module configuration
          </h2>
          <p className="mt-1 text-sm text-grey">
            No modules enabled. Toggle modules above to see their config
            panels appear here.
          </p>
        </section>
      )}

      {enabled.map((row) => {
        const Panel = PANELS[row.module];
        if (Panel) {
          return <Panel key={row.module} />;
        }
        return (
          <section
            key={row.module}
            className="rounded-lg border border-grey/30 bg-darkbg/40 p-6"
          >
            <h2 className="text-xl font-semibold text-white">
              {moduleLabel(row.module)}
            </h2>
            <p className="mt-1 text-sm text-grey">
              No configuration panel yet. The panel ships with the module
              phase.
            </p>
          </section>
        );
      })}
    </div>
  );
}
