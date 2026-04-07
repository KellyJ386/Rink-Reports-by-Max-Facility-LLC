"use client";

import { trpc } from "@/lib/trpc";
import { useModuleConfig } from "@/hooks/useModuleConfig";
import {
  type ThresholdMap,
  type ThresholdRange,
} from "@/modules/refrigeration/schema";

import { RefrigerationForm } from "@/modules/refrigeration/components/RefrigerationForm";
import { RecentRefrigerationReadings } from "@/modules/refrigeration/components/RecentRefrigerationReadings";

/**
 * Top-level client island for /refrigeration.
 *
 * Loads compressors and thresholds from the staff-facing tRPC router
 * (compressors) and useModuleConfig (thresholds). Empty states block
 * submission until the admin has set up at least one compressor.
 *
 * No hardcoded values: compressor list and threshold map both come
 * from facility-specific data (CLAUDE.md Rule 2).
 */
export function RefrigerationClient() {
  const compressors = trpc.refrigeration.listCompressors.useQuery();
  const config = useModuleConfig("refrigeration");

  if (compressors.isLoading || config.isLoading) {
    return <p className="text-sm text-grey">Loading…</p>;
  }

  if (compressors.error) {
    return (
      <p className="text-sm text-red" role="alert">
        {compressors.error.message}
      </p>
    );
  }
  if (config.error) {
    return (
      <p className="text-sm text-red" role="alert">
        {config.error.message}
      </p>
    );
  }

  const list = compressors.data ?? [];
  if (list.length === 0) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-8 text-center">
        <p className="text-grey">
          No compressors yet. Ask your admin to add at least one in the
          Admin Control Center before logging refrigeration readings.
        </p>
      </section>
    );
  }

  const thresholds = pickThresholds(config.config);

  return (
    <div className="flex flex-col gap-6">
      <RefrigerationForm compressors={list} thresholds={thresholds} />
      <RecentRefrigerationReadings
        compressors={list}
        thresholds={thresholds}
      />
    </div>
  );
}

/**
 * Narrow `useModuleConfig().config["thresholds"]` into a typed
 * ThresholdMap. The hook returns `Record<string, unknown>` so we
 * validate at this boundary.
 */
function pickThresholds(config: Record<string, unknown>): ThresholdMap {
  const raw = config.thresholds;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const out: ThresholdMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const min = typeof r.min === "number" ? r.min : null;
    const max = typeof r.max === "number" ? r.max : null;
    out[k] = { min, max } satisfies ThresholdRange;
  }
  return out;
}
