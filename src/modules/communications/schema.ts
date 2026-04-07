import { z } from "zod";

/**
 * Communications module schemas + types.
 *
 * Two facility_config rows under module='communications' drive the
 * Universal Module Header (CLAUDE.md Rule 2):
 *
 *   key='postal_code' → string  (e.g. "94043", "K1A 0B1")
 *   key='country'     → ISO country code (default "us")
 *   key='temp_unit'   → "f" | "c"
 */

export const TemperatureUnitEnum = z.enum(["f", "c"]);
export type TemperatureUnitEnum = z.infer<typeof TemperatureUnitEnum>;

export const CommunicationsSettings = z.object({
  postal_code: z.string().min(1).max(20),
  country: z.string().min(1).max(8).default("us"),
  temp_unit: TemperatureUnitEnum.default("f"),
});
export type CommunicationsSettings = z.infer<typeof CommunicationsSettings>;

// =====================================================================
// Send-message input
// =====================================================================

export const SendMessageInput = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().max(20000).default(""),
  recipient_ids: z.array(z.string().uuid()).min(1).max(200),
  attachment_path: z.string().min(1).max(500).nullable(),
  attachment_label: z.string().min(1).max(200).nullable(),
});
export type SendMessageInput = z.infer<typeof SendMessageInput>;

// =====================================================================
// Lightweight markdown renderer for the inbox view.
//
// Supports the three formats listed in the spec: **bold**, *italic*,
// and `- bullet` line prefixes. Returns an array of structured tokens
// the renderer can map to React elements without `dangerouslySetInnerHTML`.
// =====================================================================

export type Inline =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "italic"; value: string };

export type Block =
  | { kind: "paragraph"; inlines: Inline[] }
  | { kind: "bullet_list"; items: Inline[][] };

export function parseMarkdown(input: string): Block[] {
  const lines = input.split(/\r?\n/);
  const out: Block[] = [];
  let bulletBuffer: Inline[][] | null = null;
  let paragraphBuffer: string[] = [];

  function flushParagraph() {
    if (paragraphBuffer.length > 0) {
      out.push({
        kind: "paragraph",
        inlines: parseInlines(paragraphBuffer.join(" ")),
      });
      paragraphBuffer = [];
    }
  }
  function flushBullets() {
    if (bulletBuffer) {
      out.push({ kind: "bullet_list", items: bulletBuffer });
      bulletBuffer = null;
    }
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      flushParagraph();
      flushBullets();
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      flushParagraph();
      bulletBuffer = bulletBuffer ?? [];
      bulletBuffer.push(parseInlines(line.slice(2).trim()));
      continue;
    }
    flushBullets();
    paragraphBuffer.push(line);
  }
  flushParagraph();
  flushBullets();
  return out;
}

function parseInlines(text: string): Inline[] {
  // Match **bold** first, then *italic*. Anything else is text.
  const out: Inline[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push({ kind: "text", value: text.slice(lastIndex, match.index) });
    }
    if (match[2] !== undefined) {
      out.push({ kind: "bold", value: match[2] });
    } else if (match[3] !== undefined) {
      out.push({ kind: "italic", value: match[3] });
    }
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    out.push({ kind: "text", value: text.slice(lastIndex) });
  }
  return out;
}
