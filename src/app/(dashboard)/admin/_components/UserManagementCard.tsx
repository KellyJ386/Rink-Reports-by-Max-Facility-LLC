"use client";

import { useEffect, useState } from "react";

import { trpc } from "@/lib/trpc";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { Constants } from "@/lib/database.types";

const ROLES = Constants.public.Enums.user_role;
type Role = (typeof ROLES)[number];

export function UserManagementCard() {
  const utils = trpc.useUtils();
  const list = trpc.admin.listUsers.useQuery();
  const updateRole = trpc.admin.updateUserRole.useMutation({
    onSuccess: async () => {
      await utils.admin.listUsers.invalidate();
    },
  });

  // The current user's id is needed to disable the self-row dropdown.
  // Reading from the browser Supabase client avoids a server round-trip.
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Users</h2>
      <p className="mt-1 text-sm text-grey">
        Members of this facility and their roles. To add a new user, create
        them in the Supabase Auth dashboard and refresh. Self-serve invites
        land in a later phase.
      </p>

      {list.isLoading && <p className="mt-4 text-sm text-grey">Loading…</p>}

      {list.error && (
        <p className="mt-4 text-sm text-red">{list.error.message}</p>
      )}

      {list.data && list.data.length === 0 && (
        <p className="mt-4 text-sm text-grey">No users yet.</p>
      )}

      {list.data && list.data.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-grey/30 text-grey">
                <th className="py-2 pr-4 font-normal">Name</th>
                <th className="py-2 pr-4 font-normal">Email</th>
                <th className="py-2 font-normal">Role</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((user) => {
                const isSelf = user.user_id === currentUserId;
                return (
                  <tr
                    key={user.user_id}
                    className="border-b border-grey/10 last:border-0"
                  >
                    <td className="py-3 pr-4 text-white">
                      {user.full_name || (
                        <span className="text-grey">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-grey">{user.email}</td>
                    <td className="py-3">
                      <select
                        value={user.role}
                        disabled={isSelf || updateRole.isPending}
                        onChange={(e) =>
                          updateRole.mutate({
                            user_id: user.user_id,
                            role: e.target.value as Role,
                          })
                        }
                        title={
                          isSelf
                            ? "You can't change your own role"
                            : undefined
                        }
                        className="rounded border border-grey/40 bg-darkbg px-2 py-1 text-white focus:border-navy focus:outline-none disabled:opacity-50"
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {updateRole.error && (
        <p className="mt-3 text-sm text-red">{updateRole.error.message}</p>
      )}
    </section>
  );
}
