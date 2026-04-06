export default function AdminPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-1 flex-col gap-4 px-6 py-12">
      <h1 className="text-3xl font-semibold text-navy">Admin Control Center</h1>
      <p className="text-grey">
        Per-module configuration panels land in Phase 1. All values written
        here flow to <code>facility_config</code> via{" "}
        <code>admin.upsertFacilityConfig</code>.
      </p>
    </main>
  );
}
