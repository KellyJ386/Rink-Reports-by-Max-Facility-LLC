import "server-only";

import { Resend } from "resend";
import type { Alert } from "@/lib/offline/types";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send an alert notification email via Resend.
 *
 * Only called for warning/critical alerts — info is UI-only.
 * Fire-and-forget from the fan-out service; errors are caught there.
 */
export async function sendAlertEmail(opts: {
  to: string;
  alert: Alert;
  facilityName: string;
}): Promise<void> {
  const { to, alert, facilityName } = opts;
  const subject = `[${alert.severity.toUpperCase()}] ${alert.title} — ${facilityName}`;
  const body = renderEmailHtml(alert, facilityName);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "alerts@rinkreports.app",
    to,
    subject,
    html: body,
  });
}

function severityColor(severity: Alert["severity"]): string {
  switch (severity) {
    case "critical":
      return "#F42A2A";
    case "warning":
      return "#FFB800";
    default:
      return "#A5ACAF";
  }
}

function renderEmailHtml(alert: Alert, facilityName: string): string {
  const badgeColor = severityColor(alert.severity);
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://rinkreports.app";
  const insightsUrl = `${appUrl}/dashboard/insights`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${alert.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">

          <!-- Header bar -->
          <tr>
            <td style="background-color:#003B6F;padding:20px 32px;">
              <p style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">
                RinkReports
              </p>
              <p style="margin:4px 0 0;color:#A5ACAF;font-size:13px;">
                ${facilityName}
              </p>
            </td>
          </tr>

          <!-- Severity badge + title -->
          <tr>
            <td style="padding:28px 32px 12px;">
              <span style="display:inline-block;background-color:${badgeColor};color:#ffffff;font-size:11px;font-weight:bold;padding:3px 10px;border-radius:4px;text-transform:uppercase;letter-spacing:0.8px;">
                ${alert.severity}
              </span>
              <h1 style="margin:12px 0 0;font-size:22px;color:#003B6F;line-height:1.3;">
                ${escapeHtml(alert.title)}
              </h1>
            </td>
          </tr>

          <!-- Description -->
          <tr>
            <td style="padding:0 32px 24px;">
              <p style="margin:0;font-size:15px;color:#333333;line-height:1.6;">
                ${escapeHtml(alert.description)}
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 32px 32px;">
              <a href="${insightsUrl}"
                 style="display:inline-block;background-color:#003B6F;color:#4DFF00;font-size:14px;font-weight:bold;padding:12px 24px;border-radius:6px;text-decoration:none;">
                View in RinkReports →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f4f4f4;padding:16px 32px;border-top:1px solid #e0e0e0;">
              <p style="margin:0;font-size:12px;color:#A5ACAF;">
                You are receiving this because you have alert notifications enabled for ${escapeHtml(facilityName)}.
                Manage your preferences in the RinkReports Admin Control Center.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
