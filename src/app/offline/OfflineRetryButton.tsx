"use client";

export function OfflineRetryButton() {
  return (
    <button
      onClick={() => window.location.reload()}
      className="mt-6 rounded px-6 py-2 font-semibold text-sm"
      style={{
        backgroundColor: "var(--color-brand-navy)",
        color: "#ffffff",
        border: "2px solid var(--color-brand-navy)",
      }}
    >
      Try again
    </button>
  );
}
