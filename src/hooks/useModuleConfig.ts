"use client";

import { useMemo } from "react";

import { trpc } from "@/lib/trpc";

/**
 * The ONLY supported way for module code to read configuration.
 * See CLAUDE.md Rule 2: no hardcoded dropdown / threshold / tab
 * values anywhere. Everything comes from `facility_config`.
 *
 * Returns a typed `config` map keyed by config key for the requested
 * module. If nothing is set, `config` is an empty object — render
 * an empty state. Never invent defaults.
 */
export function useModuleConfig(module: string) {
  const query = trpc.admin.getFacilityConfig.useQuery({ module });

  const config = useMemo<Record<string, unknown>>(() => {
    const out: Record<string, unknown> = {};
    const rows = query.data as
      | ReadonlyArray<{ key: string; value: unknown }>
      | undefined;
    if (!rows) return out;
    for (const row of rows) {
      out[row.key] = row.value;
    }
    return out;
  }, [query.data]);

  return {
    config,
    isLoading: query.isLoading,
    error: query.error,
  } as const;
}
