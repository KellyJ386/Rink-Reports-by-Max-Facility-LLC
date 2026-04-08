import "server-only";

/**
 * iSportsman exports standard ICS but with custom X-ISPORTSMAN-* properties
 * that confuse some parsers. Strip them before handing the cleaned ICS
 * string to the main parseIcsToShifts parser.
 */
export function normalizeISportsman(raw: string): string {
  return raw
    .split(/\r?\n/)
    .filter((line) => !/^X-ISPORTSMAN-/i.test(line))
    .join("\r\n");
}
