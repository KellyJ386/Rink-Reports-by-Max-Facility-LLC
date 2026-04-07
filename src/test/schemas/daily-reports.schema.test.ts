import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';

import {
  DailyReportSubmissionInput,
  CreateItemInput,
  CreateChecklistInput,
  ChecklistItemSchema,
} from '@/modules/daily-reports/schema';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

describe('daily-reports schema', () => {
  it('parses a valid DailyReportSubmissionInput', () => {
    expect(() =>
      DailyReportSubmissionInput.parse({
        local_id: UUID_A,
        checklist_id: UUID_B,
        submitted_at: '2026-04-07T12:00:00.000Z',
        answers: { [UUID_C]: 'ok' },
      }),
    ).not.toThrow();
  });

  it('rejects DailyReportSubmissionInput with bad uuid', () => {
    expect(() =>
      DailyReportSubmissionInput.parse({
        local_id: 'not-a-uuid',
        checklist_id: UUID_B,
        submitted_at: '2026-04-07T12:00:00.000Z',
        answers: {},
      }),
    ).toThrow(ZodError);
  });

  it('rejects DailyReportSubmissionInput with bad datetime', () => {
    expect(() =>
      DailyReportSubmissionInput.parse({
        local_id: UUID_A,
        checklist_id: UUID_B,
        submitted_at: 'not-a-date',
        answers: {},
      }),
    ).toThrow();
  });

  it('CreateItemInput refines: dropdown requires options', () => {
    expect(() =>
      CreateItemInput.parse({
        checklist_id: UUID_A,
        label: 'Pick',
        type: 'dropdown',
        required: true,
        // missing options
      }),
    ).toThrow();
  });

  it('CreateItemInput accepts text without options (optional)', () => {
    expect(() =>
      CreateItemInput.parse({
        checklist_id: UUID_A,
        label: 'Notes',
        type: 'text',
        required: false,
      }),
    ).not.toThrow();
  });

  it('ChecklistItemSchema parses with options=null', () => {
    expect(() =>
      ChecklistItemSchema.parse({
        id: UUID_A,
        checklist_id: UUID_B,
        position: 0,
        label: 'Item',
        type: 'text',
        required: false,
        options: null,
      }),
    ).not.toThrow();
  });

  it('CreateChecklistInput rejects empty name', () => {
    expect(() => CreateChecklistInput.parse({ name: '' })).toThrow();
  });
});
