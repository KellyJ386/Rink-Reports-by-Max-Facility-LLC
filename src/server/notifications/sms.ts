import "server-only";

import twilio from "twilio";
import type { Alert } from "@/lib/offline/types";

const client =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

/**
 * Send an alert SMS via Twilio.
 *
 * Only called for warning/critical alerts — info is UI-only.
 * Fire-and-forget from the fan-out service; errors are caught there.
 *
 * Requires:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM_NUMBER   (E.164 format, e.g. +15551234567)
 */
export async function sendAlertSms(opts: {
  to: string;
  alert: Alert;
  facilityName: string;
}): Promise<void> {
  if (!client) throw new Error("Twilio not configured");
  const body = `${opts.facilityName} [${opts.alert.severity}]: ${opts.alert.title}. ${opts.alert.description.slice(0, 100)}`;
  await client.messages.create({
    from: process.env.TWILIO_FROM_NUMBER!,
    to: opts.to,
    body,
  });
}
