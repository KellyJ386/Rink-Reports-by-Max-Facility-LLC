import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav } from "./_components/MarketingNav";

export const metadata: Metadata = {
  title: "RinkReports — Ice Rink Operations Management Software",
  description:
    "The all-in-one platform for ice rink daily reports, refrigeration logs, incident tracking, and staff scheduling. Works offline.",
  openGraph: {
    title: "RinkReports — Ice Rink Operations Management Software",
    description:
      "The all-in-one platform for ice rink daily reports, refrigeration logs, incident tracking, and staff scheduling. Works offline.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen flex flex-col bg-darkbg text-white">
      {/* Sticky top nav */}
      <header className="sticky top-0 z-50 bg-darkbg/95 backdrop-blur-sm border-b border-white/10">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex h-16 items-center justify-between">
            {/* Wordmark */}
            <Link
              href="/"
              className="flex items-center gap-2 font-bold text-lg tracking-tight"
            >
              <span className="text-green">Rink</span>
              <span className="text-white">Reports</span>
            </Link>

            {/* Nav (client island for mobile toggle) */}
            <MarketingNav />
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-navy/60 bg-darkbg">
        <div className="mx-auto max-w-7xl px-6 py-12">
          {/* Brand divider line */}
          <div
            className="mb-8 h-0.5 w-16 rounded-full"
            style={{ background: "#003B6F" }}
          />
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-1">
              <span className="font-bold text-base">
                <span className="text-green">Rink</span>
                <span className="text-white">Reports</span>
              </span>
              <span className="text-sm text-grey">by Max Facility LLC</span>
            </div>

            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-grey">
              <Link href="/features" className="hover:text-white transition-colors">
                Features
              </Link>
              <Link href="/pricing" className="hover:text-white transition-colors">
                Pricing
              </Link>
              <Link href="/demo" className="hover:text-white transition-colors">
                Demo
              </Link>
              <Link href="/privacy" className="hover:text-white transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-white transition-colors">
                Terms
              </Link>
              <a
                href="mailto:hello@rinkreports.app"
                className="hover:text-white transition-colors"
              >
                hello@rinkreports.app
              </a>
            </nav>
          </div>

          <p className="mt-8 text-xs text-grey">
            &copy; {year} RinkReports by Max Facility LLC. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
