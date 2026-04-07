import { CommunicationsClient } from "@/modules/communications/components/CommunicationsClient";

/**
 * Staff-facing Communications page.
 *
 * Inbox / Sent toggle + a Compose modal that lets users pick
 * recipients, write a message in markdown-ish formatting, and
 * optionally attach a finalized report from another module as a
 * PDF (generated client-side via jsPDF and uploaded to the
 * 'communications' Storage bucket).
 */
export default function CommunicationsPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold text-navy">Communications</h1>
        <p className="text-sm text-grey">
          Send internal messages and finalized report PDFs to other
          staff at this facility. Every PDF carries the Universal
          Module Header (facility, user, module, time, outdoor
          temperature).
        </p>
      </header>

      <CommunicationsClient />
    </main>
  );
}
