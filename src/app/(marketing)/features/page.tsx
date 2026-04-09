import type { Metadata } from "next";
import {
  ClipboardList,
  Snowflake,
  Thermometer,
  Wind,
  AlertTriangle,
  Calendar,
  MessageSquare,
  Settings,
  type LucideIcon,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Features — RinkReports",
  description:
    "Explore all eight RinkReports modules: daily reports, ice operations, refrigeration, air quality, incident reporting, scheduling, communications, and admin.",
};

interface Module {
  icon: LucideIcon;
  name: string;
  bullets: string[];
}

const modules: Module[] = [
  {
    icon: ClipboardList,
    name: "Daily Reports",
    bullets: [
      "Structured shift logs with configurable fields set by your admin",
      "Live weather summary pulled automatically from Open-Meteo using your facility's zip code",
      "Completion ring tracks report submission rates across your team",
      "PDF, CSV, and XLSX exports for audits and board reviews",
    ],
  },
  {
    icon: Snowflake,
    name: "Ice Operations",
    bullets: [
      "Log every resurfacing run, edge-cleaning session, and ice-related event",
      "Session types and operation categories configured by your admin — no hardcoded lists",
      "Historical trend view to spot patterns across days, weeks, and months",
      "Offline-first: logs are captured on-device and sync automatically",
    ],
  },
  {
    icon: Thermometer,
    name: "Refrigeration",
    bullets: [
      "Record brine temperature, suction pressure, discharge pressure, and custom readings",
      "Server-side drift detection alerts your team before equipment fails",
      "HMAC-signed device ingest endpoint accepts readings directly from refrigeration controllers",
      "EPA RMP refrigerant log export built in",
    ],
  },
  {
    icon: Wind,
    name: "Air Quality",
    bullets: [
      "Four-tier escalation: Normal, Caution, Action, Evacuate",
      "Server-side tier computation — historical rows are never retroactively changed",
      "Automatic alerts triggered on tier 3 (Action) and above",
      "Sensor ingest endpoint for continuous monitoring hardware",
    ],
  },
  {
    icon: AlertTriangle,
    name: "Incident Reporting",
    bullets: [
      "Structured incident forms for injuries, near-misses, and property damage",
      "OSHA 300 and 300A injury log generated directly from your incident records",
      "USA Hockey rink safety report pack included",
      "Weather context automatically attached to each incident from the daily weather record",
    ],
  },
  {
    icon: Calendar,
    name: "Employee Scheduling",
    bullets: [
      "Import shifts from ICS feeds, iSportsman, Maxgalaxy, and Active Network",
      "Recurring feed import runs nightly at 3am, auto-committing high-confidence shifts",
      "Levenshtein-based staff matching resolves imported names to your staff roster",
      "Public ICS calendar feed per facility, gated by a token you control",
    ],
  },
  {
    icon: MessageSquare,
    name: "Communications",
    bullets: [
      "Facility-wide announcements delivered to all staff",
      "Searchable message history so nothing gets lost in group chats",
      "Email, SMS (Twilio), and web push notification channels",
      "Per-user notification preferences managed from the admin panel",
    ],
  },
  {
    icon: Settings,
    name: "Admin Control Center",
    bullets: [
      "Configure every module: dropdowns, thresholds, tab names, positions — no code required",
      "User management with Admin, Staff, and Viewer roles",
      "Device credential management for sensor hardware (refrigeration, air quality, ice depth)",
      "Retention policy configuration with compliance-locked minimums (365 days)",
    ],
  },
];

/** Abstract inline SVG panel suggesting a dashboard */
function DashboardPanel({ flip }: { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 360 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full max-w-sm"
      aria-hidden="true"
    >
      {/* Card background */}
      <rect width="360" height="240" rx="16" fill="#001122" />
      <rect x="1" y="1" width="358" height="238" rx="15" stroke="#003B6F" strokeWidth="1" />
      {/* Header bar */}
      <rect x="16" y="16" width="200" height="12" rx="6" fill="#003B6F" opacity="0.8" />
      <rect x="16" y="36" width="120" height="8" rx="4" fill="#A5ACAF" opacity="0.3" />
      {/* Chart area */}
      {flip ? (
        <>
          {/* Heatmap grid */}
          {[0, 1, 2, 3, 4].map((row) =>
            [0, 1, 2, 3, 4, 5, 6].map((col) => (
              <rect
                key={`${row}-${col}`}
                x={16 + col * 46}
                y={60 + row * 30}
                width={40}
                height={24}
                rx={4}
                fill="#003B6F"
                opacity={0.1 + (((row * 7 + col) * 17) % 10) * 0.08}
              />
            )),
          )}
        </>
      ) : (
        <>
          {/* Bar chart */}
          {[80, 120, 60, 100, 140, 90, 110].map((h, i) => (
            <rect
              key={i}
              x={16 + i * 48}
              y={180 - h}
              width={36}
              height={h}
              rx={4}
              fill={i === 4 ? "#4DFF00" : "#003B6F"}
              opacity={i === 4 ? 0.9 : 0.6}
            />
          ))}
          {/* Line on top */}
          <polyline
            points="34,140 82,110 130,150 178,120 226,80 274,130 322,100"
            stroke="#4DFF00"
            strokeWidth="2"
            fill="none"
            strokeOpacity="0.7"
          />
        </>
      )}
      {/* Status pills */}
      <rect x="16" y="208" width="64" height="16" rx="8" fill="#4DFF00" opacity="0.2" />
      <rect x="88" y="208" width="64" height="16" rx="8" fill="#003B6F" opacity="0.5" />
      <rect x="160" y="208" width="64" height="16" rx="8" fill="#FFB800" opacity="0.2" />
    </svg>
  );
}

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-16 md:py-24">
      {/* Page header */}
      <div className="mb-16 max-w-2xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-green">
          All 8 modules
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight text-white md:text-5xl">
          Every tool your facility needs, nothing it doesn&apos;t.
        </h1>
        <p className="mt-4 text-lg text-grey">
          RinkReports is built around the real workflows of ice rink operators.
          Every module handles one job and handles it well.
        </p>
      </div>

      {/* Module sections — alternating layout */}
      <div className="space-y-24">
        {modules.map((mod, index) => {
          const Icon = mod.icon;
          const isEven = index % 2 === 1; // even index = left, odd = right (alternating)

          return (
            <section
              key={mod.name}
              className={`flex flex-col gap-12 md:flex-row md:items-center ${
                isEven ? "md:flex-row-reverse" : ""
              }`}
            >
              {/* Text side */}
              <div className="flex-1">
                <div className="mb-5 inline-flex items-center gap-3">
                  <span className="inline-flex items-center justify-center rounded-xl bg-navy/40 p-3">
                    <Icon className="h-7 w-7 text-green" />
                  </span>
                  <h2 className="text-2xl font-bold text-white md:text-3xl">
                    {mod.name}
                  </h2>
                </div>
                <ul className="space-y-3">
                  {mod.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-3">
                      <span
                        className="mt-1 h-2 w-2 shrink-0 rounded-full bg-green"
                        aria-hidden="true"
                      />
                      <span className="text-grey leading-relaxed">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Visual side */}
              <div
                className={`flex flex-1 items-center ${
                  isEven ? "justify-start" : "justify-end"
                }`}
              >
                <DashboardPanel flip={isEven} />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
