import { describe, it, expect } from "vitest";
import { scrubSnapshot } from "@/server/audit/logger";

describe("auditLogger", () => {
  describe("scrubSnapshot", () => {
    it("redacts keys containing 'password'", () => {
      const obj = {
        username: "john",
        password: "secret123",
        email: "john@example.com",
      };
      const scrubbed = scrubSnapshot(obj);
      expect(scrubbed?.password).toBe("[REDACTED]");
      expect(scrubbed?.username).toBe("john");
      expect(scrubbed?.email).toBe("john@example.com");
    });

    it("redacts keys containing 'secret'", () => {
      const obj = {
        api_secret: "abc123",
        hashed_secret: "xyz789",
        publicKey: "pub123",
      };
      const scrubbed = scrubSnapshot(obj);
      expect(scrubbed?.api_secret).toBe("[REDACTED]");
      expect(scrubbed?.hashed_secret).toBe("[REDACTED]");
      expect(scrubbed?.publicKey).toBe("pub123");
    });

    it("redacts keys containing 'token'", () => {
      const obj = {
        calendar_feed_token: "token_abc123",
        refresh_token: "token_xyz",
        session: "normal_value",
      };
      const scrubbed = scrubSnapshot(obj);
      expect(scrubbed?.calendar_feed_token).toBe("[REDACTED]");
      expect(scrubbed?.refresh_token).toBe("[REDACTED]");
      expect(scrubbed?.session).toBe("normal_value");
    });

    it("recursively scrubs nested objects", () => {
      const obj = {
        user: {
          name: "John",
          password: "secret123",
          settings: {
            api_token: "token123",
          },
        },
      };
      const scrubbed = scrubSnapshot(obj);
      expect(scrubbed?.user).toMatchObject({
        name: "John",
        password: "[REDACTED]",
        settings: {
          api_token: "[REDACTED]",
        },
      });
    });

    it("handles null and undefined", () => {
      expect(scrubSnapshot(null)).toBe(null);
      expect(scrubSnapshot(undefined)).toBe(null);
    });

    it("does not redact array values", () => {
      const obj = {
        tags: ["password", "api_key"],
        normal_array: [1, 2, 3],
      };
      const scrubbed = scrubSnapshot(obj);
      expect(scrubbed?.tags).toEqual(["password", "api_key"]);
      expect(scrubbed?.normal_array).toEqual([1, 2, 3]);
    });

    it("is case-insensitive for key matching", () => {
      const obj = {
        Password: "secret1",
        PASSWORD: "secret2",
        PaSsWoRd: "secret3",
      };
      const scrubbed = scrubSnapshot(obj);
      expect(scrubbed?.Password).toBe("[REDACTED]");
      expect(scrubbed?.PASSWORD).toBe("[REDACTED]");
      expect(scrubbed?.PaSsWoRd).toBe("[REDACTED]");
    });
  });
});
