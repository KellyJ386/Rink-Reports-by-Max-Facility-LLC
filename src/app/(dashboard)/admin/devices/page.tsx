"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

type DeviceType =
  | "refrigeration_controller"
  | "air_quality_sensor"
  | "ice_depth_sensor";

const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  refrigeration_controller: "Refrigeration Controller",
  air_quality_sensor: "Air Quality Sensor",
  ice_depth_sensor: "Ice Depth Sensor",
};

/**
 * Device Management page — /admin/devices
 *
 * Admin-only page for registering and managing IoT devices that push
 * readings directly into RinkReports via the device ingest API.
 *
 * Device secrets are shown ONCE on creation and never stored in
 * plaintext. Admins must copy the secret immediately and configure
 * it on the physical device.
 */
export default function DevicesPage() {
  const utils = trpc.useUtils();
  const listQuery = trpc.devices.list.useQuery();

  const createMutation = trpc.devices.create.useMutation({
    onSuccess: () => {
      void utils.devices.list.invalidate();
    },
  });
  const deactivateMutation = trpc.devices.deactivate.useMutation({
    onSuccess: () => {
      void utils.devices.list.invalidate();
    },
  });
  const regenerateSecretMutation = trpc.devices.regenerateSecret.useMutation({
    onSuccess: (data) => {
      setRevealedSecret(data.secret);
      setRevealDialogOpen(true);
      void utils.devices.list.invalidate();
    },
  });

  // "Add Device" dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [deviceType, setDeviceType] =
    useState<DeviceType>("refrigeration_controller");
  const [customDeviceId, setCustomDeviceId] = useState("");

  // "Secret reveal" dialog state (shown after create or regenerate)
  const [revealDialogOpen, setRevealDialogOpen] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [revealedDeviceId, setRevealedDeviceId] = useState<string | null>(null);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate(
      {
        label: label.trim(),
        deviceType,
        deviceId: customDeviceId.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          setRevealedSecret(data.secret);
          setRevealedDeviceId(data.deviceId);
          setRevealDialogOpen(true);
          setAddDialogOpen(false);
          setLabel("");
          setCustomDeviceId("");
          setDeviceType("refrigeration_controller");
        },
      },
    );
  }

  function copyToClipboard(text: string) {
    void navigator.clipboard.writeText(text);
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin"
            className="mb-2 block text-sm text-[#A5ACAF] hover:text-white"
          >
            ← Admin Control Center
          </Link>
          <h1 className="text-2xl font-semibold text-[#003B6F]">
            Device Management
          </h1>
          <p className="mt-1 text-sm text-[#A5ACAF]">
            Register IoT devices that push readings directly into RinkReports
            via HMAC-authenticated device ingest endpoints.
          </p>
        </div>
        <button
          onClick={() => setAddDialogOpen(true)}
          className="rounded-md bg-[#003B6F] px-4 py-2 text-sm font-medium text-white hover:bg-[#003B6F]/90"
        >
          Add Device
        </button>
      </div>

      {/* Device list */}
      <section className="rounded-lg border border-[#A5ACAF]/30 bg-[#001122]/40 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">
          Registered Devices
        </h2>

        {listQuery.isLoading && (
          <p className="text-sm text-[#A5ACAF]">Loading devices…</p>
        )}

        {listQuery.isError && (
          <p className="text-sm text-[#F42A2A]">
            Failed to load devices. You may not have admin access.
          </p>
        )}

        {listQuery.data && listQuery.data.length === 0 && (
          <p className="text-sm text-[#A5ACAF]">
            No devices registered yet. Click &ldquo;Add Device&rdquo; to
            register your first IoT device.
          </p>
        )}

        {listQuery.data && listQuery.data.length > 0 && (
          <div className="divide-y divide-[#A5ACAF]/20">
            {listQuery.data.map((device) => (
              <div
                key={device.id}
                className="flex items-start justify-between gap-4 py-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">
                      {device.label}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        device.is_active
                          ? "bg-[#4DFF00]/10 text-[#4DFF00]"
                          : "bg-[#A5ACAF]/10 text-[#A5ACAF]"
                      }`}
                    >
                      {device.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-[#A5ACAF]">
                    {DEVICE_TYPE_LABELS[device.device_type as DeviceType] ??
                      device.device_type}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-[#A5ACAF]">
                    ID: {device.device_id}
                  </p>
                  {device.last_seen_at && (
                    <p className="mt-0.5 text-xs text-[#A5ACAF]">
                      Last seen:{" "}
                      {new Date(device.last_seen_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  <button
                    onClick={() =>
                      regenerateSecretMutation.mutate({ id: device.id })
                    }
                    disabled={
                      !device.is_active ||
                      regenerateSecretMutation.isPending
                    }
                    className="rounded-md border border-[#A5ACAF]/30 px-3 py-1.5 text-xs text-[#A5ACAF] hover:border-[#003B6F] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Regenerate Secret
                  </button>
                  {device.is_active && (
                    <button
                      onClick={() =>
                        deactivateMutation.mutate({ id: device.id })
                      }
                      disabled={deactivateMutation.isPending}
                      className="rounded-md border border-[#F42A2A]/40 px-3 py-1.5 text-xs text-[#F42A2A] hover:bg-[#F42A2A]/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Deactivate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add Device dialog */}
      {addDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-lg border border-[#A5ACAF]/30 bg-[#001122] p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-white">
              Register New Device
            </h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-sm text-[#A5ACAF]">
                  Label
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Compressor Room Controller"
                  required
                  className="w-full rounded-md border border-[#A5ACAF]/30 bg-[#001122] px-3 py-2 text-sm text-white placeholder:text-[#A5ACAF]/50 focus:border-[#003B6F] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-[#A5ACAF]">
                  Device Type
                </label>
                <select
                  value={deviceType}
                  onChange={(e) =>
                    setDeviceType(e.target.value as DeviceType)
                  }
                  className="w-full rounded-md border border-[#A5ACAF]/30 bg-[#001122] px-3 py-2 text-sm text-white focus:border-[#003B6F] focus:outline-none"
                >
                  <option value="refrigeration_controller">
                    Refrigeration Controller
                  </option>
                  <option value="air_quality_sensor">
                    Air Quality Sensor
                  </option>
                  <option value="ice_depth_sensor">Ice Depth Sensor</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-[#A5ACAF]">
                  Device ID{" "}
                  <span className="text-[#A5ACAF]/60">(optional)</span>
                </label>
                <input
                  type="text"
                  value={customDeviceId}
                  onChange={(e) => setCustomDeviceId(e.target.value)}
                  placeholder="Leave blank to auto-generate"
                  className="w-full rounded-md border border-[#A5ACAF]/30 bg-[#001122] px-3 py-2 text-sm text-white placeholder:text-[#A5ACAF]/50 focus:border-[#003B6F] focus:outline-none"
                />
              </div>
              {createMutation.isError && (
                <p className="text-sm text-[#F42A2A]">
                  {createMutation.error?.message ?? "Failed to create device"}
                </p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAddDialogOpen(false)}
                  className="rounded-md px-4 py-2 text-sm text-[#A5ACAF] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !label.trim()}
                  className="rounded-md bg-[#003B6F] px-4 py-2 text-sm font-medium text-white hover:bg-[#003B6F]/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {createMutation.isPending ? "Creating…" : "Create Device"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Secret reveal dialog */}
      {revealDialogOpen && revealedSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-lg rounded-lg border border-[#FFB800]/40 bg-[#001122] p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-semibold text-white">
              Device Secret
            </h2>
            <p className="mb-4 text-sm font-medium text-[#FFB800]">
              Copy this secret now — it will not be shown again.
            </p>

            {revealedDeviceId && (
              <div className="mb-3">
                <p className="mb-1 text-xs text-[#A5ACAF]">Device ID</p>
                <div className="flex items-center gap-2 rounded-md border border-[#A5ACAF]/30 bg-[#003B6F]/10 p-3">
                  <code className="flex-1 break-all font-mono text-sm text-white">
                    {revealedDeviceId}
                  </code>
                  <button
                    onClick={() => copyToClipboard(revealedDeviceId)}
                    className="flex-shrink-0 rounded-md border border-[#A5ACAF]/30 px-2 py-1 text-xs text-[#A5ACAF] hover:text-white"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            <div className="mb-4">
              <p className="mb-1 text-xs text-[#A5ACAF]">Plaintext Secret</p>
              <div className="flex items-center gap-2 rounded-md border border-[#FFB800]/30 bg-[#FFB800]/5 p-3">
                <code className="flex-1 break-all font-mono text-sm text-white">
                  {revealedSecret}
                </code>
                <button
                  onClick={() => copyToClipboard(revealedSecret)}
                  className="flex-shrink-0 rounded-md border border-[#FFB800]/40 px-2 py-1 text-xs text-[#FFB800] hover:bg-[#FFB800]/10"
                >
                  Copy
                </button>
              </div>
            </div>

            <p className="mb-4 text-xs text-[#A5ACAF]">
              Configure this secret on the physical device. The device must
              send an HMAC-SHA256 signature on every ingest request using
              this secret combined with your server&apos;s signing key.
            </p>

            <div className="flex justify-end">
              <button
                onClick={() => {
                  setRevealDialogOpen(false);
                  setRevealedSecret(null);
                  setRevealedDeviceId(null);
                }}
                className="rounded-md bg-[#003B6F] px-4 py-2 text-sm font-medium text-white hover:bg-[#003B6F]/90"
              >
                I&apos;ve saved the secret
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
