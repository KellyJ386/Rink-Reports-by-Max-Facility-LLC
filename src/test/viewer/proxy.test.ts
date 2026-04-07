import { describe, it, expect } from "vitest";

/**
 * Unit tests for the viewer role redirect decision logic in src/proxy.ts.
 *
 * The full proxy function depends on Next.js Request/Response types,
 * Supabase SSR cookie management, and server-only environment, which
 * make it impractical to test end-to-end in jsdom.
 *
 * Instead, we test `viewerRedirectPath` — a pure function extracted
 * from the proxy for exactly this purpose. It encapsulates all the
 * redirect decision logic without any framework dependencies.
 */

// NOTE: proxy.ts uses `import "server-only"` via supabase-server, but
// viewerRedirectPath is a pure utility at module level — no server
// imports. We import it directly.
import { viewerRedirectPath } from "@/proxy";

describe("viewerRedirectPath — viewer role on /dashboard routes", () => {
  it("redirects viewer from /dashboard to /viewer/dashboard", () => {
    expect(viewerRedirectPath("/dashboard", "viewer")).toBe("/viewer/dashboard");
  });

  it("redirects viewer from /dashboard/something to /viewer/dashboard", () => {
    expect(viewerRedirectPath("/dashboard/ice-operations", "viewer")).toBe(
      "/viewer/dashboard",
    );
  });

  it("does NOT redirect viewer on /viewer routes (already in correct group)", () => {
    expect(viewerRedirectPath("/viewer/dashboard", "viewer")).toBeNull();
  });

  it("does NOT redirect viewer on /viewer/alerts", () => {
    expect(viewerRedirectPath("/viewer/alerts", "viewer")).toBeNull();
  });
});

describe("viewerRedirectPath — non-viewer role on /viewer routes", () => {
  it("redirects admin from /viewer/dashboard to /dashboard", () => {
    expect(viewerRedirectPath("/viewer/dashboard", "admin")).toBe("/dashboard");
  });

  it("redirects staff from /viewer/alerts to /dashboard", () => {
    expect(viewerRedirectPath("/viewer/alerts", "staff")).toBe("/dashboard");
  });

  it("redirects manager from /viewer to /dashboard", () => {
    expect(viewerRedirectPath("/viewer/dashboard", "manager")).toBe(
      "/dashboard",
    );
  });
});

describe("viewerRedirectPath — null/undefined role (unauthenticated)", () => {
  it("returns null for null role on /dashboard (auth gate handles it)", () => {
    expect(viewerRedirectPath("/dashboard", null)).toBeNull();
  });

  it("returns null for undefined role on /viewer (auth gate handles it)", () => {
    expect(viewerRedirectPath("/viewer/dashboard", undefined)).toBeNull();
  });
});

describe("viewerRedirectPath — unrelated paths", () => {
  it("returns null for /login regardless of role", () => {
    expect(viewerRedirectPath("/login", "viewer")).toBeNull();
    expect(viewerRedirectPath("/login", "admin")).toBeNull();
  });

  it("returns null for /admin path with admin role", () => {
    expect(viewerRedirectPath("/admin", "admin")).toBeNull();
  });
});
