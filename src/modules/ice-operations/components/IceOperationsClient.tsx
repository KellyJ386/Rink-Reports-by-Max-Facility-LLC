"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc";

import { OperationForm } from "@/modules/ice-operations/components/OperationForm";
import { RecentOperations } from "@/modules/ice-operations/components/RecentOperations";

/**
 * Top-level client island for /ice-operations.
 *
 * Loads operation types and equipment from the staff-facing tRPC
 * router, renders one tab per operation type (≈4 in practice), and
 * shows the form for the active tab plus the recent-operations panel.
 *
 * No hardcoded values: every tab name, every field, and every
 * equipment option comes from the database (CLAUDE.md Rule 2).
 */
export function IceOperationsClient() {
  const opTypes = trpc.iceOperations.listOperationTypes.useQuery();
  const equipment = trpc.iceOperations.listEquipment.useQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (opTypes.isLoading || equipment.isLoading) {
    return <p className="text-sm text-grey">Loading…</p>;
  }

  if (opTypes.error) {
    return (
      <p className="text-sm text-red" role="alert">
        {opTypes.error.message}
      </p>
    );
  }
  if (equipment.error) {
    return (
      <p className="text-sm text-red" role="alert">
        {equipment.error.message}
      </p>
    );
  }

  const types = opTypes.data ?? [];
  const equip = equipment.data ?? [];

  if (types.length === 0) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-8 text-center">
        <p className="text-grey">
          No operation types yet. Ask your admin to add at least one in
          the Admin Control Center.
        </p>
      </section>
    );
  }

  if (equip.length === 0) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-8 text-center">
        <p className="text-grey">
          No equipment yet. Ask your admin to add at least one piece of
          equipment in the Admin Control Center before logging operations.
        </p>
      </section>
    );
  }

  const active =
    (selectedId !== null
      ? types.find((t) => t.id === selectedId)
      : undefined) ?? types[0]!;

  return (
    <div className="flex flex-col gap-6">
      <nav
        aria-label="Operation type tabs"
        className="flex flex-wrap gap-2 border-b border-grey/30 pb-2"
      >
        {types.map((t) => {
          const isActive = t.id === active.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              className={
                isActive
                  ? "rounded bg-navy px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded border border-grey/40 px-3 py-1.5 text-sm text-grey hover:text-white"
              }
            >
              {t.name}
            </button>
          );
        })}
      </nav>

      <OperationForm key={active.id} opType={active} equipment={equip} />

      <RecentOperations operationTypes={types} equipment={equip} />
    </div>
  );
}
