import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-4xl font-semibold text-navy">RinkReports</h1>
      <p className="text-grey">
        Phase 0 foundation — sign in to access the dashboard.
      </p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="rounded bg-navy px-4 py-2 font-medium text-white hover:opacity-90"
        >
          Sign in
        </Link>
        <Link
          href="/dashboard"
          className="rounded border border-grey px-4 py-2 font-medium text-grey hover:border-navy hover:text-navy"
        >
          Dashboard
        </Link>
      </div>
    </main>
  );
}
