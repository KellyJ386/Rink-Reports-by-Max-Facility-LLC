import "server-only";

import webpush from "web-push";
import type { Alert } from "@/lib/offline/types";

// Generate VAPID keys once with: npx web-push generate-vapid-keys
// Store the output in your environment:
//   VAPID_PUBLIC_KEY=<publicKey>
//   VAPID_PRIVATE_KEY=<privateKey>
//   VAPID_EMAIL=<your-contact-email>
// Also expose the public key to the browser:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<publicKey>  (same value as VAPID_PUBLIC_KEY)
if (
  process.env.VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY &&
  process.env.VAPID_EMAIL
) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

/**
 * Send an alert web push notification.
 *
 * Only called for warning/critical alerts — info is UI-only.
 * Fire-and-forget from the fan-out service; errors are caught there.
 */
export async function sendAlertPush(opts: {
  subscription: webpush.PushSubscription;
  alert: Alert;
  facilityName: string;
}): Promise<void> {
  const payload = JSON.stringify({
    title: `${opts.facilityName} — ${opts.alert.title}`,
    body: opts.alert.description,
    icon: "/icons/icon-192.svg",
    badge: "/icons/icon-192.svg",
    data: { alertId: opts.alert.id },
  });
  await webpush.sendNotification(opts.subscription, payload);
}
