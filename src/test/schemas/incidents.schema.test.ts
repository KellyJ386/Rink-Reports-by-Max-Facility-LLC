import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';

import {
  IncidentInput,
  AccidentInput,
  ReportInput,
  IncidentSubmissionInput,
  BodyMarkerSchema,
  StringList,
} from '@/modules/incidents/schema';

const UUID_A = '11111111-1111-4111-8111-111111111111';

const baseCommon = {
  occurred_at: '2026-04-07T12:00:00.000Z',
  reported_by: 'Alice',
  location: 'Lobby',
  incident_type: 'Property Damage',
  description: 'Window broken',
  follow_up_required: false,
};

describe('incidents schema', () => {
  it('parses minimal IncidentInput (optional fields omitted)', () => {
    expect(() =>
      IncidentInput.parse({ kind: 'incident', ...baseCommon }),
    ).not.toThrow();
  });

  it('rejects IncidentInput missing description', () => {
    expect(() =>
      IncidentInput.parse({
        kind: 'incident',
        ...baseCommon,
        description: '',
      }),
    ).toThrow(ZodError);
  });

  it('parses minimal AccidentInput', () => {
    expect(() =>
      AccidentInput.parse({
        kind: 'accident',
        ...baseCommon,
        injured_name: 'Bob',
        injured_type: 'Skater',
        injured_age: null,
        nature_of_injury: 'Bruise',
        body_markers: [],
        first_aid_administered: false,
        ems_called: false,
        transported_to_hospital: false,
      }),
    ).not.toThrow();
  });

  it('AccidentInput rejects out-of-range age', () => {
    expect(() =>
      AccidentInput.parse({
        kind: 'accident',
        ...baseCommon,
        injured_name: 'Bob',
        injured_type: 'Skater',
        injured_age: 999,
        nature_of_injury: 'X',
        body_markers: [],
        first_aid_administered: false,
        ems_called: false,
        transported_to_hospital: false,
      }),
    ).toThrow();
  });

  it('ReportInput discriminates on kind', () => {
    expect(() =>
      ReportInput.parse({ kind: 'banana', ...baseCommon }),
    ).toThrow();
  });

  it('BodyMarkerSchema rejects x out of [0,1]', () => {
    expect(() =>
      BodyMarkerSchema.parse({ view: 'front', x: 1.5, y: 0, label: 'Head' }),
    ).toThrow();
  });

  it('IncidentSubmissionInput requires uuid local_id', () => {
    expect(() =>
      IncidentSubmissionInput.parse({
        local_id: 'not-uuid',
        report: { kind: 'incident', ...baseCommon },
      }),
    ).toThrow();
  });

  it('IncidentSubmissionInput parses a valid envelope', () => {
    expect(() =>
      IncidentSubmissionInput.parse({
        local_id: UUID_A,
        report: { kind: 'incident', ...baseCommon },
      }),
    ).not.toThrow();
  });

  it('StringList rejects empty strings inside', () => {
    expect(() => StringList.parse([''])).toThrow();
  });
});
