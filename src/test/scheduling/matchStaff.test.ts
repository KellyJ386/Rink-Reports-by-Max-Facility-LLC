import { describe, it, expect } from "vitest";
import {
  matchStaff,
  levenshtein,
  type StaffMember,
} from "@/server/scheduling/importers/matchStaff";

const roster: StaffMember[] = [
  { id: "uuid-1", name: "Alice Johnson", email: "alice@example.com" },
  { id: "uuid-2", name: "Bob Smith", email: "bob@example.com" },
  { id: "uuid-3", name: "Charlie Brown", email: null },
];

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });

  it("returns correct distance for single insertion", () => {
    expect(levenshtein("abc", "abcd")).toBe(1);
  });

  it("returns correct distance for single deletion", () => {
    expect(levenshtein("abcd", "abc")).toBe(1);
  });

  it("returns correct distance for single substitution", () => {
    expect(levenshtein("abc", "axc")).toBe(1);
  });

  it("handles empty strings", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
    expect(levenshtein("", "")).toBe(0);
  });
});

describe("matchStaff", () => {
  it("email exact match → confidence 1.0", () => {
    const result = matchStaff("alice@example.com", roster);
    expect(result.matched).not.toBeNull();
    expect(result.matched!.id).toBe("uuid-1");
    expect(result.confidence).toBe(1.0);
  });

  it("email exact match is case-insensitive", () => {
    const result = matchStaff("ALICE@EXAMPLE.COM", roster);
    expect(result.matched).not.toBeNull();
    expect(result.matched!.id).toBe("uuid-1");
    expect(result.confidence).toBe(1.0);
  });

  it("name distance 0 → confidence 1.0", () => {
    const result = matchStaff("Alice Johnson", roster);
    expect(result.matched).not.toBeNull();
    expect(result.matched!.id).toBe("uuid-1");
    expect(result.confidence).toBe(1.0);
  });

  it("name distance 1 → confidence 0.9", () => {
    // "Alice Johnso" is 1 char short → distance 1
    const result = matchStaff("Alice Johnso", roster);
    expect(result.matched).not.toBeNull();
    expect(result.matched!.id).toBe("uuid-1");
    expect(result.confidence).toBe(0.9);
  });

  it("name distance 2 → confidence 0.8", () => {
    // "Alice Johnsn" has 2 char differences from "Alice Johnson"
    // distance("alice johnsn", "alice johnson") = 1 (missing 'o') ... let's use a clearer example
    // "Bob Smit" is 1 deletion from "Bob Smith" (dist=1), use "Bob Si" (dist 2 from "Bob Smith")
    const result = matchStaff("Bob Si", roster);
    // "bob si" vs "bob smith" → distance is 3 (m,t,h missing)
    // Use a name that's exactly 2 away from "Alice Johnson"
    // "Alice Jhonson" → swap 'o' and 'h' = 2 substitutions
    const result2 = matchStaff("Alice Jhonson", roster);
    expect(result2.matched).not.toBeNull();
    expect(result2.matched!.id).toBe("uuid-1");
    expect(result2.confidence).toBe(0.8);
  });

  it("name distance > 2 → no match (confidence 0, matched null)", () => {
    // "XYZ Totally Different" is far from all roster entries
    const result = matchStaff("XYZ Totally Different Person", roster);
    expect(result.matched).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it("empty roster → no match", () => {
    const result = matchStaff("Alice Johnson", []);
    expect(result.matched).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it("empty parsed string → no match", () => {
    const result = matchStaff("", roster);
    expect(result.matched).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it("staff with null email does not crash on email-style input", () => {
    // Charlie Brown has no email; looking up an email shouldn't crash
    const result = matchStaff("charlie@example.com", roster);
    // Should not match (no user has that email), might fuzzy-match name
    // at minimum it should not throw
    expect(result).toBeDefined();
  });
});
