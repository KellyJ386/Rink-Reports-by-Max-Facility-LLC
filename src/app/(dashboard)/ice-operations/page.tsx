import { IceOperationsClient } from "@/modules/ice-operations/components/IceOperationsClient";

/**
 * Staff-facing Ice Operations page.
 *
 * Auth + facility resolution is already enforced by the (dashboard)
 * layout, so this server component is intentionally tiny: it just
 * renders the client island that handles tabs (one per operation
 * type), the entry form, and the recent operations log.
 */
export default function IceOperationsPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold text-navy">Ice Operations</h1>
        <p className="text-sm text-grey">
          Log on-ice maintenance and operational activity. Each entry is
          tied to a piece of equipment and timestamped automatically.
          Submissions are saved on this device first and synced in the
          background.
        </p>
      </header>

      <IceOperationsClient />
    </main>
  );
}
