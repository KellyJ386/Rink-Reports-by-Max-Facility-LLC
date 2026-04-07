import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Alert } from "@/lib/offline/types";
import { sendAlertEmail } from "./email";
import { sendAlertSms } from "./sms";
import { sendAlertPush } from "./push";
import type webpush from "web-push";

/**
 * Severity order for min_severity filtering.
 * info=0, warning=1, critical=2
 */
const SEVERITY_ORDER: Record<"info" | "warning" | "critical", number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

/**
 * fanOutAlert — dispatch alert notifications to all opted-in users.
 *
 * Rules:
 *   - info alerts are UI-only and return immediately.
 *   - Each channel (email/sms/push) is fire-and-forget; a failure in
 *     one channel does NOT block the others (Promise.allSettled).
 *   - Cross-facility sends are impossible: prefs are filtered by
 *     alert.facilityId, and push subscriptions are also scoped to
 *     that facility.
 *   - This function never throws to its caller.
 */
export async function fanOutAlert(
  alert: Alert,
  facilityName: string,
  supabase: SupabaseClient<Database>,
): Promise<void> {
  // info is UI-only — never triggers notifications
  if (alert.severity === "info") {
    return;
  }

  try {
    // 1. Fetch prefs for this facility
    const { data: prefs, error: prefsErr } = await supabase
      .from("user_notification_prefs")
      .select(
        "user_id, email_enabled, sms_enabled, push_enabled, phone_number, min_severity, alert_types",
      )
      .eq("facility_id", alert.facilityId);

    if (prefsErr) {
      Sentry.captureException(new Error(prefsErr.message), {
        tags: { context: "fanout-fetch-prefs" },
      });
      return;
    }

    if (!prefs || prefs.length === 0) {
      return;
    }

    const alertSeverityOrder = SEVERITY_ORDER[alert.severity];

    // 2. For each user pref, collect sends
    const sendPromises: Promise<void>[] = [];

    for (const pref of prefs) {
      // Check min_severity: alert severity must be >= pref min_severity
      const minSeverityOrder =
        SEVERITY_ORDER[pref.min_severity as "info" | "warning" | "critical"] ??
        1;
      if (alertSeverityOrder < minSeverityOrder) {
        continue;
      }

      // Check alert_types filter: if non-empty, alert.alertType must be in list
      if (
        Array.isArray(pref.alert_types) &&
        pref.alert_types.length > 0 &&
        !pref.alert_types.includes(alert.alertType)
      ) {
        continue;
      }

      // Fetch user email from auth.users via admin API
      const { data: userData, error: userErr } =
        await supabase.auth.admin.getUserById(pref.user_id);

      if (userErr || !userData?.user?.email) {
        // Can't find user email — skip email/sms but push may still work
        console.warn(
          `fanOutAlert: could not fetch email for user ${pref.user_id}: ${userErr?.message ?? "no email"}`,
        );
      }

      const userEmail = userData?.user?.email ?? null;

      // Email channel
      if (pref.email_enabled && userEmail) {
        sendPromises.push(
          sendAlertEmail({ to: userEmail, alert, facilityName }),
        );
      }

      // SMS channel
      if (pref.sms_enabled && pref.phone_number) {
        sendPromises.push(
          sendAlertSms({
            to: pref.phone_number,
            alert,
            facilityName,
          }),
        );
      }

      // Push channel — fetch all subscriptions for this user+facility
      if (pref.push_enabled) {
        const { data: subs, error: subsErr } = await supabase
          .from("push_subscriptions")
          .select("subscription")
          .eq("user_id", pref.user_id)
          .eq("facility_id", alert.facilityId);

        if (subsErr) {
          Sentry.captureException(new Error(subsErr.message), {
            tags: { context: "fanout-fetch-push-subs" },
          });
        } else if (subs && subs.length > 0) {
          for (const sub of subs) {
            sendPromises.push(
              sendAlertPush({
                subscription: sub.subscription as webpush.PushSubscription,
                alert,
                facilityName,
              }),
            );
          }
        }
      }
    }

    if (sendPromises.length === 0) {
      return;
    }

    // 3. Dispatch all channels in parallel, fire-and-forget
    const settled = await Promise.allSettled(sendPromises);
    for (const outcome of settled) {
      if (outcome.status === "rejected") {
        console.error("fanOutAlert: channel send failed:", outcome.reason);
        Sentry.captureException(outcome.reason, {
          tags: { context: "fanout-channel-send" },
        });
      }
    }
  } catch (err) {
    // Never throw to caller
    console.error("fanOutAlert: unexpected error:", err);
    Sentry.captureException(err, { tags: { context: "fanout-unexpected" } });
  }
}
