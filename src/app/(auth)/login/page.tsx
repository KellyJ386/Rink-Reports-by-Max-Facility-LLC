export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold text-navy">Sign in</h1>
      <p className="text-grey">
        Authentication wiring lands later in Phase 0. This route exists so the
        layout and route group are in place.
      </p>
      {/* TODO(phase-0): real Supabase email/password form. */}
    </main>
  );
}
