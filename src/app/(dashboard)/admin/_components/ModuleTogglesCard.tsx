"use client";

import { trpc } from "@/lib/trpc";

function moduleLabel(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function ModuleTogglesCard() {
  const utils = trpc.useUtils();
  const list = trpc.admin.listModules.useQuery();
  const setEnabled = trpc.admin.setModuleEnabled.useMutation({
    onSuccess: async () => {
      await utils.admin.listModules.invalidate();
    },
  });

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Modules</h2>
      <p className="mt-1 text-sm text-grey">
        Enable or disable modules for this facility. Disabled modules are
        hidden from the navigation and produce no data.
      </p>

      {list.isLoading && <p className="mt-4 text-sm text-grey">Loading…</p>}

      {list.error && (
        <p className="mt-4 text-sm text-red">{list.error.message}</p>
      )}

      {list.data && (
        <ul className="mt-4 flex flex-col gap-2">
          {list.data.map((row) => (
            <li
              key={row.module}
              className="flex items-center justify-between rounded border border-grey/20 bg-darkbg/60 px-4 py-3"
            >
              <span className="text-sm text-white">
                {moduleLabel(row.module)}
              </span>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-grey">
                <span>{row.enabled ? "Enabled" : "Disabled"}</span>
                <input
                  type="checkbox"
                  checked={row.enabled}
                  disabled={setEnabled.isPending}
                  onChange={(e) =>
                    setEnabled.mutate({
                      module: row.module,
                      enabled: e.target.checked,
                    })
                  }
                  className="h-4 w-4 accent-green"
                />
              </label>
            </li>
          ))}
        </ul>
      )}

      {setEnabled.error && (
        <p className="mt-3 text-sm text-red">{setEnabled.error.message}</p>
      )}
    </section>
  );
}
