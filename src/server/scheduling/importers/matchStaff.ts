import "server-only";

/**
 * Staff matching for scheduling imports.
 *
 * Given a parsed staff identifier from an imported event (email or name
 * string) and a facility roster, return the best match with a confidence
 * score between 0 and 1.
 *
 * Matching strategy:
 *   1. If the parsed string looks like an email, try case-insensitive
 *      exact email match against roster entries with an email. Confidence
 *      1.0 on hit.
 *   2. Otherwise (or on email miss), fuzzy match against roster names
 *      using Levenshtein distance on lowercased strings:
 *        distance 0 → 1.0
 *        distance 1 → 0.9
 *        distance 2 → 0.8
 *        distance ≥ 3 → no match
 */

export interface StaffMember {
  id: string;
  name: string;
  email: string | null;
}

export interface StaffMatch {
  parsed: string;
  matched: StaffMember | null;
  confidence: number;
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]!;
      } else {
        dp[i]![j] =
          1 +
          Math.min(
            dp[i - 1]![j]!, // deletion
            dp[i]![j - 1]!, // insertion
            dp[i - 1]![j - 1]!, // substitution
          );
      }
    }
  }

  return dp[m]![n]!;
}

export function matchStaff(
  parsed: string,
  roster: StaffMember[],
): StaffMatch {
  const trimmed = parsed.trim();
  if (!trimmed) {
    return { parsed, matched: null, confidence: 0 };
  }

  // Exact email match
  if (trimmed.includes("@")) {
    const lower = trimmed.toLowerCase();
    for (const s of roster) {
      if (s.email && s.email.toLowerCase() === lower) {
        return { parsed, matched: s, confidence: 1.0 };
      }
    }
  }

  // Fuzzy name match
  if (roster.length === 0) {
    return { parsed, matched: null, confidence: 0 };
  }

  const lower = trimmed.toLowerCase();
  let best: { s: StaffMember; dist: number } | null = null;
  for (const s of roster) {
    const dist = levenshtein(lower, s.name.toLowerCase());
    if (best === null || dist < best.dist) {
      best = { s, dist };
    }
  }
  if (!best) {
    return { parsed, matched: null, confidence: 0 };
  }

  if (best.dist === 0) {
    return { parsed, matched: best.s, confidence: 1.0 };
  }
  if (best.dist === 1) {
    return { parsed, matched: best.s, confidence: 0.9 };
  }
  if (best.dist === 2) {
    return { parsed, matched: best.s, confidence: 0.8 };
  }
  return { parsed, matched: null, confidence: 0 };
}
