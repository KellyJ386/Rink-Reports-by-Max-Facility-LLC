/**
 * Viewer Dashboard — Operational Overview (Read Only)
 *
 * This page is the viewer-role landing page. It is intentionally
 * read-only: no forms, no mutations.
 *
 * TODO: Phase C Agent 1 is adding src/app/(dashboard)/insights/page.tsx
 * with trend charts. Once that lands (branch: phase-c/anomaly-detection),
 * import and reuse the InsightsContent component here so viewers see the
 * same charts without the data-entry chrome.
 *
 * Until Agent 1's branch is merged this page renders a placeholder.
 */
export default function ViewerDashboardPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">
          Operational Overview — Read Only
        </h1>
        <p className="mt-1 text-sm text-grey">
          You are viewing this facility in read-only mode. Contact an
          administrator if you need to submit or modify records.
        </p>
      </div>

      {/*
        TODO: depends on phase-c/anomaly-detection (Agent 1).
        Replace this placeholder with the InsightsContent component once
        that branch is merged into main.
      */}
      <div className="rounded-lg border border-grey/30 bg-darkbg/40 p-8 text-center">
        <p className="text-grey">
          Insights load here when Phase C Agent 1 lands.
        </p>
        <p className="mt-2 text-xs text-grey/60">
          Navigate to{" "}
          <a href="/viewer/alerts" className="underline hover:text-white">
            Alerts
          </a>{" "}
          to view active facility alerts.
        </p>
      </div>
    </div>
  );
}
