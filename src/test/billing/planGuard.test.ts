import { describe, it, expect, vi } from 'vitest';

/**
 * Unit tests for the plan guard state machine.
 *
 * We mock the Supabase client so no network calls are made.
 * Each test sets up the facility_config row that the guard reads
 * and asserts the correct { allowed, reason } result.
 */

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({})),
  createSupabaseServiceRoleClient: vi.fn(() => ({})),
}));

import { checkPlanAccess } from '@/server/billing/planGuard';
import type { Database } from '@/lib/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

type FacilityConfigRow = Partial<{
  plan_status: 'trial' | 'active' | 'past_due' | 'locked' | 'cancelled';
  trial_ends_at: string | null;
  past_due_since: string | null;
  enabled_modules: Record<string, boolean>;
}>;

function makeSupabase(row: FacilityConfigRow | null): SupabaseClient<Database> {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
  };
  return {
    from: vi.fn().mockReturnValue(chain),
  } as unknown as SupabaseClient<Database>;
}

function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
}

function pastDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

const FACILITY_ID = 'fac-test-1234';
const MODULE_KEY = 'dailyReports';

describe('checkPlanAccess', () => {
  it('active + module enabled → allowed: true, reason: active', async () => {
    const supabase = makeSupabase({
      plan_status: 'active',
      trial_ends_at: null,
      past_due_since: null,
      enabled_modules: { dailyReports: true },
    });
    const result = await checkPlanAccess(FACILITY_ID, MODULE_KEY, supabase);
    expect(result).toEqual({ allowed: true, reason: 'active' });
  });

  it('active + module disabled → allowed: false, reason: module_disabled', async () => {
    const supabase = makeSupabase({
      plan_status: 'active',
      trial_ends_at: null,
      past_due_since: null,
      enabled_modules: { dailyReports: false },
    });
    const result = await checkPlanAccess(FACILITY_ID, MODULE_KEY, supabase);
    expect(result).toEqual({ allowed: false, reason: 'module_disabled' });
  });

  it('trial + trial_ends_at in future → allowed: true, reason: trial_valid', async () => {
    const supabase = makeSupabase({
      plan_status: 'trial',
      trial_ends_at: futureDate(7),
      past_due_since: null,
      enabled_modules: {},
    });
    const result = await checkPlanAccess(FACILITY_ID, MODULE_KEY, supabase);
    expect(result).toEqual({ allowed: true, reason: 'trial_valid' });
  });

  it('trial + trial_ends_at in past → allowed: false, reason: trial_expired', async () => {
    const supabase = makeSupabase({
      plan_status: 'trial',
      trial_ends_at: pastDate(1),
      past_due_since: null,
      enabled_modules: {},
    });
    const result = await checkPlanAccess(FACILITY_ID, MODULE_KEY, supabase);
    expect(result).toEqual({ allowed: false, reason: 'trial_expired' });
  });

  it('past_due + past_due_since 3 days ago → allowed: true, reason: past_due_grace', async () => {
    const supabase = makeSupabase({
      plan_status: 'past_due',
      trial_ends_at: null,
      past_due_since: pastDate(3),
      enabled_modules: {},
    });
    const result = await checkPlanAccess(FACILITY_ID, MODULE_KEY, supabase);
    expect(result).toEqual({ allowed: true, reason: 'past_due_grace' });
  });

  it('past_due + past_due_since 10 days ago → allowed: false, reason: past_due_locked', async () => {
    const supabase = makeSupabase({
      plan_status: 'past_due',
      trial_ends_at: null,
      past_due_since: pastDate(10),
      enabled_modules: {},
    });
    const result = await checkPlanAccess(FACILITY_ID, MODULE_KEY, supabase);
    expect(result).toEqual({ allowed: false, reason: 'past_due_locked' });
  });

  it('cancelled → allowed: false, reason: cancelled', async () => {
    const supabase = makeSupabase({
      plan_status: 'cancelled',
      trial_ends_at: null,
      past_due_since: null,
      enabled_modules: {},
    });
    const result = await checkPlanAccess(FACILITY_ID, MODULE_KEY, supabase);
    expect(result).toEqual({ allowed: false, reason: 'cancelled' });
  });

  it('locked → allowed: false, reason: past_due_locked', async () => {
    const supabase = makeSupabase({
      plan_status: 'locked',
      trial_ends_at: null,
      past_due_since: null,
      enabled_modules: {},
    });
    const result = await checkPlanAccess(FACILITY_ID, MODULE_KEY, supabase);
    expect(result).toEqual({ allowed: false, reason: 'past_due_locked' });
  });

  it('null row (missing facility_config) → allowed: false, reason: cancelled', async () => {
    const supabase = makeSupabase(null);
    const result = await checkPlanAccess(FACILITY_ID, MODULE_KEY, supabase);
    expect(result).toEqual({ allowed: false, reason: 'cancelled' });
  });
});
