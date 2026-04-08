import { describe, it, expect } from "vitest";
import { normalizeISportsman } from "@/server/scheduling/importers/adapters/iSportsmanAdapter";
import { normalizeMaxgalaxy } from "@/server/scheduling/importers/adapters/maxgalaxyAdapter";
import { normalizeActiveNetwork } from "@/server/scheduling/importers/adapters/activeNetworkAdapter";

// ---------------------------------------------------------------------------
// iSportsman adapter
// ---------------------------------------------------------------------------

describe("normalizeISportsman", () => {
  it("strips X-ISPORTSMAN-* lines", () => {
    const raw = [
      "BEGIN:VCALENDAR",
      "X-ISPORTSMAN-VENUE:Main Rink",
      "X-ISPORTSMAN-ID:12345",
      "PRODID:-//Test//Test//EN",
      "VERSION:2.0",
      "END:VCALENDAR",
    ].join("\r\n");

    const result = normalizeISportsman(raw);
    expect(result).not.toContain("X-ISPORTSMAN-VENUE");
    expect(result).not.toContain("X-ISPORTSMAN-ID");
    expect(result).toContain("BEGIN:VCALENDAR");
    expect(result).toContain("PRODID:-//Test//Test//EN");
  });

  it("is case-insensitive when stripping X-ISPORTSMAN- lines", () => {
    const raw = ["BEGIN:VCALENDAR", "x-isportsman-custom:value", "END:VCALENDAR"].join("\r\n");
    const result = normalizeISportsman(raw);
    expect(result).not.toContain("x-isportsman-custom");
  });

  it("preserves non-ISPORTSMAN lines intact", () => {
    const raw = "BEGIN:VCALENDAR\r\nPRODID:-//Test\r\nEND:VCALENDAR";
    const result = normalizeISportsman(raw);
    expect(result).toBe("BEGIN:VCALENDAR\r\nPRODID:-//Test\r\nEND:VCALENDAR");
  });

  it("handles LF-only line endings", () => {
    const raw = "BEGIN:VCALENDAR\nX-ISPORTSMAN-ID:1\nEND:VCALENDAR";
    const result = normalizeISportsman(raw);
    expect(result).not.toContain("X-ISPORTSMAN-ID");
    expect(result).toContain("BEGIN:VCALENDAR");
  });
});

// ---------------------------------------------------------------------------
// Maxgalaxy adapter
// ---------------------------------------------------------------------------

const MAXGALAXY_HEADER =
  "Event Name,Start Date,Start Time,End Date,End Time,Resource,Staff Name,Staff Email";

const MAXGALAXY_ROWS = [
  "Morning Skate,2026-04-10,06:00,2026-04-10,08:00,Ice Rink A,Alice Johnson,alice@example.com",
  "Afternoon Skate,2026-04-10,14:00,2026-04-10,16:00,Ice Rink B,Bob Smith,bob@example.com",
  "Evening Skate,2026-04-10,19:00,2026-04-10,21:00,Ice Rink A,,",
].join("\n");

const MAXGALAXY_CSV = `${MAXGALAXY_HEADER}\n${MAXGALAXY_ROWS}`;

