"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc";

/**
 * Billing admin panel.
 *
 * Renders the facility's current subscription status, the plan
 * catalog from `lib/stripe.ts`, and two action buttons:
 *
 *   - "Subscribe to <plan>" → POST /api/stripe/checkout, then
 *     window.location to the returned Stripe Checkout URL.
 *   - "Manage in Stripe"    → POST /api/stripe/portal, then
 *     window.location to the Customer Portal URL.
 *
 * Plans are read from the server-side PLANS catalog via the
 * `billing.getSubscription` tRPC query (it returns both the row
 * and the catalog so the UI doesn't have to import server-only code).
 */
export function BillingConfigCard() {
  const sub = trpc.billing.getSubscription.useQuery();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(plan: string) {
    setError(null);
    setPending(`checkout:${plan}`);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? `Checkout failed (${res.status})`);
        setPending(null);
        return;
      }
      window.location.assign(json.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Checkout failed";
      setError(message);
      setPending(null);
    }
  }

  async function openPortal() {
    setError(null);
    setPending("portal");
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? `Portal failed (${res.status})`);
        setPending(null);
        return;
      }
      window.location.assign(json.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Portal failed";
      setError(message);
      setPending(null);
    }
  }

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Billing</h2>
      <p className="mt-1 text-sm text-grey">
        Manage your facility&apos;s subscription. Payment is handled by
        Stripe; status updates flow back into RinkReports through the
        Stripe webhook.
      </p>

      {sub.isLoading && <p className="mt-4 text-sm text-grey">Loading…</p>}
      {sub.error && <p className="mt-4 text-sm text-red">{sub.error.message}</p>}

      {sub.data && (
        <>
          <div className="mt-4 rounded border border-grey/20 bg-darkbg/60 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-grey">Status:</span>
              <StatusBadge status={sub.data.subscription?.status ?? "trialing"} />
              {sub.data.subscription?.plan && (
                <span className="text-white">{sub.data.subscription.plan}</span>
              )}
              {sub.data.subscription?.trial_end && (
                <span className="ml-auto text-xs text-grey">
                  Trial ends {formatDate(sub.data.subscription.trial_end)}
                </span>
              )}
              {sub.data.subscription?.current_period_end && (
                <span className="ml-auto text-xs text-grey">
                  Renews {formatDate(sub.data.subscription.current_period_end)}
                </span>
              )}
            </div>
            {!sub.data.isActive && (
              <p className="mt-2 text-xs text-yellow">
                This facility is in a non-active state. Some features
                may be restricted until billing is resolved.
              </p>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {sub.data.plans.map((plan) => (
              <div
                key={plan.id}
                className="flex flex-col gap-2 rounded border border-grey/20 bg-darkbg/60 p-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">{plan.label}</h3>
                  {sub.data.subscription?.plan === plan.id && (
                    <span className="rounded border border-green/40 px-1.5 text-[10px] text-green">
                      CURRENT
                    </span>
                  )}
                </div>
                <p className="text-xs text-grey">{plan.description}</p>
                <button
                  type="button"
                  onClick={() => startCheckout(plan.id)}
                  disabled={pending !== null}
                  className="mt-auto rounded bg-navy px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {pending === `checkout:${plan.id}`
                    ? "Opening Stripe…"
                    : sub.data.subscription?.plan === plan.id
                      ? "Change billing"
                      : "Subscribe"}
                </button>
              </div>
            ))}
          </div>

          {sub.data.subscription?.stripe_customer_id && (
            <div className="mt-4">
              <button
                type="button"
                onClick={openPortal}
                disabled={pending !== null}
                className="rounded border border-grey/40 px-3 py-1.5 text-xs text-grey hover:border-white hover:text-white disabled:opacity-50"
              >
                {pending === "portal" ? "Opening portal…" : "Manage in Stripe"}
              </button>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="mt-4 text-sm text-red" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "active" || status === "trialing"
      ? "border-green/60 text-green"
      : status === "past_due" || status === "unpaid"
        ? "border-yellow/60 text-yellow"
        : "border-red/60 text-red";
  return (
    <span className={`rounded border px-2 py-0.5 text-xs ${cls}`}>
      {status}
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}
