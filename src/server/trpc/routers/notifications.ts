import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import type { NotificationPrefs } from "@/lib/offline/types";

/**
 * Notifications sub-router — per-user notification preferences.
 *
 * Mounted at the top level as `notifications`.
 *
 * facility_id always comes from ctx.facilityId — never from input
 * (CLAUDE.md Rule 1).
 */

const UpsertPrefsInput = z.object({
  emailEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  phoneNumber: z.string().nullable(),
  minSeverity: z.enum(["info", "warning", "critical"]),
  alertTypes: z.array(z.string()),
});

export const notificationsRouter = router({
  /**
   * getNotificationPrefs — Returns the current user's notification prefs
   * for their facility. If no row exists, a default row is created first.
   */
  getNotificationPrefs: protectedProcedure.query(
    async ({ ctx }): Promise<NotificationPrefs> => {
      const { data: existing, error: selectErr } = await ctx.supabase
        .from("user_notification_prefs")
        .select("*")
        .eq("user_id", ctx.user.id)
        .eq("facility_id", ctx.facilityId)
        .maybeSingle();

      if (selectErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: selectErr.message,
        });
      }

      if (existing) {
        return rowToPrefs(existing);
      }

      // No row yet — insert defaults and return
      const { data: created, error: insertErr } = await ctx.supabase
        .from("user_notification_prefs")
        .insert({
          user_id: ctx.user.id,
          facility_id: ctx.facilityId,
          email_enabled: true,
          sms_enabled: false,
          push_enabled: false,
          phone_number: null,
          min_severity: "warning",
          alert_types: [],
        })
        .select("*")
        .single();

      if (insertErr || !created) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: insertErr?.message ?? "Failed to create default prefs",
        });
      }

      return rowToPrefs(created);
    },
  ),

  /**
   * upsertNotificationPrefs — Create or update the current user's
   * notification preferences for their facility.
   */
  upsertNotificationPrefs: protectedProcedure
    .input(UpsertPrefsInput)
    .mutation(async ({ ctx, input }): Promise<NotificationPrefs> => {
      const { data, error } = await ctx.supabase
        .from("user_notification_prefs")
        .upsert(
          {
            user_id: ctx.user.id,
            facility_id: ctx.facilityId,
            email_enabled: input.emailEnabled,
            sms_enabled: input.smsEnabled,
            push_enabled: input.pushEnabled,
            phone_number: input.phoneNumber,
            min_severity: input.minSeverity,
            alert_types: input.alertTypes,
          },
          { onConflict: "user_id,facility_id" },
        )
        .select("*")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Upsert returned no row",
        });
      }

      return rowToPrefs(data);
    }),
});

type PrefsRow = {
  id: string;
  user_id: string;
  facility_id: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  phone_number: string | null;
  min_severity: string;
  alert_types: string[];
};

function rowToPrefs(row: PrefsRow): NotificationPrefs {
  return {
    id: row.id,
    userId: row.user_id,
    facilityId: row.facility_id,
    emailEnabled: row.email_enabled,
    smsEnabled: row.sms_enabled,
    pushEnabled: row.push_enabled,
    phoneNumber: row.phone_number,
    minSeverity: row.min_severity as "info" | "warning" | "critical",
    alertTypes: row.alert_types,
  };
}
