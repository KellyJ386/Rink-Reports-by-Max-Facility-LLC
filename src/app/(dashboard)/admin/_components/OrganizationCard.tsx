"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc";

/**
 * Organization management card — visible only to super_admin users.
 *
 * Allows super admins to:
 *   1. Create a new organization
 *   2. Add a facility to an existing organization
 *   3. Invite a user as org_admin (best-effort — email invite is a TODO)
 *
 * This component checks ctx role via the tRPC query response — if the
 * user is not super_admin, the card simply renders nothing (the admin
 * page server component also gates on role, providing defense in depth).
 */
export function OrganizationCard() {
  // Fetch orgs (will throw FORBIDDEN for non-super-admin, caught below)
  const orgsQuery = trpc.superAdmin.listOrganizations.useQuery(undefined, {
    retry: false,
  });

  const createOrg = trpc.superAdmin.createOrganization.useMutation({
    onSuccess: () => {
      void orgsQuery.refetch();
      setNewOrgName("");
    },
  });

  const addFacilityMutation = trpc.superAdmin.addFacilityToOrg.useMutation({
    onSuccess: () => {
      setAddFacilityId("");
      setAddOrgId("");
    },
  });

  const inviteMutation = trpc.superAdmin.inviteOrgAdmin.useMutation();

  const [newOrgName, setNewOrgName] = useState("");
  const [addFacilityId, setAddFacilityId] = useState("");
  const [addOrgId, setAddOrgId] = useState("");
  const [inviteOrgId, setInviteOrgId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");

  // Don't render for non-super-admin (403 on the query signals this)
  if (orgsQuery.error?.data?.code === "FORBIDDEN") {
    return null;
  }

  const orgs = orgsQuery.data ?? [];

  return (
    <section className="rounded-lg border border-[#A5ACAF]/30 bg-[#001122]/40 p-6">
      <h2 className="text-xl font-semibold text-white">
        Organizations (Super Admin)
      </h2>
      <p className="mt-1 text-sm text-[#A5ACAF]">
        Create organizations, add facilities to an org, and invite org admins.
        Visible to super_admin only.
      </p>

      {orgsQuery.isLoading ? (
        <div className="mt-4 animate-pulse h-8 rounded bg-[#A5ACAF]/20" />
      ) : (
        <>
          {/* Existing orgs list */}
          {orgs.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-[#A5ACAF] mb-2">
                Existing Organizations
              </h3>
              <ul className="space-y-1">
                {orgs.map((org) => (
                  <li
                    key={org.id}
                    className="flex items-center gap-2 text-sm text-white"
                  >
                    <span className="font-medium">{org.name}</span>
                    <span className="text-xs text-[#A5ACAF]">({org.id})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Create org */}
          <div className="mt-6">
            <h3 className="text-sm font-medium text-[#A5ACAF] mb-2">
              Create Organization
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="Organization name"
                className="flex-1 rounded border border-[#A5ACAF]/30 bg-[#001122]/60 px-3 py-2 text-sm text-white placeholder-[#A5ACAF] focus:border-[#003B6F] focus:outline-none"
              />
              <button
                onClick={() => {
                  if (newOrgName.trim()) {
                    createOrg.mutate({ name: newOrgName.trim() });
                  }
                }}
                disabled={createOrg.isPending || !newOrgName.trim()}
                className="rounded-md bg-[#003B6F] px-4 py-2 text-sm font-medium text-white hover:bg-[#003B6F]/80 disabled:opacity-50"
              >
                {createOrg.isPending ? "Creating…" : "Create"}
              </button>
            </div>
            {createOrg.error && (
              <p className="mt-1 text-xs text-[#F42A2A]">
                {createOrg.error.message}
              </p>
            )}
          </div>

          {/* Add facility to org */}
          <div className="mt-6">
            <h3 className="text-sm font-medium text-[#A5ACAF] mb-2">
              Add Facility to Organization
            </h3>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={addFacilityId}
                onChange={(e) => setAddFacilityId(e.target.value)}
                placeholder="Facility UUID"
                className="flex-1 rounded border border-[#A5ACAF]/30 bg-[#001122]/60 px-3 py-2 text-sm text-white placeholder-[#A5ACAF] focus:border-[#003B6F] focus:outline-none"
              />
              <input
                type="text"
                value={addOrgId}
                onChange={(e) => setAddOrgId(e.target.value)}
                placeholder="Organization UUID"
                className="flex-1 rounded border border-[#A5ACAF]/30 bg-[#001122]/60 px-3 py-2 text-sm text-white placeholder-[#A5ACAF] focus:border-[#003B6F] focus:outline-none"
              />
              <button
                onClick={() => {
                  if (addFacilityId.trim() && addOrgId.trim()) {
                    addFacilityMutation.mutate({
                      facilityId: addFacilityId.trim(),
                      organizationId: addOrgId.trim(),
                    });
                  }
                }}
                disabled={
                  addFacilityMutation.isPending ||
                  !addFacilityId.trim() ||
                  !addOrgId.trim()
                }
                className="rounded-md bg-[#003B6F] px-4 py-2 text-sm font-medium text-white hover:bg-[#003B6F]/80 disabled:opacity-50"
              >
                {addFacilityMutation.isPending ? "Adding…" : "Add"}
              </button>
            </div>
            {addFacilityMutation.isSuccess && (
              <p className="mt-1 text-xs text-[#4DFF00]">
                Facility added to organization.
              </p>
            )}
            {addFacilityMutation.error && (
              <p className="mt-1 text-xs text-[#F42A2A]">
                {addFacilityMutation.error.message}
              </p>
            )}
          </div>

          {/* Invite org admin */}
          <div className="mt-6">
            <h3 className="text-sm font-medium text-[#A5ACAF] mb-2">
              Invite Org Admin
            </h3>
            <p className="mb-2 text-xs text-[#A5ACAF]">
              Note: Email invitations require admin auth setup (see TODO in
              superAdmin.inviteOrgAdmin). This currently only works for
              pre-existing users.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email address"
                className="flex-1 rounded border border-[#A5ACAF]/30 bg-[#001122]/60 px-3 py-2 text-sm text-white placeholder-[#A5ACAF] focus:border-[#003B6F] focus:outline-none"
              />
              <input
                type="text"
                value={inviteOrgId}
                onChange={(e) => setInviteOrgId(e.target.value)}
                placeholder="Organization UUID"
                className="flex-1 rounded border border-[#A5ACAF]/30 bg-[#001122]/60 px-3 py-2 text-sm text-white placeholder-[#A5ACAF] focus:border-[#003B6F] focus:outline-none"
              />
              <button
                onClick={() => {
                  if (inviteEmail.trim() && inviteOrgId.trim()) {
                    inviteMutation.mutate({
                      email: inviteEmail.trim(),
                      organizationId: inviteOrgId.trim(),
                    });
                  }
                }}
                disabled={
                  inviteMutation.isPending ||
                  !inviteEmail.trim() ||
                  !inviteOrgId.trim()
                }
                className="rounded-md bg-[#003B6F] px-4 py-2 text-sm font-medium text-white hover:bg-[#003B6F]/80 disabled:opacity-50"
              >
                {inviteMutation.isPending ? "Inviting…" : "Invite"}
              </button>
            </div>
            {inviteMutation.data && (
              <p
                className={`mt-1 text-xs ${
                  inviteMutation.data.success
                    ? "text-[#4DFF00]"
                    : "text-[#FFB800]"
                }`}
              >
                {inviteMutation.data.message}
              </p>
            )}
            {inviteMutation.error && (
              <p className="mt-1 text-xs text-[#F42A2A]">
                {inviteMutation.error.message}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
