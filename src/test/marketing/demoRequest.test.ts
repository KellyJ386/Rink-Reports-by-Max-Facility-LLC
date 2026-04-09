import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for /api/marketing/demo-request
 *
 * We mock:
 *   - @sentry/nextjs  — no-op capture to prevent real network calls
 *   - @/lib/hubspot   — fire-and-forget; failures must not block 200
 *   - resend          — confirmation email; failures must not block 200
 *
 * The route uses dynamic import for hubspot and instantiates Resend
 * inline, so we mock the modules via vi.mock at the top level.
 */

// ── Sentry mock ────────────────────────────────────────────────────────────
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

// ── HubSpot mock ───────────────────────────────────────────────────────────
const mockCreateOrUpdateContact = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/hubspot", () => ({
  createOrUpdateContact: mockCreateOrUpdateContact,
}));

// ── Resend mock ────────────────────────────────────────────────────────────
const mockEmailSend = vi.fn().mockResolvedValue({ id: "fake-id" });
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockEmailSend },
  })),
}));

// ── next/server shim ───────────────────────────────────────────────────────
// next/server is not available in the jsdom vitest environment, so we shim it.
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      body,
      json: async () => body,
    }),
  },
}));

// ── Helper to build a mock Request ────────────────────────────────────────
function makeRequest(body: unknown): Request {
  return {
    json: async () => body,
  } as unknown as Request;
}

const validPayload = {
  firstName: "Jane",
  lastName: "Smith",
  email: "jane@example.com",
  facilityName: "Riverside Ice Arena",
  facilityType: "municipal",
  staffCount: "11-25",
  message: "Interested in refrigeration module.",
};

describe("POST /api/marketing/demo-request", () => {
  let POST: (req: Request) => Promise<{ status: number; body: unknown }>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-import so mocks are fresh. Use a cache-bust comment to re-run.
    const mod = await import("@/app/api/marketing/demo-request/route");
    POST = mod.POST as unknown as typeof POST;
  });

  it("returns 200 { success: true } for a valid payload", async () => {
    const req = makeRequest(validPayload);
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it("returns 400 { error: 'Invalid form' } when email is missing", async () => {
    const { email: _email, ...noEmail } = validPayload;
    const req = makeRequest(noEmail);
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "Invalid form" });
  });

  it("returns 400 when email format is invalid", async () => {
    const req = makeRequest({ ...validPayload, email: "not-an-email" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "Invalid form" });
  });

  it("returns 400 when required facilityName is missing", async () => {
    const { facilityName: _fn, ...noFacility } = validPayload;
    const req = makeRequest(noFacility);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 even if HubSpot import throws", async () => {
    mockCreateOrUpdateContact.mockRejectedValueOnce(
      new Error("HubSpot down"),
    );
    const req = makeRequest(validPayload);
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it("returns 200 when RESEND_API_KEY is absent (no email sent)", async () => {
    const original = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;

    const req = makeRequest(validPayload);
    const res = await POST(req);
    expect(res.status).toBe(200);

    process.env.RESEND_API_KEY = original;
  });

  it("returns 200 even if Resend send throws", async () => {
    process.env.RESEND_API_KEY = "test-key";
    mockEmailSend.mockRejectedValueOnce(new Error("Resend error"));

    const req = makeRequest(validPayload);
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
