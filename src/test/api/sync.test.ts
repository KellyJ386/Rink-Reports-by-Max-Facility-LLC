import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Sync route tests.
 *
 * We mock @/lib/supabase-server so the route handler talks to a
 * fully synthetic Supabase client. The mock supports:
 *   - auth.getUser()
 *   - from('user_profiles').select(...).eq(...).maybeSingle()
 *   - from('daily_reports').insert(...).select(...).single()
 *   - from('daily_reports').select(...).eq(...).eq(...).maybeSingle()
 */

type AnyObj = Record<string, unknown>;

interface MockState {
  user: { id: string } | null;
  profile: { facility_id: string | null } | null;
  insertResult: { data: AnyObj | null; error: { message: string } | null };
  existingRow: { data: AnyObj | null; error: null };
}

const state: MockState = {
  user: null,
  profile: null,
  insertResult: { data: null, error: null },
  existingRow: { data: null, error: null },
};

function makeChain() {
  // A chain that supports .select().eq().eq().maybeSingle()
  // and .insert().select().single()
  const chain: AnyObj = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn();
  chain.single = vi.fn();
  chain.insert = vi.fn(() => chain);
  return chain;
}

const fromHandlers: Record<string, () => AnyObj> = {};

const mockSupabase = {
  auth: {
    getUser: vi.fn(async () => ({ data: { user: state.user } })),
  },
  from: vi.fn((table: string) => {
    if (fromHandlers[table]) return fromHandlers[table]();
    const chain = makeChain();
    return chain;
  }),
};

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(async () => mockSupabase),
}));

import { POST } from '@/app/api/sync/route';

const UUID_LOCAL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UUID_CHECK = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UUID_SERVER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function buildRequest(body: unknown) {
  return new Request('http://localhost/api/sync', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  state.user = null;
  state.profile = null;
  state.insertResult = { data: null, error: null };
  state.existingRow = { data: null, error: null };
  for (const k of Object.keys(fromHandlers)) delete fromHandlers[k];
  mockSupabase.from.mockClear();
  mockSupabase.auth.getUser.mockClear();
});

describe('POST /api/sync', () => {
  it('returns 401 when unauthenticated', async () => {
    state.user = null;
    const res = await POST(buildRequest({ writes: [] }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/unauthorized/i);
  });

  it('returns 403 when authenticated but no facility_id', async () => {
    state.user = { id: 'user-1' };
    fromHandlers['user_profiles'] = () => {
      const chain = makeChain();
      chain.maybeSingle = vi.fn(async () => ({
        data: { facility_id: null },
        error: null,
      }));
      return chain;
    };
    const res = await POST(buildRequest({ writes: [] }));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toMatch(/no facility/i);
  });

  it('idempotent replay: dup-key insert returns existing serverId with no error', async () => {
    state.user = { id: 'user-1' };

    fromHandlers['user_profiles'] = () => {
      const chain = makeChain();
      chain.maybeSingle = vi.fn(async () => ({
        data: { facility_id: 'facility-1' },
        error: null,
      }));
      return chain;
    };

    let dailyCallCount = 0;
    fromHandlers['daily_reports'] = () => {
      dailyCallCount += 1;
      const chain = makeChain();
      if (dailyCallCount === 1) {
        // First call: .insert(...).select(...).single() — return dup-key error
        chain.single = vi.fn(async () => ({
          data: null,
          error: {
            message: 'duplicate key value violates unique constraint',
          },
        }));
      } else {
        // Second call: .select().eq().eq().maybeSingle() — return existing
        chain.maybeSingle = vi.fn(async () => ({
          data: { id: UUID_SERVER },
          error: null,
        }));
      }
      return chain;
    };

    const res = await POST(
      buildRequest({
        writes: [
          {
            localId: UUID_LOCAL,
            table: 'daily_reports',
            payload: {
              local_id: UUID_LOCAL,
              checklist_id: UUID_CHECK,
              submitted_at: '2026-04-07T12:00:00.000Z',
              answers: [],
            },
            retryCount: 0,
          },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      results: Array<{ localId: string; serverId?: string; error?: string }>;
    };
    expect(body.ok).toBe(true);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].serverId).toBe(UUID_SERVER);
    expect(body.results[0].error).toBeUndefined();
  });

  it('unknown table: result row has clear error and no 500', async () => {
    state.user = { id: 'user-1' };
    fromHandlers['user_profiles'] = () => {
      const chain = makeChain();
      chain.maybeSingle = vi.fn(async () => ({
        data: { facility_id: 'facility-1' },
        error: null,
      }));
      return chain;
    };

    const res = await POST(
      buildRequest({
        writes: [
          {
            localId: UUID_LOCAL,
            table: 'no_such_table',
            payload: {},
            retryCount: 0,
          },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      results: Array<{ localId: string; error?: string }>;
    };
    expect(body.results[0].error).toBe('unknown table: no_such_table');
  });
});
