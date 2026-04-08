import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for src/server/ingest/rateLimit.ts
 *
 * Uses Vitest fake timers to simulate time passage without actually
 * waiting 10 seconds.
 */

// The rate limiter uses module-level state, so we need to reset the
// module between tests that need a fresh Map. We use vi.resetModules()
// in beforeEach to get a clean slate.
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkIngestRateLimit", () => {
  it("allows the first call for a device", async () => {
    const { checkIngestRateLimit } = await import(
      "@/server/ingest/rateLimit"
    );
    expect(checkIngestRateLimit("device-A")).toBe(true);
  });

  it("blocks a second call within 10 seconds for the same device", async () => {
    const { checkIngestRateLimit } = await import(
      "@/server/ingest/rateLimit"
    );
    checkIngestRateLimit("device-A"); // first call — allowed
    vi.advanceTimersByTime(5_000); // 5 seconds later — still within window
    expect(checkIngestRateLimit("device-A")).toBe(false);
  });

  it("allows a different device within 10 seconds", async () => {
    const { checkIngestRateLimit } = await import(
      "@/server/ingest/rateLimit"
    );
    checkIngestRateLimit("device-A");
    vi.advanceTimersByTime(1_000);
    // device-B has never been seen — should be allowed
    expect(checkIngestRateLimit("device-B")).toBe(true);
  });

  it("allows a call after more than 10 seconds", async () => {
    const { checkIngestRateLimit } = await import(
      "@/server/ingest/rateLimit"
    );
    checkIngestRateLimit("device-A"); // first call
    vi.advanceTimersByTime(10_500); // 10.5 seconds — window has passed
    expect(checkIngestRateLimit("device-A")).toBe(true);
  });
});
