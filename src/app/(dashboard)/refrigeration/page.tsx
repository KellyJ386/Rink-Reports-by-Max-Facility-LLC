import { RefrigerationClient } from "@/modules/refrigeration/components/RefrigerationClient";

/**
 * Staff-facing Refrigeration page.
 *
 * Auth + facility resolution is enforced by the (dashboard) layout, so
 * this server component just renders the client island that handles
 * the form, threshold-aware validation hints, and the recent readings
 * panel.
 */
export default function RefrigerationPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold text-navy">Refrigeration</h1>
        <p className="text-sm text-grey">
          Walk the plant and log a fresh reading every couple of hours.
          Normal operating ranges are shown next to each field; out-of-
          range readings are flagged in yellow.
        </p>
      </header>

      <RefrigerationClient />
    </main>
  );
}
