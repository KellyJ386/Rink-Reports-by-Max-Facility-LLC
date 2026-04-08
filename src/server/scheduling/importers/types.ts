export interface ParsedShift {
  externalId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  location: string | null;
  description: string | null;
  attendees: string[];
  rawEvent: Record<string, unknown>;
}
