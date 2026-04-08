import "server-only";

// In-memory rate limiter. One Map entry per deviceId, value = last allowed
// request timestamp in milliseconds.
//
// IMPORTANT: This is only safe for single-lane (single worker) deployments.
// Vercel serverless functions may run in multiple isolated instances, so
// this Map is NOT shared across lanes. Two concurrent requests from the
// same device can both pass if they land in different instances.
//
// TODO Phase E+: swap to Upstash Redis when available for multi-lane
// distributed rate limiting. Use @upstash/ratelimit with a sliding window.
const lastSeen = new Map<string, number>();
const WINDOW_MS = 10_000; // 10 seconds

/**
 * Returns true if the request is allowed (within rate limit), false if
 * it should be rejected with 429.
 *
 * Side effect: updates lastSeen[deviceId] when allowed.
 */
export function checkIngestRateLimit(deviceId: string): boolean {
  const now = Date.now();
  const prev = lastSeen.get(deviceId) ?? 0;
  if (now - prev < WINDOW_MS) return false;
  lastSeen.set(deviceId, now);
  return true;
}
