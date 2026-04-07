import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * useModuleConfig tests.
 *
 * NOTE: The actual hook in src/hooks/useModuleConfig.ts is currently
 * a thin wrapper around `trpc.admin.getConfig.useQuery({ module })`.
 * It does NOT yet read from Dexie, write to Dexie, or fall back to a
 * cached value when offline. The "cache hit / cache miss / offline
 * fallback" sub-tests described in Phase A Task 8 therefore cannot
 * be written against the current implementation. Those sub-tests
 * are documented as SKIPPED in AGENT2_DONE.md and will be added when
 * the hook gains its Dexie integration.
 *
 * What we CAN test today:
 *   1. The hook flattens the tRPC `[ { key, value } ]` rows into a
 *      `Record<key, value>` map.
 *   2. It returns an empty config object when the query has no data.
 *   3. It propagates `isLoading` from the underlying query.
 */

const useQueryMock = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      getConfig: {
        useQuery: (...args: unknown[]) => useQueryMock(...args),
      },
    },
  },
}));

import { useModuleConfig } from '@/hooks/useModuleConfig';

beforeEach(() => {
  useQueryMock.mockReset();
});

describe('useModuleConfig', () => {
  it('flattens rows into a key->value record', () => {
    useQueryMock.mockReturnValue({
      data: [
        { key: 'tabs', value: ['Resurface', 'Edge'] },
        { key: 'thresholds', value: { co: 25 } },
      ],
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() => useModuleConfig('ice-operations'));

    expect(result.current.config).toEqual({
      tabs: ['Resurface', 'Edge'],
      thresholds: { co: 25 },
    });
    expect(result.current.isLoading).toBe(false);
    expect(useQueryMock).toHaveBeenCalledWith({ module: 'ice-operations' });
  });

  it('returns empty config when query has no data', () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    const { result } = renderHook(() => useModuleConfig('air-quality'));

    expect(result.current.config).toEqual({});
    expect(result.current.isLoading).toBe(true);
  });

  it('propagates the query error object', () => {
    const fakeError = new Error('boom');
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: fakeError,
    });

    const { result } = renderHook(() => useModuleConfig('refrigeration'));

    expect(result.current.error).toBe(fakeError);
    expect(result.current.config).toEqual({});
  });
});
