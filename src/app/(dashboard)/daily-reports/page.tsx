import { DailyReportsClient } from "@/modules/daily-reports/components/DailyReportsClient";

/**
 * Staff-facing Daily Reports page.
 *
 * Auth + facility resolution is already enforced by the (dashboard)
 * layout, so this server component is intentionally tiny: it just
 * renders the client island that handles tabs, the submission form,
 * and the recent submissions list.
 */
export default function DailyReportsPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold text-navy">Daily Reports</h1>
        <p className="text-sm text-grey">
          Fill out the checklists your facility uses throughout the day.
          Submissions are saved on this device first and synced in the
          background.
        </p>
      </header>

      <DailyReportsClient />
    </main>
  );
}
