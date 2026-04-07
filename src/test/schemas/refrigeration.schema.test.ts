import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';

import {
  RefrigerationReadingInput,
  CompressorReadingRow,
  ThresholdRange,
} from '@/modules/refrigeration/schema';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

describe('refrigeration schema', () => {
  it('parses a valid RefrigerationReadingInput with no compressors', () => {
    expect(() =>
      RefrigerationReadingInput.parse({
        local_id: UUID_A,
        submitted_at: '2026-04-07T12:00:00.000Z',
        brine_supply: 20,
        brine_return: 25,
        brine_flow: null,
        ice_surface_temp: 22,
        condenser_temp: 80,
        compressor_readings: [],
      }),
    ).not.toThrow();
  });

  it('rejects RefrigerationReadingInput with non-numeric brine_supply', () => {
    expect(() =>
      RefrigerationReadingInput.parse({
        local_id: UUID_A,
        submitted_at: '2026-04-07T12:00:00.000Z',
        brine_supply: 'cold',
        brine_return: null,
        brine_flow: null,
        ice_surface_temp: null,
        condenser_temp: null,
        compressor_readings: [],
      }),
    ).toThrow(ZodError);
  });

  it('rejects RefrigerationReadingInput missing local_id', () => {
    expect(() =>
      RefrigerationReadingInput.parse({
        submitted_at: '2026-04-07T12:00:00.000Z',
        brine_supply: null,
        brine_return: null,
        brine_flow: null,
        ice_surface_temp: null,
        condenser_temp: null,
        compressor_readings: [],
      }),
    ).toThrow();
  });

  it('CompressorReadingRow accepts all-null readings', () => {
    expect(() =>
      CompressorReadingRow.parse({
        compressor_id: UUID_B,
        suction_pressure: null,
        discharge_pressure: null,
        oil_pressure: null,
        amps: null,
        oil_temperature: null,
      }),
    ).not.toThrow();
  });

  it('ThresholdRange rejects min > max', () => {
    expect(() => ThresholdRange.parse({ min: 100, max: 5 })).toThrow();
  });

  it('ThresholdRange allows nulls', () => {
    expect(() => ThresholdRange.parse({ min: null, max: null })).not.toThrow();
  });
});
