import { describe, it, expect } from "vitest";
import { parseIcsToShifts } from "@/server/scheduling/importers/icsParser";

// Minimal valid ICS string builder
function makeIcs(events: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RinkReports Test//EN",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

function makeEvent(opts: {
  uid: string;
  summary: string;
  dtstart: string;
  dtend: string;
  location?: string;
  attendee?: string;
}): string {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `SUMMARY:${opts.summary}`,
    `DTSTART:${opts.dtstart}`,
    `DTEND:${opts.dtend}`,
  ];
  if (opts.location) lines.push(`LOCATION:${opts.location}`);
  if (opts.attendee) lines.push(`ATTENDEE:mailto:${opts.attendee}`);
  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseIcsToShifts", () => {
  it("simple ICS with 2 VEVENTs → 2 ParsedShifts", () => {
    const ics = makeIcs([
      makeEvent({
        uid: "event-1@test",
        summary: "Morning Skate",
        dtstart: "20260410T060000Z",
        dtend: "20260410T080000Z",
        location: "Main Rink",
        attendee: "alice@example.com",
      }),
      makeEvent({
        uid: "event-2@test",
        summary: "Afternoon Skate",
        dtstart: "20260410T140000Z",
        dtend: "20260410T160000Z",
      }),
    ]);

    const shifts = parseIcsToShifts(ics);
    expect(shifts).toHaveLength(2);
  });

  it("maps UID → externalId and SUMMARY → title", () => {
    const ics = makeIcs([
      makeEvent({
        uid: "my-uid-123@test",
        summary: "Hockey Practice",
        dtstart: "20260410T060000Z",
        dtend: "20260410T080000Z",
      }),
    ]);

    const shifts = parseIcsToShifts(ics);
    expect(shifts[0]!.externalId).toBe("my-uid-123@test");
    expect(shifts[0]!.title).toBe("Hockey Practice");
  });

  it("maps DTSTART/DTEND → startAt/endAt as Date objects", () => {
    const ics = makeIcs([
      makeEvent({
        uid: "evt-date@test",
        summary: "Test Event",
        dtstart: "20260410T060000Z",
        dtend: "20260410T080000Z",
      }),
    ]);

    const shifts = parseIcsToShifts(ics);
    const s = shifts[0]!;
    expect(s.startAt).toBeInstanceOf(Date);
    expect(s.endAt).toBeInstanceOf(Date);
    expect(s.startAt.toISOString()).toBe("2026-04-10T06:00:00.000Z");
    expect(s.endAt.toISOString()).toBe("2026-04-10T08:00:00.000Z");
  });

  it("extracts LOCATION → location field", () => {
    const ics = makeIcs([
      makeEvent({
        uid: "evt-loc@test",
        summary: "Test",
        dtstart: "20260410T060000Z",
        dtend: "20260410T080000Z",
        location: "Ice Rink B",
      }),
    ]);

    const shifts = parseIcsToShifts(ics);
    expect(shifts[0]!.location).toBe("Ice Rink B");
  });

  it("extracts ATTENDEE → attendees array (strips mailto:)", () => {
    const ics = makeIcs([
      makeEvent({
        uid: "evt-att@test",
        summary: "Test",
        dtstart: "20260410T060000Z",
        dtend: "20260410T080000Z",
        attendee: "bob@example.com",
      }),
    ]);

    const shifts = parseIcsToShifts(ics);
    expect(shifts[0]!.attendees).toEqual(["bob@example.com"]);
  });

  it("malformed VEVENT in the middle is skipped, others are parsed", () => {
    // Event with no SUMMARY should be skipped
    const malformed = [
      "BEGIN:VEVENT",
      "UID:bad-event@test",
      // No SUMMARY — should be skipped
      "DTSTART:20260410T060000Z",
      "DTEND:20260410T080000Z",
      "END:VEVENT",
    ].join("\r\n");

    const ics = makeIcs([
      makeEvent({
        uid: "good-1@test",
        summary: "Good Event 1",
        dtstart: "20260410T060000Z",
        dtend: "20260410T080000Z",
      }),
      malformed,
      makeEvent({
        uid: "good-2@test",
        summary: "Good Event 2",
        dtstart: "20260410T140000Z",
        dtend: "20260410T160000Z",
      }),
    ]);

    const shifts = parseIcsToShifts(ics);
    // malformed (no SUMMARY) is skipped
    expect(shifts).toHaveLength(2);
    expect(shifts.map((s) => s.title)).toEqual(["Good Event 1", "Good Event 2"]);
  });

  it("completely invalid ICS → returns empty array without throwing", () => {
    const shifts = parseIcsToShifts("this is not valid ICS content at all");
    expect(shifts).toEqual([]);
  });

  it("empty ICS → returns empty array", () => {
    const ics = makeIcs([]);
    const shifts = parseIcsToShifts(ics);
    expect(shifts).toEqual([]);
  });

  it("event without ATTENDEE has empty attendees array", () => {
    const ics = makeIcs([
      makeEvent({
        uid: "no-att@test",
        summary: "No Attendee",
        dtstart: "20260410T060000Z",
        dtend: "20260410T080000Z",
      }),
    ]);

    const shifts = parseIcsToShifts(ics);
    expect(shifts[0]!.attendees).toEqual([]);
  });
});
