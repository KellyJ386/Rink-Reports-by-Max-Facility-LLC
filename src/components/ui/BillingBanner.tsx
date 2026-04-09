"use client";

import { trpc } from "@/lib/trpc";

/**
 * BillingBanner — persistent billing state banner rendered at the top
 * of the dashboard shell.
 *
 * - trial: amber strip with days remaining + "Upgrade Now" CTA
 * - past_due: red strip with payment failure warning + "Update Payment Method" CTA
 * - locked: red FULL-WIDTH blocking overlay over main content with centered CTA
 * - active / cancelled / other: renders nothing
 *
 * All CTA buttons POST to /api/stripe/checkout or /api/stripe/portal
 * and redirect to Stripe's hosted pages.
 */
export function BillingBanner() {
  const { data } = trpc.billing.getStatus.useQuery(undefined, {
    staleTime: 60 * 1000,
  });

  if (!data) return null;

  const { planStatus, trialEndsAt } = data;

  if (planStatus === "trial" && trialEndsAt) {
    const daysLeft = Math.ceil(
      (new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    const daysDisplay = daysLeft > 0 ? daysLeft : 0;
    return (
      <div className="flex items-center justify-between gap-4 bg-yellow/90 px-4 py-2 text-sm font-medium text-black">
        <span>
          {daysDisplay > 0
            ? `${daysDisplay} day${daysDisplay === 1 ? "" : "s"} remaining in your trial.`
            : "Your trial has ended."}
        </span>
        <UpgradeButton label="Upgrade Now" />
      </div>
    );
  }

  if (planStatus === "past_due") {
    return (
      <div className="flex items-center justify-between gap-4 bg-red/90 px-4 py-2 text-sm font-medium text-white">
        <span>
          Payment failed. Update your payment method to avoid losing access.
        </span>
        <PortalButton label="Update Payment Method" />
      </div>
    );
  }

  if (planStatus === "locked") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/90 text-center">
        <h2 className="text-2xl font-bold text-white">Account Locked</h2>
        <p className="max-w-md text-grey">
          Your account is locked. Reactivate your subscription to submit new
          data and restore full access.
        </p>
        <PortalButton label="Reactivate" className="rounded bg-red px-6 py-3 text-base font-semibold text-white hover:bg-red/80" />
      </div>
    );
  }

  return null;
}

function UpgradeButton({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  async function handleClick() {
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = (await res.json()) as { url?: string };
    if (json.url) window.location.assign(json.url);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        className ??
        "rounded bg-navy px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
      }
    >
      {label}
    </button>
  );
}

function PortalButton({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  async function handleClick() {
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const json = (await res.json()) as { url?: string };
    if (json.url) window.location.assign(json.url);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        className ??
        "rounded bg-white/20 px-3 py-1 text-xs font-semibold text-white hover:bg-white/30"
      }
    >
      {label}
    </button>
  );
}
