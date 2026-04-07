import { DailyReportsView } from "@/modules/daily-reports/components/DailyReportsView";

/**
 * Daily Reports module page (staff-facing).
 *
 * The (dashboard) layout already enforces auth + facility membership,
 * so this page only mounts the client view. All data fetching goes
 * through tRPC and writes go through Dexie + /api/sync — see
 * DailyReportsView for the offline-first submit path.
 */
export default function DailyReportsPage() {
  return <DailyReportsView />;
}
