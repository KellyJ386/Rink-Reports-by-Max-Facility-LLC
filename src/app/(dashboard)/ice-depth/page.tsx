import { IceDepthClient } from "@/modules/ice-depth/components/IceDepthClient";

/**
 * Staff-facing Ice Depth page.
 *
 * Auth + facility resolution is enforced by the (dashboard) layout,
 * so this server component just renders the client island.
 */
export default function IceDepthPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1 print:hidden">
        <h1 className="text-3xl font-semibold text-navy">Ice Depth</h1>
        <p className="text-sm text-grey">
          Pick a measurement template, walk the rink, and tap each
          point to record a thickness. Use a Bluetooth caliper if you
          have one — readings auto-fill the active point.
        </p>
      </header>

      <IceDepthClient />
    </main>
  );
}
