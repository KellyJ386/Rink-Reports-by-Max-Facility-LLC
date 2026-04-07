import { describe, it, expect } from "vitest";

import {
  hasPermission,
  isViewer,
  canMutate,
} from "@/lib/auth/roles";

describe("hasPermission", () => {
  it("admin has permission for viewer", () => {
    expect(hasPermission("admin", "viewer")).toBe(true);
  });

  it("viewer does NOT have permission for staff", () => {
    expect(hasPermission("viewer", "staff")).toBe(false);
  });

  it("manager has permission for manager (same level)", () => {
    expect(hasPermission("manager", "manager")).toBe(true);
  });

  it("staff does NOT have permission for manager", () => {
    expect(hasPermission("staff", "manager")).toBe(false);
  });

  it("super_admin has permission for all roles", () => {
    expect(hasPermission("super_admin", "admin")).toBe(true);
    expect(hasPermission("super_admin", "viewer")).toBe(true);
  });
});

describe("canMutate", () => {
  it("viewer cannot mutate", () => {
    expect(canMutate("viewer")).toBe(false);
  });

  it("staff can mutate", () => {
    expect(canMutate("staff")).toBe(true);
  });

  it("null cannot mutate", () => {
    expect(canMutate(null)).toBe(false);
  });

  it("undefined cannot mutate", () => {
    expect(canMutate(undefined)).toBe(false);
  });

  it("manager can mutate", () => {
    expect(canMutate("manager")).toBe(true);
  });

  it("admin can mutate", () => {
    expect(canMutate("admin")).toBe(true);
  });
});

describe("isViewer", () => {
  it("isViewer returns true for viewer", () => {
    expect(isViewer("viewer")).toBe(true);
  });

  it("isViewer returns false for admin", () => {
    expect(isViewer("admin")).toBe(false);
  });

  it("isViewer returns false for staff", () => {
    expect(isViewer("staff")).toBe(false);
  });

  it("isViewer returns false for null", () => {
    expect(isViewer(null)).toBe(false);
  });

  it("isViewer returns false for undefined", () => {
    expect(isViewer(undefined)).toBe(false);
  });
});
