import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';

import {
  IceDepthSessionInput,
  PointSchema,
  Measurements,
} from '@/modules/ice-depth/schema';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

describe('ice-depth schema', () => {
  it('parses a valid IceDepthSessionInput', () => {
    expect(() =>
      IceDepthSessionInput.parse({
        local_id: UUID_A,
        template_id: UUID_B,
        submitted_at: '2026-04-07T12:00:00.000Z',
        status: 'draft',
        resurfacing_status: null,
        notes: null,
        measurements: { '1': 1.25 },
      }),
    ).not.toThrow();
  });

  it('rejects bad status enum', () => {
    expect(() =>
      IceDepthSessionInput.parse({
        local_id: UUID_A,
        template_id: UUID_B,
        submitted_at: '2026-04-07T12:00:00.000Z',
        status: 'in-progress',
        resurfacing_status: null,
        notes: null,
        measurements: {},
      }),
    ).toThrow(ZodError);
  });

  it('rejects measurements with non-positive value', () => {
    expect(() =>
      IceDepthSessionInput.parse({
        local_id: UUID_A,
        template_id: UUID_B,
        submitted_at: '2026-04-07T12:00:00.000Z',
        status: 'draft',
        resurfacing_status: null,
        notes: null,
        measurements: { '1': 0 },
      }),
    ).toThrow();
  });

  it('PointSchema rejects x out of [0,1]', () => {
    expect(() => PointSchema.parse({ n: 1, x: 1.5, y: 0.5 })).toThrow();
  });

  it('PointSchema accepts valid bounds', () => {
    expect(() => PointSchema.parse({ n: 1, x: 0, y: 1 })).not.toThrow();
  });

  it('Measurements rejects non-numeric key', () => {
    expect(() => Measurements.parse({ a: 1.0 })).toThrow();
  });
});