describe("normalizeMaxgalaxy", () => {
  it("parses 3-row CSV into 3 ParsedShifts", () => {
    const shifts = normalizeMaxgalaxy(MAXGALAXY_CSV);
    expect(shifts).toHaveLength(3);
  });

  it("maps Event Name → title", () => {
    const shifts = normalizeMaxgalaxy(MAXGALAXY_CSV);
    expect(shifts[0]!.title).toBe("Morning Skate");
    expect(shifts[1]!.title).toBe("Afternoon Skate");
    expect(shifts[2]!.title).toBe("Evening Skate");
  });

  it("maps Start Date + Start Time → startAt Date", () => {
    const shifts = normalizeMaxgalaxy(MAXGALAXY_CSV);
    const d = shifts[0]!.startAt;
    // Should parse successfully (not NaN)
    expect(d instanceof Date ? !isNaN(d.getTime()) : false).toBe(true);
  });

  it("maps Resource → location", () => {
    const shifts = normalizeMaxgalaxy(MAXGALAXY_CSV);
    expect(shifts[0]!.location).toBe("Ice Rink A");
    expect(shifts[1]!.location).toBe("Ice Rink B");
  });

  it("maps Staff Email → attendees array", () => {
    const shifts = normalizeMaxgalaxy(MAXGALAXY_CSV);
    expect(shifts[0]!.attendees).toEqual(["alice@example.com"]);
    expect(shifts[1]!.attendees).toEqual(["bob@example.com"]);
    // Row with no email → empty attendees
    expect(shifts[2]!.attendees).toEqual([]);
  });

  it("sets externalId from title + startAt ISO", () => {
    const shifts = normalizeMaxgalaxy(MAXGALAXY_CSV);
    expect(shifts[0]!.externalId).toContain("Morning Skate");
  });

  it("missing required columns → throws descriptive error", () => {
    const badCsv = "Event Name,Start Date\nMorning Skate,2026-04-10";
    expect(() => normalizeMaxgalaxy(badCsv)).toThrowError(
      /Unrecognized Maxgalaxy format/,
    );
  });

  it("throws with list of missing columns", () => {
    const badCsv = "Event Name,Start Date\nMorning Skate,2026-04-10";
    expect(() => normalizeMaxgalaxy(badCsv)).toThrowError(/start time/i);
  });
});

// ---------------------------------------------------------------------------
// Active Network adapter
// ---------------------------------------------------------------------------

const VALID_ACTIVE_NETWORK_JSON = JSON.stringify({
  events: [
    {
      id: "evt-1",
      title: "Morning Session",
      start: "2026-04-10T06:00:00Z",
      end: "2026-04-10T08:00:00Z",
      location: "Main Rink",
      description: "Open skate",
      staffEmail: "alice@example.com",
    },
    {
      id: "evt-2",
      title: "Afternoon Session",
      start: "2026-04-10T14:00:00Z",
      end: "2026-04-10T16:00:00Z",
      location: null,
      description: null,
      staffEmail: null,
    },
  ],
});

describe("normalizeActiveNetwork", () => {
  it("valid JSON → correct number of ParsedShifts", () => {
    const shifts = normalizeActiveNetwork(VALID_ACTIVE_NETWORK_JSON);
    expect(shifts).toHaveLength(2);
  });

  it("maps id → externalId", () => {
    const shifts = normalizeActiveNetwork(VALID_ACTIVE_NETWORK_JSON);
    expect(shifts[0]!.externalId).toBe("evt-1");
    expect(shifts[1]!.externalId).toBe("evt-2");
  });

  it("maps title, start, end correctly", () => {
    const shifts = normalizeActiveNetwork(VALID_ACTIVE_NETWORK_JSON);
    expect(shifts[0]!.title).toBe("Morning Session");
    expect(shifts[0]!.startAt).toEqual(new Date("2026-04-10T06:00:00Z"));
    expect(shifts[0]!.endAt).toEqual(new Date("2026-04-10T08:00:00Z"));
  });

  it("maps location and description", () => {
    const shifts = normalizeActiveNetwork(VALID_ACTIVE_NETWORK_JSON);
    expect(shifts[0]!.location).toBe("Main Rink");
    expect(shifts[0]!.description).toBe("Open skate");
    expect(shifts[1]!.location).toBeNull();
    expect(shifts[1]!.description).toBeNull();
  });

  it("maps staffEmail → attendees array", () => {
    const shifts = normalizeActiveNetwork(VALID_ACTIVE_NETWORK_JSON);
    expect(shifts[0]!.attendees).toEqual(["alice@example.com"]);
    expect(shifts[1]!.attendees).toEqual([]);
  });

  it("malformed JSON → throws descriptive error", () => {
    expect(() => normalizeActiveNetwork("{not valid json")).toThrowError(
      /Active Network import: invalid JSON/,
    );
  });

  it("wrong shape (missing events array) → throws descriptive error", () => {
    expect(() =>
      normalizeActiveNetwork(JSON.stringify({ items: [] })),
    ).toThrowError(/Active Network import: unrecognized shape/);
  });

  it("event missing required field → throws", () => {
    const bad = JSON.stringify({
      events: [{ id: "1", start: "2026-04-10T06:00:00Z", end: "2026-04-10T08:00:00Z" }],
    });
    expect(() => normalizeActiveNetwork(bad)).toThrowError(
      /Active Network import: unrecognized shape/,
    );
  });
});
