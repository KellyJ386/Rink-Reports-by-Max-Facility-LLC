import type { Metadata } from "next";
import Link from "next/link";
import {
  ClipboardList,
  Snowflake,
  Thermometer,
  Wind,
  AlertTriangle,
  Calendar,
  MessageSquare,
  Settings,
} from "lucide-react";
import { RoiCalculator } from "./_components/RoiCalculator";

export const metadata: Metadata = {
  title: "RinkReports — Ice Rink Operations Management Software",
  description:
    "RinkReports gives your team one place for daily reports, ice operations, refrigeration logs, incident tracking, scheduling, and more — online or offline.",
  openGraph: {
    title: "RinkReports — Ice Rink Operations Management Software",
    description:
      "RinkReports gives your team one place for daily reports, ice operations, refrigeration logs, incident tracking, scheduling, and more — online or offline.",
    type: "website",
  },
};

const modules = [
  {
    icon: ClipboardList,
    name: "Daily Reports",
    description:
      "Structured daily shift logs with weather integration and completion tracking.",
  },
  {
    icon: Snowflake,
    name: "Ice Operations",
    description:
      "Log resurfacing runs, edge work, and ice-related events by session type.",
  },
  {
    icon: Thermometer,
    name: "Refrigeration",
    description:
      "Record refrigeration system readings and detect drift before it becomes a problem.",
  },
  {
    icon: Wind,
    name: "Air Quality",
    description:
      "Four-tier air quality monitoring (Normal / Caution / Action / Evacuate) with auto-alerts on escalation.",
  },
  {
    icon: AlertTriangle,
    name: "Incident Reporting",
    description:
      "Document injuries and near-misses with structured fields that feed OSHA 300/300A logs.",
  },
  {
    icon: Calendar,
    name: "Employee Scheduling",
    description:
      "Manage shifts, import from ICS feeds, and publish a public calendar for your facility.",
  },
  {
    icon: MessageSquare,
    name: "Communications",
    description:
      "Send facility-wide announcements and keep a searchable record of staff communications.",
  },
  {
    icon: Settings,
    name: "Admin Control Center",
    description:
      "Configure every module, manage users and roles, and control sensor integrations from one place.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-darkbg">
        {/* Subtle grid overlay */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0,59,111,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(0,59,111,0.15) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative mx-auto max-w-7xl px-6 py-24 md:py-36">
          <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:items-center">
            {/* Copy */}
            <div>
              <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-green">
                Ice Rink Operations Software
              </p>
              <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-white md:text-5xl lg:text-6xl">
                Stop running your rink{" "}
                <span className="text-green">on paper.</span>
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-grey">
                RinkReports gives your team one place for daily reports, ice
                operations, refrigeration logs, incident tracking, scheduling,
                and more — online or offline.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link
                  href="/signup"
                  className="inline-flex items-center rounded-md bg-green px-6 py-3 text-base font-semibold text-darkbg shadow hover:opacity-90 transition-opacity"
                >
                  Start Free Trial
                </Link>
                <Link
                  href="/demo"
                  className="inline-flex items-center rounded-md border border-white/20 px-6 py-3 text-base font-semibold text-white hover:border-white/50 transition-colors"
                >
                  Request a Demo
                </Link>
              </div>
              <p className="mt-4 text-sm text-grey">
                14-day free trial. No credit card required.
              </p>
            </div>

            {/* Hero SVG — abstract rink illustration */}
            <div aria-hidden="true" className="flex justify-center lg:justify-end">
              <svg
                viewBox="0 0 480 320"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full max-w-lg"
              >
                {/* Rink surface */}
                <rect x="24" y="24" width="432" height="272" rx="64" fill="#003B6F" opacity="0.4" />
                {/* Ice grid lines */}
                {[80, 160, 240, 320, 400].map((x) => (
                  <line
                    key={x}
                    x1={x}
                    y1="30"
                    x2={x}
                    y2="290"
                    stroke="#4DFF00"
                    strokeWidth="0.5"
                    strokeOpacity="0.25"
                  />
                ))}
                {[80, 140, 200, 260].map((y) => (
                  <line
                    key={y}
                    x1="30"
                    y1={y}
                    x2="450"
                    y2={y}
                    stroke="#4DFF00"
                    strokeWidth="0.5"
                    strokeOpacity="0.25"
                  />
                ))}
                {/* Center circle */}
                <circle cx="240" cy="160" r="56" stroke="#4DFF00" strokeWidth="1.5" strokeOpacity="0.4" fill="none" />
                {/* Center dot */}
                <circle cx="240" cy="160" r="6" fill="#4DFF00" opacity="0.6" />
                {/* Goal creases */}
                <rect x="36" y="128" width="40" height="64" rx="8" fill="#003B6F" stroke="#A5ACAF" strokeWidth="1" strokeOpacity="0.5" />
                <rect x="404" y="128" width="40" height="64" rx="8" fill="#003B6F" stroke="#A5ACAF" strokeWidth="1" strokeOpacity="0.5" />
                {/* Blue lines */}
                <line x1="160" y1="30" x2="160" y2="290" stroke="#003B6F" strokeWidth="3" strokeOpacity="0.8" />
                <line x1="320" y1="30" x2="320" y2="290" stroke="#003B6F" strokeWidth="3" strokeOpacity="0.8" />
                {/* Red line */}
                <line x1="240" y1="30" x2="240" y2="290" stroke="#F42A2A" strokeWidth="2" strokeOpacity="0.6" />
                {/* Dashboard overlay cards */}
                <rect x="48" y="48" width="120" height="64" rx="8" fill="#001122" stroke="#003B6F" strokeWidth="1" opacity="0.9" />
                <rect x="56" y="58" width="40" height="6" rx="3" fill="#4DFF00" opacity="0.8" />
                <rect x="56" y="70" width="96" height="4" rx="2" fill="#A5ACAF" opacity="0.5" />
                <rect x="56" y="80" width="72" height="4" rx="2" fill="#A5ACAF" opacity="0.3" />
                <rect x="56" y="92" width="88" height="8" rx="4" fill="#003B6F" opacity="0.8" />

                <rect x="312" y="208" width="120" height="64" rx="8" fill="#001122" stroke="#003B6F" strokeWidth="1" opacity="0.9" />
                <rect x="320" y="218" width="56" height="6" rx="3" fill="#FFB800" opacity="0.8" />
                <rect x="320" y="230" width="96" height="4" rx="2" fill="#A5ACAF" opacity="0.5" />
                <rect x="320" y="240" width="64" height="4" rx="2" fill="#A5ACAF" opacity="0.3" />
                <rect x="320" y="252" width="80" height="8" rx="4" fill="#003B6F" opacity="0.8" />

                {/* Small status dots */}
                <circle cx="340" cy="88" r="6" fill="#4DFF00" opacity="0.9" />
                <circle cx="356" cy="88" r="6" fill="#4DFF00" opacity="0.7" />
                <circle cx="372" cy="88" r="6" fill="#FFB800" opacity="0.7" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social proof bar ── */}
      <section className="border-y border-white/10 bg-navy/20 py-8">
        <div className="mx-auto max-w-7xl px-6">
          <p className="mb-6 text-center text-sm font-medium text-grey">
            Trusted by ice facilities across North America
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {["Municipal Rinks", "University Facilities", "Private Clubs"].map(
              (label) => (
                <span
                  key={label}
                  className="rounded-full border border-white/20 px-5 py-2 text-sm font-medium text-grey"
                >
                  {label}
                </span>
              ),
            )}
          </div>
        </div>
      </section>

      {/* ── Module grid ── */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            Everything your facility needs
          </h2>
          <p className="mt-3 text-grey">
            Eight purpose-built modules, all included in one plan.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map(({ icon: Icon, name, description }) => (
            <div
              key={name}
              className="group rounded-xl border border-white/10 bg-navy/10 p-6 transition-colors hover:border-navy hover:bg-navy/20"
            >
              <div className="mb-4 inline-flex items-center justify-center rounded-lg bg-navy/40 p-3">
                <Icon className="h-6 w-6 text-green" />
              </div>
              <h3 className="mb-2 font-semibold text-white">{name}</h3>
              <p className="text-sm leading-relaxed text-grey">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── ROI Calculator ── */}
      <section className="bg-navy/10 py-24">
        <div className="mx-auto max-w-3xl px-6">
          <RoiCalculator />
        </div>
      </section>

      {/* ── Offline-first callout ── */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="rounded-2xl border border-green/20 bg-green/5 p-8 md:p-12">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:items-center">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-green">
                Offline-First PWA
              </p>
              <h2 className="text-3xl font-bold text-white md:text-4xl">
                Works when your WiFi doesn&apos;t.
              </h2>
              <p className="mt-4 leading-relaxed text-grey">
                Ice rink infrastructure and reliable WiFi don&apos;t always mix.
                RinkReports is a Progressive Web App built around that reality.
              </p>
              <p className="mt-3 leading-relaxed text-grey">
                Every report is saved to your device first and syncs when
                you&apos;re back online. Your team never waits for a server
                response. The sync queue handles the rest automatically in the
                background.
              </p>
              <Link
                href="/features"
                className="mt-6 inline-flex items-center text-sm font-semibold text-green hover:underline"
              >
                See all features &rarr;
              </Link>
            </div>
            {/* Offline visual */}
            <div aria-hidden="true" className="flex justify-center">
              <svg
                viewBox="0 0 280 200"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full max-w-xs"
              >
                {/* Phone outline */}
                <rect x="90" y="16" width="100" height="168" rx="12" fill="#001122" stroke="#003B6F" strokeWidth="2" />
                {/* Screen */}
                <rect x="96" y="28" width="88" height="128" rx="6" fill="#003B6F" opacity="0.3" />
                {/* Status bar offline icon */}
                <circle cx="140" cy="56" r="16" fill="#4DFF00" opacity="0.15" />
                <path d="M133 56 L140 49 L147 56" stroke="#4DFF00" strokeWidth="2" fill="none" strokeLinecap="round" />
                <line x1="140" y1="49" x2="140" y2="63" stroke="#4DFF00" strokeWidth="2" strokeLinecap="round" />
                {/* Form rows */}
                <rect x="104" y="84" width="72" height="8" rx="4" fill="#A5ACAF" opacity="0.4" />
                <rect x="104" y="100" width="56" height="8" rx="4" fill="#A5ACAF" opacity="0.3" />
                <rect x="104" y="116" width="64" height="8" rx="4" fill="#A5ACAF" opacity="0.3" />
                {/* Saved indicator */}
                <rect x="104" y="136" width="72" height="12" rx="6" fill="#4DFF00" opacity="0.8" />
                {/* Sync arrow */}
                <path d="M204 90 Q228 100 220 120" stroke="#4DFF00" strokeWidth="1.5" fill="none" strokeDasharray="4 3" strokeLinecap="round" />
                <circle cx="224" cy="122" r="3" fill="#4DFF00" opacity="0.7" />
                {/* Server */}
                <rect x="220" y="72" width="40" height="48" rx="6" fill="#001122" stroke="#003B6F" strokeWidth="1.5" />
                <line x1="228" y1="88" x2="252" y2="88" stroke="#A5ACAF" strokeWidth="1" strokeOpacity="0.5" />
                <line x1="228" y1="100" x2="252" y2="100" stroke="#A5ACAF" strokeWidth="1" strokeOpacity="0.5" />
                <circle cx="232" cy="80" r="3" fill="#4DFF00" opacity="0.6" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="bg-navy/30 py-24">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            Ready to modernize your rink operations?
          </h2>
          <p className="mt-4 text-grey">
            Join ice facilities across North America running on RinkReports.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center rounded-md bg-green px-8 py-3 text-base font-semibold text-darkbg shadow hover:opacity-90 transition-opacity"
            >
              Start Free Trial
            </Link>
            <Link
              href="/demo"
              className="inline-flex items-center rounded-md border border-white/20 px-8 py-3 text-base font-semibold text-white hover:border-white/50 transition-colors"
            >
              Request a Demo
            </Link>
          </div>
          <p className="mt-4 text-sm text-grey">
            14-day free trial. No credit card required.
          </p>
        </div>
      </section>
    </>
  );
}
