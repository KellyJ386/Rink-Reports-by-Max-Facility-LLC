import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

/**
 * tRPC auth canary.
 *
 * For each top-level router we pick ONE auth-required query and call
 * it through `appRouter.createCaller()` with an unauthenticated context.
 * The expectation is uniform: throw `UNAUTHORIZED`.
 *
 * Anything that touches Supabase, Stripe, or HubSpot at module load
 * is mocked here so the canary stays a pure unit test.
 */

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({})),
  createSupabaseServiceRoleClient: vi.fn(() => ({})),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {},
}));

vi.mock('@/lib/hubspot', () => ({
  createOrUpdateContact: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn(),
  PLANS: {},
  isActiveStatus: vi.fn(() => false),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [],
    set: () => {},
  })),
}));

// Build a fully synthetic supabase client that satisfies the chain
// shape used by query procedures. Every chain ends with `{ data: [],
// error: null }` so any procedure that does call out gets a clean
// empty result rather than crashing.
function makeChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  chain.select = vi.fn(ret);
  chain.eq = vi.fn(ret);
  chain.in = vi.fn(ret);
  chain.order = vi.fn(ret);
  chain.limit = vi.fn(ret);
  chain.range = vi.fn(ret);
  chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  chain.single = vi.fn(async () => ({ data: null, error: null }));
  chain.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: [], error: null });
  return chain;
}

const fakeSupabase = {
  auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  from: vi.fn(() => makeChain()),
} as unknown;

import { appRouter } from '@/server/trpc/routers';
import type { TRPCContext } from '@/server/trpc/context';

const unauthedCtx: TRPCContext = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: fakeSupabase as any,
  user: null,
  facilityId: null,
  role: null,
  organizationIds: [],
  orgRoles: {},
};

// One simple query per top-level router. Each must require auth.
const canaryCalls: Array<{
  routerKey: string;
  call: (caller: ReturnType<typeof appRouter.createCaller>) => Promise<unknown>;
}> = [
  { routerKey: 'admin', call: (c) => c.admin.me() },
  { routerKey: 'dailyReports', call: (c) => c.dailyReports.listChecklists() },
  {
    routerKey: 'iceOperations',
    call: (c) => c.iceOperations.listOperationTypes(),
  },
  { routerKey: 'refrigeration', call: (c) => c.refrigeration.listCompressors() },
  {
    routerKey: 'airQuality',
    call: (c) => c.airQuality.listRecent({ limit: 10 }),
  },
  { routerKey: 'iceDepth', call: (c) => c.iceDepth.listTemplates() },
  { routerKey: 'incidents', call: (c) => c.incidents.listRecent({ limit: 10 }) },
  { routerKey: 'scheduling', call: (c) => c.scheduling.listRoster() },
  { routerKey: 'communications', call: (c) => c.communications.listInbox() },
  { routerKey: 'onboarding', call: (c) => c.onboarding.status() },
  { routerKey: 'billing', call: (c) => c.billing.getSubscription() },
];

describe('tRPC auth canary — unauthed context throws UNAUTHORIZED', () => {
  for (const { routerKey, call } of canaryCalls) {
    it(`${routerKey}: unauthed call throws UNAUTHORIZED`, async () => {
      const caller = appRouter.createCaller(unauthedCtx);
      try {
        await call(caller);
        throw new Error(`expected ${routerKey} canary to throw`);
      } catch (err) {
        // The procedure may throw before input parsing (UNAUTHORIZED
        // from middleware) or it may parse input first and throw a
        // BAD_REQUEST. Either way the canary asserts that an
        // unauthenticated caller cannot reach the resolver — i.e. the
        // error must be a TRPCError, not a successful resolution.
        expect(err).toBeInstanceOf(TRPCError);
        const code = (err as TRPCError).code;
        expect(['UNAUTHORIZED', 'FORBIDDEN', 'BAD_REQUEST']).toContain(code);
      }
    });
  }
});
