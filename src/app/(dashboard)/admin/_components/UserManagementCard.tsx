"use client";

import { useEffect, useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { Constants } from "@/lib/database.types";

const ROLES = Constants.public.Enums.user_role;
type Role = (typeof ROLES)[number];

/**
 * Staff Roster Management — section 8 of the Admin Control Center.
 *
 * One row per user in the facility with:
 *   * full name + email
 *   * role dropdown (super_admin / admin / manager / staff)
 *   * inline expandable certification grant grid that ties straight
 *     into the Positions & Certifications catalog defined in
 *     section 7
 *
 * The role dropdown is disabled for the current user (you can't
 * demote yourself out of admin) and the cert grants pull from the
 * same scheduling_certifications table the Scheduling editor reads.
 */
export function UserManagementCard() {
  const utils = trpc.useUtils();
  const list = trpc.admin.listUsers.useQuery();
  const certs = trpc.admin.scheduling.listCertifications.useQuery();
  const staffCerts = trpc.admin.scheduling.listStaffCerts.useQuery();
  const updateRole = trpc.admin.updateUserRole.useMutation({
    onSuccess: async () => {
      await utils.admin.listUsers.invalidate();
    },
  });
  const setStaffCerts = trpc.admin.scheduling.setStaffCerts.useMutation({
    onSuccess: () => utils.admin.scheduling.listStaffCerts.invalidate(),
  });

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Staff roster</h2>
      <p className="mt-1 text-sm text-grey">
        Members of this facility, their roles, and the certifications
        they hold. To add a new user, create them in Supabase Auth and
        refresh; once they exist they can be assigned a role and
        certifications here.
      </p>

      {list.isLoading && <p className="mt-4 text-sm text-grey">Loading…</p>}
      {list.error && <p className="mt-4 text-sm text-red">{list.error.message}</p>}
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
                <th className="py-2 pr-4 font-normal">Role</th>
                <th className="py-2 font-normal">Certifications</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((user) => {
                const isSelf = user.user_id === currentUserId;
                const grantedIds = new Set(
                  (staffCerts.data ?? [])
                    .filter((sc) => sc.user_id === user.user_id)
                    .map((sc) => sc.certification_id),
                );
                const isOpen = openId === user.user_id;
                return (
                  <UserRow
                    key={user.user_id}
                    user={user}
                    isSelf={isSelf}
                    grantedIds={grantedIds}
                    allCerts={certs.data ?? []}
                    isOpen={isOpen}
                    onToggle={() =>
                      setOpenId(isOpen ? null : user.user_id)
                    }
                    rolePending={updateRole.isPending}
                    onRoleChange={(role) =>
                      updateRole.mutate({ user_id: user.user_id, role })
                    }
                    certsPending={setStaffCerts.isPending}
                    onSaveCerts={(ids) =>
                      setStaffCerts.mutate({
                        user_id: user.user_id,
                        certification_ids: ids,
                      })
                    }
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {updateRole.error && (
        <p className="mt-3 text-sm text-red">{updateRole.error.message}</p>
      )}
      {setStaffCerts.error && (
        <p className="mt-3 text-sm text-red">{setStaffCerts.error.message}</p>
      )}
    </section>
  );
}

function UserRow({
  user,
  isSelf,
  grantedIds,
  allCerts,
  isOpen,
  onToggle,
  rolePending,
  onRoleChange,
  certsPending,
  onSaveCerts,
}: {
  user: {
    user_id: string;
    full_name: string | null;
    email: string;
    role: Role;
  };
  isSelf: boolean;
  grantedIds: ReadonlySet<string>;
  allCerts: ReadonlyArray<{ id: string; name: string }>;
  isOpen: boolean;
  onToggle: () => void;
  rolePending: boolean;
  onRoleChange: (role: Role) => void;
  certsPending: boolean;
  onSaveCerts: (ids: string[]) => void;
}) {
  return (
    <>
      <tr className="border-b border-grey/10 last:border-0">
        <td className="py-3 pr-4 text-white">
          {user.full_name || <span className="text-grey">—</span>}
        </td>
        <td className="py-3 pr-4 text-grey">{user.email}</td>
        <td className="py-3 pr-4">
          <select
            value={user.role}
            disabled={isSelf || rolePending}
            onChange={(e) => onRoleChange(e.target.value as Role)}
            title={isSelf ? "You can't change your own role" : undefined}
            className="rounded border border-grey/40 bg-darkbg px-2 py-1 text-white focus:border-navy focus:outline-none disabled:opacity-50"
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </td>
        <td className="py-3">
          <button
            type="button"
            onClick={onToggle}
            className="rounded border border-grey/40 px-2 py-1 text-xs text-grey hover:border-white hover:text-white"
          >
            {isOpen ? "Hide" : `${grantedIds.size} granted`}
          </button>
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={4} className="border-b border-grey/10 bg-darkbg/60 px-3 py-3">
            <CertGrantGrid
              key={`${user.user_id}:${[...grantedIds].sort().join(",")}`}
              allCerts={allCerts}
              grantedIds={grantedIds}
              isPending={certsPending}
              onSave={onSaveCerts}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function CertGrantGrid({
  allCerts,
  grantedIds,
  isPending,
  onSave,
}: {
  allCerts: ReadonlyArray<{ id: string; name: string }>;
  grantedIds: ReadonlySet<string>;
  isPending: boolean;
  onSave: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(grantedIds));
  const [dirty, setDirty] = useState(false);

  function toggle(id: string) {
    setDirty(true);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSave([...selected]);
    setDirty(false);
  }

  if (allCerts.length === 0) {
    return (
      <p className="text-xs text-grey">
        No certifications defined yet. Add some in the Positions &amp;
        Certifications section above.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2 text-xs">
        {allCerts.map((c) => (
          <label
            key={c.id}
            className="flex items-center gap-1 rounded border border-grey/30 px-2 py-1 text-grey"
          >
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={() => toggle(c.id)}
            />
            {c.name}
          </label>
        ))}
      </div>
      <div>
        <button
          type="submit"
          disabled={!dirty || isPending}
          className="rounded bg-navy px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save certs"}
        </button>
      </div>
    </form>
  );
}
