import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';

import {
  IceOperationSubmissionInput,
  CreateFieldInput,
  CreateOperationTypeInput,
} from '@/modules/ice-operations/schema';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

describe('ice-operations schema', () => {
  it('parses a valid IceOperationSubmissionInput', () => {
    expect(() =>
      IceOperationSubmissionInput.parse({
        local_id: UUID_A,
        operation_type_id: UUID_B,
        equipment_id: UUID_C,
        submitted_at: '2026-04-07T12:00:00.000Z',
        answers: {},
      }),
    ).not.toThrow();
  });

  it('rejects bad equipment_id', () => {
    expect(() =>
      IceOperationSubmissionInput.parse({
        local_id: UUID_A,
        operation_type_id: UUID_B,
        equipment_id: 'nope',
        submitted_at: '2026-04-07T12:00:00.000Z',
        answers: {},
      }),
    ).toThrow(ZodError);
  });

  it('rejects missing answers', () => {
    expect(() =>
      IceOperationSubmissionInput.parse({
        local_id: UUID_A,
        operation_type_id: UUID_B,
        equipment_id: UUID_C,
        submitted_at: '2026-04-07T12:00:00.000Z',
      }),
    ).toThrow();
  });

  it('CreateFieldInput rejects dropdown without options', () => {
    expect(() =>
      CreateFieldInput.parse({
        operation_type_id: UUID_A,
        label: 'Pick',
        type: 'dropdown',
        required: true,
      }),
    ).toThrow();
  });

  it('CreateFieldInput accepts number without options', () => {
    expect(() =>
      CreateFieldInput.parse({
        operation_type_id: UUID_A,
        label: 'Count',
        type: 'number',
        required: false,
      }),
    ).not.toThrow();
  });

  it('CreateOperationTypeInput rejects empty name', () => {
    expect(() => CreateOperationTypeInput.parse({ name: '' })).toThrow();
  });
});
