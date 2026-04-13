import { MySchedulePage } from "@/modules/scheduling/components/staff/MySchedulePage";

export default function MyScheduleRoute() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-navy">My Schedule</h1>
        <p className="text-sm text-grey">View your shifts, request time off, and manage swaps.</p>
      </header>
      <MySchedulePage />
    </main>
  );
}
