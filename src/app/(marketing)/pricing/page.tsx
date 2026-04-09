"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

// Note: page-level metadata can't be exported from a "use client" component.
// SEO is handled by the marketing layout's default metadata.

const features = [
  "All 8 modules included",
  "Up to 200 staff",
  "Offline-first PWA — works without internet",
  "PDF, CSV, and XLSX exports",
  "Sensor integrations (refrigeration, air quality, ice depth)",
  "Email, SMS, and web push notifications",
  "OSHA, EPA, and USA Hockey regulatory report packs",
  "Anomaly detection and automated alerts",
  "Priority support",
];

const faqs = [
  {
    q: "Is there a setup fee?",
    a: "No. There is no setup fee. You pay the monthly or annual subscription rate only. If you need help getting your team onboarded, our support team can walk you through it at no extra cost.",
  },
  {
    q: "What happens after the trial?",
    a: "At the end of your 14-day trial, you'll be prompted to enter a payment method. If you don't, your account is paused — your data is retained for 30 days before it's removed. You'll always get advance notice.",
  },
  {
    q: "Can I export my data if I cancel?",
    a: "Yes. You can export all your records in PDF, CSV, or XLSX format from any module at any time. If you cancel, you have 30 days to log in and download everything before the account is closed.",
  },
  {
    q: "Does it work on mobile?",
    a: "Yes. RinkReports is a Progressive Web App. You can install it on any iOS or Android device directly from the browser. It works fully offline and syncs when you're back on the network.",
  },
  {
    q: "What's included in 200 seats?",
    a: "Any staff member who can be added to your facility's account counts as a seat. This includes admins, shift workers, and view-only users. 200 seats covers the staffing needs of virtually every single-rink facility.",
  },
  {
    q: "Do you offer discounts for municipal facilities?",
    a: "We understand that municipal facilities operate under tighter budget constraints than private clubs. Contact us at hello@rinkreports.app and we'll work something out.",
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  const monthlyPrice = 79.99;
  const annualPrice = 959.88;

  return (
    <div className="mx-auto max-w-4xl px-6 py-16 md:py-24">
      {/* Page header */}
      <div className="mb-12 text-center">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-green">
          Pricing
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight text-white md:text-5xl">
          Simple, transparent pricing.
        </h1>
        <p className="mt-4 text-grey">
          One plan, all modules, one rink. No per-seat fees. No surprises.
        </p>

        {/* Billing toggle */}
        <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-white/10 bg-navy/10 p-1.5">
          <button
            type="button"
            onClick={() => setAnnual(false)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
              !annual
                ? "bg-navy text-white"
                : "text-grey hover:text-white"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setAnnual(true)}
            className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
              annual
                ? "bg-navy text-white"
                : "text-grey hover:text-white"
            }`}
          >
            Annual
            <span className="rounded-full bg-green/20 px-2 py-0.5 text-xs font-bold text-green">
              Save 2 months
            </span>
          </button>
        </div>
      </div>

      {/* Pricing card */}
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl border border-green/30 bg-navy/20 p-8 shadow-lg">
          <h2 className="text-xl font-bold text-white">Single Facility</h2>
          <p className="mt-1 text-sm text-grey">
            Everything you need to run one rink.
          </p>

          <div className="mt-6">
            {annual ? (
              <>
                <span className="text-5xl font-extrabold text-white">
                  ${annualPrice.toFixed(2)}
                </span>
                <span className="ml-1 text-grey">/yr</span>
                <p className="mt-1 text-sm text-green">
                  That&apos;s $79.99/month, billed annually.
                </p>
              </>
            ) : (
              <>
                <span className="text-5xl font-extrabold text-white">
                  ${monthlyPrice.toFixed(2)}
                </span>
                <span className="ml-1 text-grey">/mo</span>
              </>
            )}
          </div>

          {/* Feature list */}
          <ul className="mt-8 space-y-3">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0 text-green"
                  aria-hidden="true"
                />
                <span className="text-sm text-grey">{feature}</span>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <Link
            href="/signup"
            className="mt-8 block w-full rounded-lg bg-green py-3 text-center text-base font-semibold text-darkbg shadow hover:opacity-90 transition-opacity"
          >
            Start Free Trial
          </Link>
          <p className="mt-3 text-center text-xs text-grey">
            14-day free trial. Cancel anytime.
          </p>
        </div>
      </div>

      {/* FAQ */}
      <div className="mt-20">
        <h2 className="mb-8 text-2xl font-bold text-white">
          Frequently asked questions
        </h2>
        <div className="space-y-3">
          {faqs.map(({ q, a }) => (
            <details
              key={q}
              className="group rounded-xl border border-white/10 bg-navy/10 open:border-navy/60"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 px-6 py-4 text-sm font-semibold text-white marker:hidden list-none">
                {q}
                <span
                  className="shrink-0 text-grey transition-transform group-open:rotate-180"
                  aria-hidden="true"
                >
                  ▾
                </span>
              </summary>
              <p className="px-6 pb-5 text-sm leading-relaxed text-grey">{a}</p>
            </details>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="mt-16 rounded-2xl border border-white/10 bg-navy/10 p-8 text-center">
        <p className="text-lg font-semibold text-white">
          Still have questions?
        </p>
        <p className="mt-2 text-sm text-grey">
          We&apos;re a small team and we actually respond.{" "}
          <a
            href="mailto:hello@rinkreports.app"
            className="text-green hover:underline"
          >
            hello@rinkreports.app
          </a>
        </p>
      </div>
    </div>
  );
}
