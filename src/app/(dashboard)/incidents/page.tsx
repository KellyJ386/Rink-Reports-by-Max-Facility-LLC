import { IncidentsClient } from "@/modules/incidents/components/IncidentsClient";

/**
 * Staff-facing Incidents page.
 *
 * Auth + facility resolution is enforced by the (dashboard) layout,
 * so this server component just renders the client island. The
 * client handles the Incident / Accident toggle, the conditional
 * fields, the body diagram, and the recent log.
 */
export default function IncidentsPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold text-navy">Incidents</h1>
        <p className="text-sm text-grey">
          Document property damage, near-misses, behavioral incidents,
          and physical injuries. Use the Incident form for everything
          non-medical and the Accident form when someone was hurt.
        </p>
      </header>

      <IncidentsClient />
    </main>
  );
}
