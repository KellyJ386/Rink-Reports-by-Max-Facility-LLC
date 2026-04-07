"use client";

import { trpc } from "@/lib/trpc";
import { DailyReportsChecklistEditor } from "@/app/(dashboard)/admin/_components/DailyReportsChecklistEditor";
import { IceOperationsConfigCard } from "@/app/(dashboard)/admin/_components/IceOperationsConfigCard";
import { RefrigerationConfigCard } from "@/app/(dashboard)/admin/_components/RefrigerationConfigCard";
import { AirQualityConfigCard } from "@/app/(dashboard)/admin/_components/AirQualityConfigCard";
import { IceDepthConfigCard } from "@/app/(dashboard)/admin/_components/IceDepthConfigCard";
import { IncidentsConfigCard } from "@/app/(dashboard)/admin/_components/IncidentsConfigCard";
import { SchedulingConfigCard } from "@/app/(dashboard)/admin/_components/SchedulingConfigCard";

/**
 * Per-module configuration shell.
 *
 * Each module phase registers its own panel in the PANELS map below.
 * For enabled modules that have a registered panel, the shell renders
 * that panel in full. For enabled modules without a panel, it renders
 * a stub "no panel yet" card so the admin can see which modules are
 * on but not yet configurable.
 */
const PANELS: Record<string, () => React.JSX.Element> = {
  "daily-reports": DailyReportsChecklistEditor,
  "ice-operations": IceOperationsConfigCard,
  refrigeration: RefrigerationConfigCard,
  "air-quality": AirQualityConfigCard,
  "ice-depth": IceDepthConfigCard,
  incidents: IncidentsConfigCard,
  scheduling: SchedulingConfigCard,
};

function moduleLabel(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function ModuleConfigShell() {
  const list = trpc.admin.listModules.useQuery();
  const enabled = list.data?.filter((m) => m.enabled) ?? [];

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
