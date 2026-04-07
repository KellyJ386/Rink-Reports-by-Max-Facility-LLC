import { AirQualityClient } from "@/modules/air-quality/components/AirQualityClient";

/**
 * Staff-facing Air Quality page.
 *
 * Auth + facility resolution is enforced by the (dashboard) layout,
 * so this server component just renders the client island that
 * handles the form, live tier preview, action protocol display, and
 * the recent readings panel.
 */
export default function AirQualityPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold text-navy">Air Quality</h1>
        <p className="text-sm text-grey">
          Log CO and NO₂ readings. The current escalation tier is
          computed live from your facility&rsquo;s thresholds and the
          required action protocol is shown alongside.
        </p>
      </header>

      <AirQualityClient />
    </main>
  );
}
