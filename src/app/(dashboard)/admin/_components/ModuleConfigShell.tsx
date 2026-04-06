"use client";

import { trpc } from "@/lib/trpc";

function moduleLabel(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Per-module configuration shell.
 *
 * Phase 1 ships the empty container. Each module phase (Phase 2–6)
 * later registers its own panel that renders inside this section
 * for whichever modules are currently enabled. Until a module phase
 * has shipped, its slot here shows a "no panel yet" note.
 */
export function ModuleConfigShell() {
  const list = trpc.admin.listModules.useQuery();
  const enabled = list.data?.filter((m) => m.enabled) ?? [];

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">
        Module configuration
      </h2>
      <p className="mt-1 text-sm text-grey">
        Per-module configuration panels are added by each module phase. Until
        a module&rsquo;s phase ships, its slot below is empty.
      </p>

      {list.isLoading && <p className="mt-4 text-sm text-grey">Loading…</p>}

      {!list.isLoading && enabled.length === 0 && (
        <p className="mt-4 text-sm text-grey">
          No modules enabled. Toggle modules above to see their config slots
          appear here.
        </p>
      )}

      {enabled.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {enabled.map((row) => (
            <li
              key={row.module}
              className="rounded border border-grey/20 bg-darkbg/60 p-4"
            >
              <h3 className="text-sm font-semibold text-white">
                {moduleLabel(row.module)}
              </h3>
              <p className="mt-1 text-sm text-grey">
                No configuration panel yet. The panel ships with the module
                phase.
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
