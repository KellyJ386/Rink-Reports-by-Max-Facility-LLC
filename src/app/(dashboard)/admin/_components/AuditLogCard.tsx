"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Audit Log Card — displays facility admin audit log.
 * Shows timestamp, user email, role, action, resource type.
 * Expandable rows show before/after JSON snapshots.
 */
export function AuditLogCard() {
  const [days, setDays] = useState(30);
  const [userEmail, setUserEmail] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: entries, isLoading, error } = trpc.admin.getAuditLog.useQuery({
    days,
    userEmail: userEmail || undefined,
    limit: 50,
  });

  const handleExportCSV = () => {
    if (!entries || entries.length === 0) return;

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
      entry.resource_id || "",
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${cell}"`).join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 rounded-lg border border-[#A5ACAF] bg-white p-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-[#003B6F]">Audit Log</h3>
        <p className="text-sm text-[#A5ACAF]">
          All admin actions and configuration changes
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 rounded-lg bg-gray-50 p-4 sm:flex-row">
        <div className="flex-1">
          <label className="text-sm font-medium text-[#003B6F]">
            Date Range (days)
          </label>
          <Select value={days.toString()} onValueChange={(v) => setDays(parseInt(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <label className="text-sm font-medium text-[#003B6F]">
            Filter by email
          </label>
          <Input
            type="email"
            placeholder="user@example.com"
            value={userEmail}
            onChange={(e) => setUserEmail(e.target.value)}
            className="border-[#A5ACAF]"
          />
        </div>

        <div className="flex items-end">
          <Button
            onClick={handleExportCSV}
            disabled={!entries || entries.length === 0}
            variant="outline"
            className="border-[#003B6F] text-[#003B6F] hover:bg-[#003B6F] hover:text-white"
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-8 text-center text-[#A5ACAF]">Loading...</div>
      ) : error ? (
        <div className="py-8 text-center text-[#F42A2A]">
          Error loading audit log
        </div>
      ) : entries && entries.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#A5ACAF]">
                <th className="px-3 py-3 text-left text-sm font-semibold text-[#003B6F]">
                  Timestamp
                </th>
                <th className="px-3 py-3 text-left text-sm font-semibold text-[#003B6F]">
                  User Email
                </th>
                <th className="px-3 py-3 text-left text-sm font-semibold text-[#003B6F]">
                  Role
                </th>
                <th className="px-3 py-3 text-left text-sm font-semibold text-[#003B6F]">
                  Action
                </th>
                <th className="px-3 py-3 text-left text-sm font-semibold text-[#003B6F]">
                  Resource
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tbody key={entry.id}>
                  <tr
                    className="border-b border-[#A5ACAF] hover:bg-gray-50 cursor-pointer"
                    onClick={() =>
                      setExpandedId(expandedId === entry.id ? null : entry.id)
                    }
                  >
                    <td className="px-3 py-3 text-sm text-gray-700">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-700">
                      {entry.user_email}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-700">
                      <span className="inline-block rounded bg-gray-200 px-2 py-1 text-xs font-medium text-gray-800">
                        {entry.user_role}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-700">
                      {entry.action}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-700">
                      {entry.resource_type}
                      {entry.resource_id && ` • ${entry.resource_id}`}
                    </td>
                  </tr>

                  {/* Expandable row */}
                  {expandedId === entry.id && (
                    <tr className="border-b border-[#A5ACAF] bg-gray-50">
                      <td colSpan={5} className="px-3 py-4">
                        <div className="space-y-3 rounded bg-white p-3">
                          {entry.before_snapshot && (
                            <div>
                              <p className="text-xs font-semibold text-[#003B6F]">
                                Before
                              </p>
                              <pre className="mt-1 max-h-40 overflow-auto rounded bg-gray-100 p-2 text-xs text-gray-700">
                                {JSON.stringify(
                                  entry.before_snapshot,
                                  null,
                                  2,
                                )}
                              </pre>
                            </div>
                          )}
                          {entry.after_snapshot && (
                            <div>
                              <p className="text-xs font-semibold text-[#003B6F]">
                                After
                              </p>
                              <pre className="mt-1 max-h-40 overflow-auto rounded bg-gray-100 p-2 text-xs text-gray-700">
                                {JSON.stringify(
                                  entry.after_snapshot,
                                  null,
                                  2,
                                )}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-8 text-center text-[#A5ACAF]">
          No audit log entries found
        </div>
      )}
    </div>
  );
}
