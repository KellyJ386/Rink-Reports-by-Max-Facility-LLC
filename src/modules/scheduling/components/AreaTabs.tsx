"use client";

import { trpc } from "@/lib/trpc";

interface Props {
  activeAreaId: string | null;
  onAreaChange: (id: string | null) => void;
  isManager: boolean;
}

/**
 * Dynamic tab bar rendered from `trpc.scheduling.areas.list`. Shows one
 * tab per active area. Managers also see an "All Areas" master tab.
 */
export function AreaTabs({ activeAreaId, onAreaChange, isManager }: Props) {
  const areas = trpc.scheduling.areas.list.useQuery();

  if (areas.isLoading) {
    return (
      <div className="flex items-center gap-2 border-b border-grey/30 pb-2">
        <span className="text-xs text-grey">Loading areas...</span>
      </div>
    );
  }

  const areaList = areas.data ?? [];

  if (areaList.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Area filter"
      className="flex flex-wrap items-center gap-2 border-b border-grey/30 pb-2"
    >
      {isManager && (
        <button
          type="button"
          onClick={() => onAreaChange(null)}
          className={
            activeAreaId === null
              ? "rounded bg-navy px-3 py-1.5 text-sm font-medium text-white"
              : "rounded border border-grey/40 px-3 py-1.5 text-sm text-grey hover:text-white"
          }
        >
          All Areas
        </button>
      )}
      {areaList.map((area) => (
        <button
          key={area.id}
          type="button"
          onClick={() => onAreaChange(area.id)}
          className={
            activeAreaId === area.id
              ? "rounded bg-navy px-3 py-1.5 text-sm font-medium text-white"
              : "rounded border border-grey/40 px-3 py-1.5 text-sm text-grey hover:text-white"
          }
        >
          {area.name}
        </button>
      ))}
    </nav>
  );
}
