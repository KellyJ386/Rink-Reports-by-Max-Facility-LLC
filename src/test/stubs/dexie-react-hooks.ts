// Test stub for the "dexie-react-hooks" package.
// The real package is listed in package.json but not installed in the
// test environment. Tests that rely on useLiveQuery should vi.mock this
// module and control return values directly.
export function useLiveQuery(
  _querier: () => unknown,
  _deps?: unknown[],
  defaultResult?: unknown,
): unknown {
  return defaultResult;
}
