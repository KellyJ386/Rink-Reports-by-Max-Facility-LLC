"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

interface AuditEntryRow {
  id: string;
  facility_id: string | null;
  user_email: string;
  user_role: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  before_snapshot: unknown;
  after_snapshot: unknown;
  created_at: string;
}

/**
 * Audit Log Card — displays facility admin audit log.
 *
 * Shows timestamp, user email, role, action, resource type. Rows are
 * expandable to reveal before/after JSON snapshots. Supports a date
 * range filter (1-365 days) and an optional user email filter.
 * Admins can export the current view to CSV client-side.
 */
export function AuditLogCard() {
  const [days, setDays] = useState<number>(30);
  const [userEmail, setUserEmail] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query = (trpc.admin as any).getAuditLog.useQuery({
    days,
    userEmail: userEmail.trim() === "" ? undefined : userEmail.trim(),
    limit: 50,
  }) as {
    data: AuditEntryRow[] | undefined;
    isLoading: boolean;
    error: { message: string } | null;
  };
  const { data, isLoading, error } = query;
  const entries: AuditEntryRow[] = data ?? [];

  function handleExportCsv(): void {
    if (entries.length === 0) return;
    const headers = [
      "Timestamp",
      "User Email",
      "Role",
      "Action",
      "Resource Type",
      "Resource ID",
    ];
    const rows = entries.map((entry) => [
      new Date(entry.created_at).toLocaleString(),
      entry.user_email,
      entry.user_role,
      entry.action,
      entry.resource_type,
      entry.resource_id ?? "",
    ]);
    const escape = (v: string | number | null): string => {
      const s = v === null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      headers.map(escape).join(","),
      ...rows.map((row) => row.map(escape).join(",")),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-log-${new Date().toISOString().split("T")[0] ?? "export"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-lg border border-[#A5ACAF]/30 bg-[#001122]/40 p-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Audit Log</h2>
        <p className="mt-1 text-sm text-[#A5ACAF]">
          All admin actions and configuration changes
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="text-xs uppercase text-[#A5ACAF]">
            Date range
          </label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="mt-1 w-full rounded border border-[#A5ACAF]/30 bg-[#001122] px-3 py-2 text-sm text-white"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="text-xs uppercase text-[#A5ACAF]">
            Filter by email
          </label>
          <input
            type="email"
            value={userEmail}
            onChange={(e) => setUserEmail(e.target.value)}
            placeholder="user@example.com"
            className="mt-1 w-full rounded border border-[#A5ACAF]/30 bg-[#001122] px-3 py-2 text-sm text-white placeholder:text-[#A5ACAF]/50"
          />
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={entries.length === 0}
          className="rounded bg-[#4DFF00] px-3 py-2 text-sm font-semibold text-[#003B6F] disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      {isLoading && (
        <p className="mt-4 text-sm text-[#A5ACAF]">Loading audit log…</p>
      )}
      {error && (
        <p className="mt-4 text-sm text-[#F42A2A]">
          Failed to load audit log: {error.message}
        </p>
      )}

      {!isLoading && !error && (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#A5ACAF]/30 text-xs uppercase text-[#A5ACAF]">
                <th className="px-2 py-2">Time</th>
                <th className="px-2 py-2">User</th>
                <th className="px-2 py-2">Role</th>
                <th className="px-2 py-2">Action</th>
                <th className="px-2 py-2">Resource</th>
                <th className="px-2 py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-4 text-center text-[#A5ACAF]">
                    No entries for the selected filters.
                  </td>
                </tr>
              )}
              {entries.map((entry) => {
                const isOpen = expandedId === entry.id;
                return (
                  <tr
                    key={entry.id}
                    className="border-b border-[#A5ACAF]/10 align-top text-white"
                  >
                    <td className="px-2 py-2 text-xs">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-xs">{entry.user_email}</td>
                    <td className="px-2 py-2 text-xs">{entry.user_role}</td>
                    <td className="px-2 py-2 text-xs font-semibold">
                      {entry.action}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {entry.resource_type}
                      {entry.resource_id ? ` #${entry.resource_id}` : ""}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isOpen ? null : entry.id)}
                        className="text-[#4DFF00] underline"
                      >
                        {isOpen ? "Hide" : "Show"}
                      </button>
                      {isOpen && (
                        <pre className="mt-2 max-w-md overflow-x-auto rounded bg-black p-2 text-[10px]">
                          {JSON.stringify(
                            {
                              before: entry.before_snapshot,
                              after: entry.after_snapshot,
                            },
                            null,
                            2,
                          )}
                        </pre>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
