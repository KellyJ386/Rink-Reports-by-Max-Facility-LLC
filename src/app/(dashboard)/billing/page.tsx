"use client";

import { trpc } from "@/lib/trpc";

/**
 * Billing page at /(dashboard)/billing
 *
 * Shows the facility's current plan status, trial/due dates, seat
 * usage, and enabled module list. State-specific banners guide the
 * admin toward the right action (upgrade, update payment, reactivate).
 *
 * CTA buttons POST to /api/stripe/checkout or /api/stripe/portal.
 * The BillingBanner in the DashboardShell also shows persistent
 * banners globally — this page shows the full detail view.
 */
export default function BillingPage() {
  const { data, isLoading, error } = trpc.billing.getStatus.useQuery();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Billing</h1>
        <p className="mt-1 text-sm text-grey">
          Manage your RinkReports subscription. Payment is handled securely by
          Stripe.
        </p>
      </div>

      {isLoading && (
        <p className="text-sm text-grey">Loading billing status…</p>
      )}

      {error && (
        <p className="text-sm text-red" role="alert">
          {error.message}
        </p>
      )}

      {data && (
        <>
          {/* State-specific top banner */}
          <StateBanner
            planStatus={data.planStatus}
            trialEndsAt={data.trialEndsAt}
            pastDueSince={data.pastDueSince}
          />

          {/* Plan summary card */}
          <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
            <h2 className="text-lg font-semibold text-white">Plan Summary</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-grey">Plan</dt>
                <dd className="mt-1 font-medium text-white capitalize">
                  {data.planTier.replace(/_/g, " ")}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-grey">Status</dt>
                <dd className="mt-1">
                  <PlanStatusBadge status={data.planStatus} />
                </dd>
              </div>
              {data.trialEndsAt && (
                <div>
                  <dt className="text-xs uppercase text-grey">Trial ends</dt>
                  <dd className="mt-1 font-medium text-white">
                    {formatDate(data.trialEndsAt)}
                  </dd>
                </div>
              )}
              {data.pastDueSince && (
                <div>
                  <dt className="text-xs uppercase text-grey">Past due since</dt>
                  <dd className="mt-1 font-medium text-red">
                    {formatDate(data.pastDueSince)}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {/* Seat usage */}
          <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
            <h2 className="text-lg font-semibold text-white">Team Seats</h2>
            <div className="mt-3 flex items-end gap-4">
              <p className="text-3xl font-bold text-white">
                {data.seatCount}
                <span className="ml-1 text-lg font-normal text-grey">
                  / {data.maxSeats}
                </span>
              </p>
              <p className="mb-1 text-sm text-grey">seats in use</p>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-grey/20">
              <div
                className="h-full rounded-full bg-green transition-all"
                style={{
                  width: `${Math.min(100, (data.seatCount / data.maxSeats) * 100)}%`,
                }}
              />
            </div>
          </section>

          {/* Module list */}
          <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
            <h2 className="text-lg font-semibold text-white">Modules</h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {Object.entries(data.enabledModules).map(([key, enabled]) => (
                <li
                  key={key}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className={enabled ? "text-green" : "text-grey"}
                    aria-hidden="true"
                  >
                    {enabled ? "✓" : "✕"}
                  </span>
                  <span className={enabled ? "text-white" : "text-grey"}>
                    {formatModuleKey(key)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            {(data.planStatus === "trial" || data.planStatus === "locked" || data.planStatus === "cancelled") && (
              <UpgradeButton />
            )}
            {data.stripeCustomerId && data.planStatus !== "cancelled" && (
              <PortalButton />
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** State-specific informational banner at the top of the billing page. */
function StateBanner({
  planStatus,
  trialEndsAt,
  pastDueSince,
}: {
  planStatus: string;
  trialEndsAt: string | null;
  pastDueSince: string | null;
}) {
  if (planStatus === "trial" && trialEndsAt) {
    const daysLeft = Math.max(
      0,
      Math.ceil(
        (new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      ),
    );
    return (
      <div className="rounded-lg border border-yellow/40 bg-yellow/10 p-4">
        <p className="font-medium text-yellow">
          {daysLeft > 0
            ? `Your trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`
            : "Your trial has ended."}
        </p>
        <p className="mt-1 text-sm text-grey">
          Subscribe now to continue using all RinkReports features without
          interruption.
        </p>
      </div>
    );
  }

  if (planStatus === "past_due") {
    const _since = pastDueSince; // unused but available for display
    void _since;
    return (
      <div className="rounded-lg border border-red/40 bg-red/10 p-4">
        <p className="font-medium text-red">Payment failed.</p>
        <p className="mt-1 text-sm text-grey">
          Update your payment method to avoid losing access. You have a 7-day
          grace period before your account is locked.
        </p>
      </div>
    );
  }

  if (planStatus === "locked") {
    return (
      <div className="rounded-lg border border-red/60 bg-red/10 p-4">
        <p className="font-medium text-red">Your account is locked.</p>
        <p className="mt-1 text-sm text-grey">
          Reactivate your subscription to submit new records and restore full
          access. Your existing data is preserved.
        </p>
      </div>
    );
  }

  if (planStatus === "cancelled") {
    return (
      <div className="rounded-lg border border-grey/40 bg-darkbg/60 p-4">
        <p className="font-medium text-grey">Subscription cancelled.</p>
        <p className="mt-1 text-sm text-grey">
          Subscribe again to restore access. Your data is retained for 30 days
          before permanent deletion.
        </p>
      </div>
    );
  }

  return null;
}

function PlanStatusBadge({ status }: { status: string }) {
  const colorClass =
    status === "active"
      ? "border-green/60 text-green"
      : status === "trial"
        ? "border-yellow/60 text-yellow"
        : status === "past_due"
          ? "border-red/50 text-red"
          : "border-grey/40 text-grey";

  const label =
    status === "trial"
      ? "Trial"
      : status === "active"
        ? "Active"
        : status === "past_due"
          ? "Past Due"
          : status === "locked"
            ? "Locked"
            : "Cancelled";

  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

function UpgradeButton() {
  async function handleClick() {
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = (await res.json()) as { url?: string; error?: string };
    if (json.url) window.location.assign(json.url);
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded bg-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
    >
      Upgrade Now
    </button>
  );
}

function PortalButton() {
  async function handleClick() {
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const json = (await res.json()) as { url?: string; error?: string };
    if (json.url) window.location.assign(json.url);
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded border border-grey/40 px-4 py-2 text-sm text-grey hover:border-white hover:text-white"
    >
      Manage in Stripe
    </button>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatModuleKey(key: string): string {
  const labels: Record<string, string> = {
    dailyReports: "Daily Reports",
    iceOperations: "Ice Operations",
    refrigeration: "Refrigeration",
    airQuality: "Air Quality",
    incidentReporting: "Incident Reporting",
    employeeScheduling: "Employee Scheduling",
    communications: "Communications",
    adminControlCenter: "Admin Control Center",
  };
  return labels[key] ?? key;
}
