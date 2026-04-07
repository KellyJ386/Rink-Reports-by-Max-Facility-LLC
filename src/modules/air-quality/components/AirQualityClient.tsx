"use client";

import { useModuleConfig } from "@/hooks/useModuleConfig";
import {
  EMPTY_ACTIONS,
  EMPTY_THRESHOLDS,
  type ActionProtocol,
  type ThresholdSet,
} from "@/modules/air-quality/schema";

import { AirQualityForm } from "@/modules/air-quality/components/AirQualityForm";
import { RecentAirQualityReadings } from "@/modules/air-quality/components/RecentAirQualityReadings";

/**
 * Top-level client island for /air-quality.
 *
 * Reads the facility's working thresholds and action protocol from
 * facility_config (via useModuleConfig) and passes them to the form
 * + recent panel. The form computes the tier live; the server also
 * computes it at insert time so historical reports can't drift.
 *
 * No hardcoded values: thresholds and protocol text both come from
 * facility-specific config (CLAUDE.md Rule 2).
 */
export function AirQualityClient() {
  const config = useModuleConfig("air-quality");

  if (config.isLoading) {
    return <p className="text-sm text-grey">Loading…</p>;
  }
  if (config.error) {
    return (
      <p className="text-sm text-red" role="alert">
        {config.error.message}
      </p>
    );
  }

  const thresholds = pickThresholdSet(config.config, "thresholds");
  const actions = pickActions(config.config);

  const hasAnyThreshold = Object.values(thresholds).some((v) => v !== null);

  if (!hasAnyThreshold) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-8 text-center">
        <p className="text-grey">
          No working thresholds configured. Ask your admin to set them
          in the Admin Control Center before logging air quality
          readings.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AirQualityForm thresholds={thresholds} actions={actions} />
      <RecentAirQualityReadings />
    </div>
  );
}

function pickThresholdSet(
  config: Record<string, unknown>,
  key: string,
): ThresholdSet {
  const raw = config[key];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return EMPTY_THRESHOLDS;
  }
  const r = raw as Record<string, unknown>;
  return {
    co_caution: typeof r.co_caution === "number" ? r.co_caution : null,
    co_action: typeof r.co_action === "number" ? r.co_action : null,
    co_evacuate: typeof r.co_evacuate === "number" ? r.co_evacuate : null,
    no2_caution: typeof r.no2_caution === "number" ? r.no2_caution : null,
    no2_action: typeof r.no2_action === "number" ? r.no2_action : null,
    no2_evacuate: typeof r.no2_evacuate === "number" ? r.no2_evacuate : null,
  };
}

function pickActions(config: Record<string, unknown>): ActionProtocol {
  const raw = config.actions;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return EMPTY_ACTIONS;
  }
  const r = raw as Record<string, unknown>;
  return {
    caution: typeof r.caution === "string" ? r.caution : "",
    action: typeof r.action === "string" ? r.action : "",
    evacuate: typeof r.evacuate === "string" ? r.evacuate : "",
  };
}
