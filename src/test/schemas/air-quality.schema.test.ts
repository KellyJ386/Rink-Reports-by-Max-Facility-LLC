import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';

import {
  AirQualityReadingInput,
  ThresholdSet,
  ActionProtocol,
} from '@/modules/air-quality/schema';

const UUID_A = '11111111-1111-4111-8111-111111111111';

describe('air-quality schema', () => {
  it('parses a valid AirQualityReadingInput without notes (optional)', () => {
    expect(() =>
      AirQualityReadingInput.parse({
        local_id: UUID_A,
        submitted_at: '2026-04-07T12:00:00.000Z',
        co_ppm: 5,
        no2_ppm: 0.1,
      }),
    ).not.toThrow();
  });

  it('rejects negative co_ppm', () => {
    expect(() =>
      AirQualityReadingInput.parse({
        local_id: UUID_A,
        submitted_at: '2026-04-07T12:00:00.000Z',
        co_ppm: -1,
        no2_ppm: 0,
      }),
    ).toThrow(ZodError);
  });

  it('rejects bad submitted_at', () => {
    expect(() =>
      AirQualityReadingInput.parse({
        local_id: UUID_A,
        submitted_at: 'tomorrow',
        co_ppm: 1,
        no2_ppm: 1,
      }),
    ).toThrow();
  });

  it('ThresholdSet accepts all-null', () => {
    expect(() =>
      ThresholdSet.parse({
        co_caution: null,
        co_action: null,
        co_evacuate: null,
        no2_caution: null,
        no2_action: null,
        no2_evacuate: null,
      }),
    ).not.toThrow();
  });

  it('ThresholdSet rejects negative numbers', () => {
    expect(() =>
      ThresholdSet.parse({
        co_caution: -1,
        co_action: null,
        co_evacuate: null,
        no2_caution: null,
        no2_action: null,
        no2_evacuate: null,
      }),
    ).toThrow();
  });

  it('ActionProtocol parses with empty strings', () => {
    expect(() =>
      ActionProtocol.parse({ caution: '', action: '', evacuate: '' }),
    ).not.toThrow();
  });
});
