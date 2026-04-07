import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';

import {
  CreatePositionInput,
  AvailabilityBlockSchema,
  SaveAvailabilityInput,
  CreateShiftInput,
  BlockMinutes,
  AvailabilityStatus,
} from '@/modules/scheduling/schema';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

describe('scheduling schema', () => {
  it('CreatePositionInput uses default color when omitted', () => {
    const parsed = CreatePositionInput.parse({ name: 'Skate Guard' });
    expect(parsed.color).toBe('#003B6F');
  });

  it('CreatePositionInput rejects bad hex color', () => {
    expect(() =>
      CreatePositionInput.parse({ name: 'X', color: 'blue' }),
    ).toThrow(ZodError);
  });

  it('AvailabilityBlockSchema parses a valid block', () => {
    expect(() =>
      AvailabilityBlockSchema.parse({
        dow: 0,
        start_minute: 480,
        end_minute: 1020,
        status: 'available',
      }),
    ).not.toThrow();
  });

  it('AvailabilityBlockSchema rejects end <= start', () => {
    expect(() =>
      AvailabilityBlockSchema.parse({
        dow: 0,
        start_minute: 600,
        end_minute: 600,
        status: 'available',
      }),
    ).toThrow();
  });

  it('AvailabilityBlockSchema rejects dow out of range', () => {
    expect(() =>
      AvailabilityBlockSchema.parse({
        dow: 7,
        start_minute: 0,
        end_minute: 60,
        status: 'available',
      }),
    ).toThrow();
  });

  it('AvailabilityStatus rejects unknown status', () => {
    expect(() => AvailabilityStatus.parse('maybe')).toThrow();
  });

  it('SaveAvailabilityInput parses recurring with null week_start', () => {
    expect(() =>
      SaveAvailabilityInput.parse({
        recurring: true,
        week_start: null,
        blocks: [],
      }),
    ).not.toThrow();
  });

  it('SaveAvailabilityInput rejects bad week_start format', () => {
    expect(() =>
      SaveAvailabilityInput.parse({
        recurring: false,
        week_start: '04/07/2026',
        blocks: [],
      }),
    ).toThrow();
  });

  it('CreateShiftInput parses without notes (optional)', () => {
    expect(() =>
      CreateShiftInput.parse({
        schedule_id: UUID_A,
        user_id: UUID_B,
        position_id: UUID_C,
        start_at: '2026-04-07T12:00:00.000Z',
        end_at: '2026-04-07T16:00:00.000Z',
      }),
    ).not.toThrow();
  });

  it('BlockMinutes rejects 45', () => {
    expect(() => BlockMinutes.parse(45)).toThrow();
  });
});
