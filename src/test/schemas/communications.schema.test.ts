import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';

import {
  CommunicationsSettings,
  SendMessageInput,
  TemperatureUnitEnum,
  parseMarkdown,
} from '@/modules/communications/schema';

const UUID_A = '11111111-1111-4111-8111-111111111111';

describe('communications schema', () => {
  it('parses CommunicationsSettings with only postal_code (others have defaults)', () => {
    const parsed = CommunicationsSettings.parse({ postal_code: '94043' });
    expect(parsed.country).toBe('us');
    expect(parsed.temp_unit).toBe('f');
  });

  it('rejects empty postal_code', () => {
    expect(() =>
      CommunicationsSettings.parse({ postal_code: '' }),
    ).toThrow(ZodError);
  });

  it('TemperatureUnitEnum rejects invalid unit', () => {
    expect(() => TemperatureUnitEnum.parse('k')).toThrow();
  });

  it('parses a valid SendMessageInput with attachment fields nullable', () => {
    expect(() =>
      SendMessageInput.parse({
        subject: 'Hello',
        body: 'world',
        recipient_ids: [UUID_A],
        attachment_path: null,
        attachment_label: null,
      }),
    ).not.toThrow();
  });

  it('SendMessageInput rejects empty subject', () => {
    expect(() =>
      SendMessageInput.parse({
        subject: '',
        body: '',
        recipient_ids: [UUID_A],
        attachment_path: null,
        attachment_label: null,
      }),
    ).toThrow(ZodError);
  });

  it('SendMessageInput rejects empty recipient list', () => {
    expect(() =>
      SendMessageInput.parse({
        subject: 'hi',
        body: '',
        recipient_ids: [],
        attachment_path: null,
        attachment_label: null,
      }),
    ).toThrow();
  });

  it('parseMarkdown handles paragraph + bullet list', () => {
    const blocks = parseMarkdown('Hello **world**\n\n- one\n- two');
    expect(blocks.length).toBe(2);
    expect(blocks[0].kind).toBe('paragraph');
    expect(blocks[1].kind).toBe('bullet_list');
  });
});
