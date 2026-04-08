import "server-only";

import { z } from "zod";

import type { ParsedShift } from "../types";

const ActiveNetworkEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  start: z.string(),
  end: z.string(),
  location: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  staffEmail: z.string().nullable().optional(),
});

const ActiveNetworkPayloadSchema = z.object({
  events: z.array(ActiveNetworkEventSchema),
});

/**
 * Normalize an Active Network JSON export into ParsedShift objects.
 *
 * Expects a top-level `events` array with each entry having:
 *   { id, title, start, end, location?, description?, staffEmail? }
 *
 * Throws a descriptive error if the shape is wrong or JSON is malformed.
 */
export function normalizeActiveNetwork(jsonContent: string): ParsedShift[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (err) {
    throw new Error(
      `Active Network import: invalid JSON — ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const result = ActiveNetworkPayloadSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Active Network import: unrecognized shape — expected { events: Array<{ id, title, start, end, location?, description?, staffEmail? }> }. ${result.error.message}`,
    );
  }

  return result.data.events.map((event): ParsedShift => {
    const attendees: string[] = event.staffEmail ? [event.staffEmail] : [];
    return {
      externalId: event.id,
      title: event.title,
      startAt: new Date(event.start),
      endAt: new Date(event.end),
      location: event.location ?? null,
      description: event.description ?? null,
      attendees,
      rawEvent: event as unknown as Record<string, unknown>,
    };
  });
}
