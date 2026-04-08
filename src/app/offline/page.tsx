import { OfflineRetryButton } from "./OfflineRetryButton";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p
        className="mb-4 text-2xl font-bold tracking-tight"
        style={{ color: "var(--color-brand-navy)" }}
      >
        RinkReports
      </p>
      <h1 className="text-3xl font-bold text-white">You&#39;re offline</h1>
      <p className="mt-3 max-w-sm text-base" style={{ color: "#A5ACAF" }}>
        Your data is saved locally and will sync when you reconnect.
      </p>
      <OfflineRetryButton />
    </div>
  );
}
