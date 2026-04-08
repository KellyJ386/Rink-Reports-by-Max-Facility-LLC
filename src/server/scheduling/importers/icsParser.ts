import "server-only";

import ICAL from "ical.js";

import type { ParsedShift } from "./types";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Parse an ICS string into an array of ParsedShift objects.
 *
 * Handles:
 *  - Single (non-recurring) VEVENTs
 *  - Recurring VEVENTs via ICAL.RecurExpansion (90-day horizon)
 *  - VTIMEZONE components (ical.js registers them automatically)
 *  - Malformed events are skipped with a console.warn
 */
export function parseIcsToShifts(icsContent: string): ParsedShift[] {
  const results: ParsedShift[] = [];

  let jcalData: unknown[];
  try {
    // ICAL.parse returns a jCal array for a single calendar.
    jcalData = ICAL.parse(icsContent) as unknown[];
  } catch (err) {
    console.warn("[icsParser] Failed to parse ICS content:", err);
    return results;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comp = new ICAL.Component(jcalData as any);

  // Register all VTIMEZONE components so RRULE expansion uses correct
  // local times. ical.js handles this automatically when you create the
  // component tree from the parsed jCal data.
  const vtimezones = comp.getAllSubcomponents("vtimezone");
  for (const vtz of vtimezones) {
    try {
      ICAL.TimezoneService.register(vtz);
    } catch {
      // Ignore timezone registration failures — ical.js falls back to UTC
    }
  }

  const vevents = comp.getAllSubcomponents("vevent");
  const horizonMs = Date.now() + NINETY_DAYS_MS;

  for (const vevent of vevents) {
    try {
      const event = new ICAL.Event(vevent);

      // Required fields — skip if missing
      const uid = event.uid;
      const summary = event.summary;
      if (!uid || !summary) {
        console.warn("[icsParser] Skipping event missing uid or summary", uid);
        continue;
      }

      // Attendees
      const attendees: string[] = [];
      const attendeeProps = vevent.getAllProperties("attendee");
      for (const prop of attendeeProps) {
        const val = prop.getFirstValue();
        if (typeof val === "string" && val) {
          // Attendee values are typically "mailto:email@example.com"
          attendees.push(val.replace(/^mailto:/i, ""));
        }
      }

      const rawEvent: Record<string, unknown> = {
        uid,
        summary,
        location: event.location ?? null,
        description: event.description ?? null,
      };

      if (event.isRecurring()) {
        // Expand recurring events up to 90 days from now
        const expansion = new ICAL.RecurExpansion({
          component: vevent,
          dtstart: event.startDate,
        });

        let next: InstanceType<typeof ICAL.Time> | null = expansion.next();
        while (next) {
          const startMs = next.toJSDate().getTime();
          if (startMs > horizonMs) break;

          // Calculate duration for each occurrence
          const duration = event.duration;
          const endDate = next.clone();
          endDate.addDuration(duration);

          results.push({
            externalId: `${uid}_${next.toICALString()}`,
            title: summary,
            startAt: next.toJSDate(),
            endAt: endDate.toJSDate(),
            location: event.location ?? null,
            description: event.description ?? null,
            attendees,
            rawEvent: { ...rawEvent, dtstart: next.toICALString() },
          });

          next = expansion.next();
        }
      } else {
        // Single event
        if (!event.startDate || !event.endDate) {
          console.warn("[icsParser] Skipping event missing start/end dates", uid);
          continue;
        }

        results.push({
          externalId: uid,
          title: summary,
          startAt: event.startDate.toJSDate(),
          endAt: event.endDate.toJSDate(),
          location: event.location ?? null,
          description: event.description ?? null,
          attendees,
          rawEvent,
        });
      }
    } catch (err) {
      console.warn("[icsParser] Skipping malformed VEVENT:", err);
    }
  }

  return results;
}
