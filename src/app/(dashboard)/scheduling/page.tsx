import { SchedulingClient } from "@/modules/scheduling/components/SchedulingClient";

/**
 * Staff-facing Scheduling page.
 *
 * Layout: a tab strip across four layers — Availability (everyone),
 * Auto-suggest (managers), Grid edit (managers), Live board
 * (everyone). The client island gates manager-only tabs based on
 * the user's role.
 */
export default function SchedulingPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold text-navy">Scheduling</h1>
        <p className="text-sm text-grey">
          Submit your weekly availability, view the published schedule,
          and (for managers) generate, edit, and publish weekly shift
          plans.
        </p>
      </header>

      <SchedulingClient />
    </main>
  );
}
