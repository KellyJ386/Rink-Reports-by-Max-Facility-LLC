import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for fanOutAlert.
 *
 * All channel modules are mocked. Tests verify:
 *   1. email_enabled pref → sendAlertEmail called
 *   2. sms_enabled + phone_number → sendAlertSms called
 *   3. email reject → SMS still attempted (Promise.allSettled isolation)
 *   4. severity 'info' → no channels called (early return)
 *   5. pref min_severity 'critical' + alert severity 'warning' → no channels called
 *   6. pref alert_types filter mismatch → no channels called
 */

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const sendAlertEmailSpy = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
const sendAlertSmsSpy = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
const sendAlertPushSpy = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);

vi.mock("@/server/notifications/email", () => ({
  sendAlertEmail: (...args: unknown[]) => sendAlertEmailSpy(...args),
}));

vi.mock("@/server/notifications/sms", () => ({
  sendAlertSms: (...args: unknown[]) => sendAlertSmsSpy(...args),
}));

vi.mock("@/server/notifications/push", () => ({
  sendAlertPush: (...args: unknown[]) => sendAlertPushSpy(...args),
}));

import { fanOutAlert } from "@/server/notifications/fanout";
import type { Alert } from "@/lib/offline/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: "alert-uuid",
    facilityId: "facility-abc",
    alertType: "refrigeration_drift",
    severity: "warning",
    targetIdentifier: null,
    title: "Drift detected",
    description: "Suction pressure dropped",
    metadata: {},
    resolvedAt: null,
    resolvedBy: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSupabase(opts: {
  prefs?: unknown[];
  getUserById?: { user: { email: string } | null };
  pushSubs?: unknown[];
  prefsError?: { message: string } | null;
}) {
  const prefs = opts.prefs ?? [];
  const pushSubs = opts.pushSubs ?? [];
  const getUserByIdResult = {
    data: opts.getUserById ?? { user: { email: "user@example.com" } },
    error: null,
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "user_notification_prefs") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: vi.fn((resolve: (v: unknown) => void) =>
            resolve({
              data: prefs,
              error: opts.prefsError ?? null,
            }),
          ),
        };
      }
      if (table === "push_subscriptions") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: vi.fn((resolve: (v: unknown) => void) =>
            resolve({ data: pushSubs, error: null }),
          ),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) =>
          resolve({ data: [], error: null }),
        ),
      };
    }),
    auth: {
      admin: {
        getUserById: vi.fn(async () => getUserByIdResult),
      },
    },
  } as unknown as SupabaseClient<Database>;
}

// ── tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  sendAlertEmailSpy.mockClear();
  sendAlertSmsSpy.mockClear();
  sendAlertPushSpy.mockClear();
  vi.clearAllMocks();
  // Re-attach cleared spies
  sendAlertEmailSpy.mockResolvedValue(undefined);
  sendAlertSmsSpy.mockResolvedValue(undefined);
  sendAlertPushSpy.mockResolvedValue(undefined);
});

describe("fanOutAlert", () => {
  it("calls sendAlertEmail when email_enabled is true", async () => {
    const prefs = [
      {
        user_id: "user-1",
        email_enabled: true,
        sms_enabled: false,
        push_enabled: false,
        phone_number: null,
        min_severity: "warning",
        alert_types: [],
      },
    ];

    const supabase = makeSupabase({ prefs });
    await fanOutAlert(makeAlert(), "Test Rink", supabase);

    expect(sendAlertEmailSpy).toHaveBeenCalledTimes(1);
    expect(sendAlertEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: "user@example.com" }),
    );
    expect(sendAlertSmsSpy).not.toHaveBeenCalled();
  });

  it("calls sendAlertSms when sms_enabled is true and phone_number is set", async () => {
    const prefs = [
      {
        user_id: "user-1",
        email_enabled: false,
        sms_enabled: true,
        push_enabled: false,
        phone_number: "+15551234567",
        min_severity: "warning",
        alert_types: [],
      },
    ];

    const supabase = makeSupabase({ prefs });
    await fanOutAlert(makeAlert(), "Test Rink", supabase);

    expect(sendAlertSmsSpy).toHaveBeenCalledTimes(1);
    expect(sendAlertSmsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+15551234567" }),
    );
    expect(sendAlertEmailSpy).not.toHaveBeenCalled();
  });

  it("still calls SMS when email send rejects (Promise.allSettled isolation)", async () => {
    sendAlertEmailSpy.mockRejectedValue(new Error("Resend down"));

    const prefs = [
      {
        user_id: "user-1",
        email_enabled: true,
        sms_enabled: true,
        push_enabled: false,
        phone_number: "+15551234567",
        min_severity: "warning",
        alert_types: [],
      },
    ];

    const supabase = makeSupabase({ prefs });
    // Should not throw even though email fails
    await expect(
      fanOutAlert(makeAlert(), "Test Rink", supabase),
    ).resolves.toBeUndefined();

    expect(sendAlertEmailSpy).toHaveBeenCalledTimes(1);
    expect(sendAlertSmsSpy).toHaveBeenCalledTimes(1);
  });

  it("returns early without calling any channel for info severity", async () => {
    const prefs = [
      {
        user_id: "user-1",
        email_enabled: true,
        sms_enabled: true,
        push_enabled: false,
        phone_number: "+15551234567",
        min_severity: "info",
        alert_types: [],
      },
    ];

    const supabase = makeSupabase({ prefs });
    await fanOutAlert(makeAlert({ severity: "info" }), "Test Rink", supabase);

    expect(sendAlertEmailSpy).not.toHaveBeenCalled();
    expect(sendAlertSmsSpy).not.toHaveBeenCalled();
    expect(sendAlertPushSpy).not.toHaveBeenCalled();
  });

  it("skips user when pref min_severity is critical and alert severity is warning", async () => {
    const prefs = [
      {
        user_id: "user-1",
        email_enabled: true,
        sms_enabled: true,
        push_enabled: false,
        phone_number: "+15551234567",
        min_severity: "critical",
        alert_types: [],
      },
    ];

    const supabase = makeSupabase({ prefs });
    await fanOutAlert(makeAlert({ severity: "warning" }), "Test Rink", supabase);

    expect(sendAlertEmailSpy).not.toHaveBeenCalled();
    expect(sendAlertSmsSpy).not.toHaveBeenCalled();
  });

  it("skips user when alert_types filter does not match alert.alertType", async () => {
    const prefs = [
      {
        user_id: "user-1",
        email_enabled: true,
        sms_enabled: false,
        push_enabled: false,
        phone_number: null,
        min_severity: "warning",
        alert_types: ["refrigeration_drift"], // only this type
      },
    ];

    const supabase = makeSupabase({ prefs });
    // Alert type is missed_daily_report — doesn't match
    await fanOutAlert(
      makeAlert({ alertType: "missed_daily_report" }),
      "Test Rink",
      supabase,
    );

    expect(sendAlertEmailSpy).not.toHaveBeenCalled();
  });
});
