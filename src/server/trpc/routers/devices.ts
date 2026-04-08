import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";
import {
  generateDeviceSecret,
  hashDeviceSecret,
} from "@/server/ingest/auth";
import { hasPermission } from "@/lib/auth/roles";

/**
 * Device management sub-router. Mounted at the top level as `devices`.
 *
 * All procedures require admin (or super_admin) role. Writes go via
 * the service-role client so they bypass RLS (device_credentials has
 * no INSERT/UPDATE/DELETE policy for authenticated users by design).
 *
 * facility_id always comes from ctx.facilityId — never from input
 * (CLAUDE.md Rule 1).
 */

function requireAdmin(role: string | null | undefined): void {
  if (!role || !hasPermission(role as Parameters<typeof hasPermission>[0], "admin")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only admins can manage devices",
    });
  }
}

const DEVICE_TYPES = [
  "refrigeration_controller",
  "air_quality_sensor",
  "ice_depth_sensor",
] as const;

export const devicesRouter = router({
  /**
   * list — Return all devices registered for the calling facility.
   * hashed_secret is intentionally excluded from the response.
   */
  list: protectedProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      requireAdmin(ctx.role);

      const supabase = createSupabaseServiceRoleClient();
      const { data, error } = await supabase
        .from("device_credentials")
        .select(
          "id, device_id, device_type, label, last_seen_at, is_active, created_at",
        )
        .eq("facility_id", ctx.facilityId)
        .order("created_at", { ascending: false });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data ?? [];
    }),

  /**
   * create — Register a new IoT device for the calling facility.
   *
   * Generates a plaintext secret, stores SHA-256(secret) in the DB,
   * and returns the plaintext secret ONCE. It will not be retrievable
   * again — the admin must copy it now and configure it on the device.
   */
  create: protectedProcedure
    .input(
      z.object({
        label: z.string().min(1).max(120),
        deviceType: z.enum(DEVICE_TYPES),
        deviceId: z.string().min(1).max(120).optional(),
      }),
    )
    .mutation(
      async ({
        ctx,
        input,
      }): Promise<{
        deviceId: string;
        secret: string;
        id: string;
      }> => {
        requireAdmin(ctx.role);

        const plaintext = generateDeviceSecret();
        const hashedSecret = hashDeviceSecret(plaintext);

        // Generate a deviceId if not provided
        const deviceId =
          input.deviceId ??
          `${input.deviceType}-${ctx.facilityId.slice(0, 8)}-${Date.now()}`;

        const supabase = createSupabaseServiceRoleClient();
        const { data, error } = await supabase
          .from("device_credentials")
          .insert({
            facility_id: ctx.facilityId,
            device_id: deviceId,
            device_type: input.deviceType,
            label: input.label,
            hashed_secret: hashedSecret,
            is_active: true,
          })
          .select("id, device_id")
          .single();

        if (error || !data) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error?.message ?? "Failed to create device",
          });
        }

        // Return the plaintext secret ONCE — it will not be shown again.
        return {
          id: data.id,
          deviceId: data.device_id,
          secret: plaintext,
        };
      },
    ),

  /**
   * deactivate — Set is_active = false for a device in this facility.
   * Deactivated devices will fail HMAC verification at the ingest endpoint.
   */
  deactivate: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      requireAdmin(ctx.role);

      const supabase = createSupabaseServiceRoleClient();

      // Verify the device belongs to this facility before updating
      const { data: existing } = await supabase
        .from("device_credentials")
        .select("id, facility_id")
        .eq("id", input.id)
        .eq("facility_id", ctx.facilityId)
        .maybeSingle();

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not found",
        });
      }

      const { error } = await supabase
        .from("device_credentials")
        .update({ is_active: false })
        .eq("id", input.id)
        .eq("facility_id", ctx.facilityId);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return { ok: true };
    }),

  /**
   * regenerateSecret — Rotate the HMAC secret for a device.
   *
   * Generates a new plaintext secret, stores SHA-256(new secret),
   * and returns the plaintext ONCE. The old secret immediately stops
   * working — update the device's configuration before calling this.
   */
  regenerateSecret: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ secret: string }> => {
      requireAdmin(ctx.role);

      const supabase = createSupabaseServiceRoleClient();

      // Verify the device belongs to this facility
      const { data: existing } = await supabase
        .from("device_credentials")
        .select("id, facility_id")
        .eq("id", input.id)
        .eq("facility_id", ctx.facilityId)
        .maybeSingle();

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not found",
        });
      }

      const plaintext = generateDeviceSecret();
      const hashedSecret = hashDeviceSecret(plaintext);

      const { error } = await supabase
        .from("device_credentials")
        .update({ hashed_secret: hashedSecret })
        .eq("id", input.id)
        .eq("facility_id", ctx.facilityId);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // Return the new plaintext secret ONCE — it will not be shown again.
      return { secret: plaintext };
    }),
});
