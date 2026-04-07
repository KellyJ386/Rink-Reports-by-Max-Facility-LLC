import type {
  AvailabilityBlock,
  AvailabilityStatus,
} from "@/modules/scheduling/schema";

/**
 * Greedy schedule auto-suggester.
 *
 * Given:
 *   - a list of openings (date, position, start, end) the manager
 *     declared for the week
 *   - the staff roster + which certs each holds
 *   - the position → required certs map
 *   - per-staff availability blocks for the week
 *
 * For each opening (in order), pick the staff member who is:
 *   1. AVAILABLE for the entire opening window (any block whose
 *      status is "available" or "preferred" covers the opening)
 *   2. holds every certification the position requires
 *   3. has the fewest already-assigned hours this week (load
 *      balancing)
 *   4. preferring staff whose blocks include "preferred" over plain
 *      "available"
 *
 * Returns one suggestion per opening — `assigned_user_id` may be
 * null if no eligible staff was found, in which case the opening is
 * flagged as a conflict.
 */

export interface ShiftOpening {
  position_id: string;
  start_at: Date;
  end_at: Date;
}

export interface StaffRosterEntry {
  user_id: string;
  certification_ids: ReadonlySet<string>;
}

export interface SuggestionInput {
  openings: readonly ShiftOpening[];
  staff: readonly StaffRosterEntry[];
  positionRequiredCerts: ReadonlyMap<string, ReadonlySet<string>>;
  /** Per-user availability blocks for the target week. */
  availability: ReadonlyMap<string, readonly AvailabilityBlock[]>;
  /** Monday of the target week (00:00 local). */
  weekStart: Date;
}

export interface ShiftSuggestion {
  opening: ShiftOpening;
  assigned_user_id: string | null;
  conflict_reason: string | null;
}

export function autoSuggestSchedule(
  input: SuggestionInput,
): ShiftSuggestion[] {
  const { openings, staff, positionRequiredCerts, availability, weekStart } =
    input;

  // Per-user running hour totals so we can balance load.
  const hoursAssigned = new Map<string, number>();
  for (const s of staff) hoursAssigned.set(s.user_id, 0);

  const suggestions: ShiftSuggestion[] = [];

  for (const opening of openings) {
    const required =
      positionRequiredCerts.get(opening.position_id) ?? new Set<string>();

    // Score each candidate. Lower score = better.
    interface Candidate {
      user_id: string;
      preferenceBoost: number;
      hours: number;
    }
    const candidates: Candidate[] = [];

    for (const member of staff) {
      // Cert gate.
      let hasAllCerts = true;
      for (const certId of required) {
        if (!member.certification_ids.has(certId)) {
          hasAllCerts = false;
          break;
        }
      }
      if (!hasAllCerts) continue;

      // Availability gate.
      const blocks = availability.get(member.user_id) ?? [];
      const cover = coverageStatus(blocks, weekStart, opening);
      if (cover === "unavailable" || cover === "uncovered") continue;

      candidates.push({
        user_id: member.user_id,
        preferenceBoost: cover === "preferred" ? 1 : 0,
        hours: hoursAssigned.get(member.user_id) ?? 0,
      });
    }

    if (candidates.length === 0) {
      suggestions.push({
        opening,
        assigned_user_id: null,
        conflict_reason: required.size
          ? "No certified, available staff for this opening"
          : "No available staff for this opening",
      });
      continue;
    }

    // Sort: prefer "preferred" coverage first, then fewest hours
    // assigned so far.
    candidates.sort((a, b) => {
      if (a.preferenceBoost !== b.preferenceBoost) {
        return b.preferenceBoost - a.preferenceBoost;
      }
      return a.hours - b.hours;
    });
    const winner = candidates[0]!;

    const durationHours =
      (opening.end_at.getTime() - opening.start_at.getTime()) / 3600000;
    hoursAssigned.set(
      winner.user_id,
      (hoursAssigned.get(winner.user_id) ?? 0) + durationHours,
    );

    suggestions.push({
      opening,
      assigned_user_id: winner.user_id,
      conflict_reason: null,
    });
  }

  return suggestions;
}

/**
 * Does this set of availability blocks cover the entire opening
 * window? Returns:
 *   - "preferred"   — fully covered AND at least one block is preferred
 *   - "available"   — fully covered, no preferred blocks involved
 *   - "uncovered"   — partial or no coverage
 *   - "unavailable" — any covering block is "unavailable"
 *
 * Comparison is in minute-of-week space, where minute = dow*1440 +
 * minute_of_day with dow=0 for Monday.
 */
function coverageStatus(
  blocks: readonly AvailabilityBlock[],
  weekStart: Date,
  opening: ShiftOpening,
): "preferred" | "available" | "uncovered" | "unavailable" {
  const startMin = minuteOfWeek(opening.start_at, weekStart);
  const endMin = minuteOfWeek(opening.end_at, weekStart);

  // Walk minute-by-minute (cheap because shifts are typically a few
  // hours; resolution is 1 minute, hard cap is one week = 10080).
  let anyPreferred = false;
  for (let m = startMin; m < endMin; m++) {
    const cover = coveringStatus(blocks, m);
    if (cover === null) return "uncovered";
    if (cover === "unavailable") return "unavailable";
    if (cover === "preferred") anyPreferred = true;
  }
  return anyPreferred ? "preferred" : "available";
}

function coveringStatus(
  blocks: readonly AvailabilityBlock[],
  minute: number,
): AvailabilityStatus | null {
  // If overlapping blocks disagree, "unavailable" wins, then
  // "preferred", then "available".
  let result: AvailabilityStatus | null = null;
  for (const b of blocks) {
    const blockStart = b.dow * 1440 + b.start_minute;
    const blockEnd = b.dow * 1440 + b.end_minute;
    if (minute >= blockStart && minute < blockEnd) {
      if (b.status === "unavailable") return "unavailable";
      if (b.status === "preferred") result = "preferred";
      else if (result !== "preferred") result = "available";
    }
  }
  return result;
}

function minuteOfWeek(date: Date, weekStart: Date): number {
  // Treat both dates as wall-clock for simplicity. Real production
  // would convert via the facility timezone.
  const ms = date.getTime() - weekStart.getTime();
  return Math.floor(ms / 60000);
}
