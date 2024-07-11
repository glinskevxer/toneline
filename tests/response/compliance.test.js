import { describe, expect, it } from 'vitest';
import {
  evaluateCompliance,
  evaluateBatch,
  complianceSummary,
  exceptions,
} from '../../src/response/compliance.js';
import { buildResponse } from '../../src/response/post.js';
import { buildTicket } from '../../src/ticket/record.js';
import { Calendar } from '../../src/time/calendar.js';

const calendar = new Calendar();

function ticket(overrides = {}) {
  return buildTicket({
    number: 'B240315000420',
    type: 'NORMAL',
    takenAt: '2024-03-13T09:00',
    address: '1420 NW 23RD ST',
    ...overrides,
  });
}

function screening(types = ['GAS']) {
  return {
    hits: types.map((type) => ({ type, insideTolerance: true, abandoned: false })),
  };
}

function marked(overrides = {}) {
  return buildResponse({
    number: 'B240315000420',
    code: '2',
    at: '2024-03-14T10:00',
    by: 'loc-1',
    marksThrough: '2024-03-27',
    ...overrides,
  });
}

describe('evaluateCompliance', () => {
  it('reports a ticket answered in time as compliant', () => {
    const record = evaluateCompliance(ticket(), {
      responses: [marked()],
      screening: screening(),
      at: '2024-03-15T12:00',
      calendar,
    });
    expect(record.status).toBe('compliant');
    expect(record.onTime).toBe(true);
    expect(record.complete).toBe(true);
    expect(record.minutesLate).toBeLessThan(0);
    expect(Object.isFrozen(record)).toBe(true);
  });

  it('reports the deadline it worked to', () => {
    const record = evaluateCompliance(ticket(), { at: '2024-03-15T12:00', calendar });
    expect(record.dueAt).toBe('2024-03-15T09:00');
  });

  it('calls an unanswered ticket open before the deadline', () => {
    const record = evaluateCompliance(ticket(), { at: '2024-03-14T12:00', calendar });
    expect(record.status).toBe('open');
    expect(record.answered).toBe(false);
    expect(record.minutesLate).toBeNull();
  });

  it('calls an unanswered ticket missed after it', () => {
    const record = evaluateCompliance(ticket(), { at: '2024-03-15T12:00', calendar });
    expect(record.status).toBe('missed');
  });

  it('calls a posting after the deadline late', () => {
    const record = evaluateCompliance(ticket(), {
      responses: [marked({ at: '2024-03-15T11:00' })],
      screening: screening(),
      at: '2024-03-15T12:00',
      calendar,
    });
    expect(record.status).toBe('late');
    expect(record.minutesLate).toBe(120);
  });

  it('calls a partly answered ticket incomplete', () => {
    const record = evaluateCompliance(ticket(), {
      responses: [marked({ facilityType: 'gas' })],
      screening: screening(['GAS', 'ELECTRIC']),
      at: '2024-03-15T12:00',
      calendar,
    });
    expect(record.status).toBe('incomplete');
    expect(record.outstanding).toEqual(['ELECTRIC']);
    expect(record.complete).toBe(false);
  });

  it('can be late and incomplete at once', () => {
    const record = evaluateCompliance(ticket(), {
      responses: [marked({ facilityType: 'gas', at: '2024-03-15T11:00' })],
      screening: screening(['GAS', 'ELECTRIC']),
      at: '2024-03-15T12:00',
      calendar,
    });
    expect(record.status).toBe('late and incomplete');
  });

  it('measures lateness from the first posting, not the last', () => {
    const record = evaluateCompliance(ticket(), {
      responses: [
        marked({ facilityType: 'gas', at: '2024-03-14T10:00' }),
        marked({ facilityType: 'electric', at: '2024-03-16T10:00' }),
      ],
      screening: screening(['GAS', 'ELECTRIC']),
      at: '2024-03-17T12:00',
      calendar,
    });
    expect(record.onTime).toBe(true);
    expect(record.completedAt).toBe('2024-03-16T10:00');
    expect(record.postings).toBe(2);
  });

  it('ignores postings against another ticket', () => {
    const record = evaluateCompliance(ticket(), {
      responses: [marked({ number: 'B240315000421' })],
      screening: screening(),
      at: '2024-03-15T12:00',
      calendar,
    });
    expect(record.answered).toBe(false);
  });

  it('treats a ticket with no screening as needing nothing in particular', () => {
    const record = evaluateCompliance(ticket(), {
      responses: [marked()],
      at: '2024-03-15T12:00',
      calendar,
    });
    expect(record.complete).toBe(true);
    expect(record.outstanding).toEqual([]);
  });
});

describe('evaluateBatch and complianceSummary', () => {
  const pairs = [
    { ticket: ticket(), responses: [marked()], screening: screening() },
    {
      ticket: ticket({ number: 'B240315000421' }),
      responses: [marked({ number: 'B240315000421', at: '2024-03-15T13:00' })],
      screening: screening(),
    },
    { ticket: ticket({ number: 'B240315000422' }), responses: [], screening: screening() },
  ];

  it('evaluates every pair', () => {
    const records = evaluateBatch(pairs, { at: '2024-03-15T14:00', calendar });
    expect(records.map((record) => record.status)).toEqual(['compliant', 'late', 'missed']);
  });

  it('rolls the numbers up', () => {
    const summary = complianceSummary(evaluateBatch(pairs, { at: '2024-03-15T14:00', calendar }));
    expect(summary.tickets).toBe(3);
    expect(summary.answered).toBe(2);
    expect(summary.onTime).toBe(1);
    expect(summary.late).toBe(1);
    expect(summary.missed).toBe(1);
    expect(summary.worstMinutesLate).toBe(240);
    expect(summary.onTimeRate).toBeCloseTo(1 / 3, 6);
  });

  it('rolls nothing up without dividing by zero', () => {
    expect(complianceSummary([])).toEqual({
      tickets: 0,
      answered: 0,
      complete: 0,
      onTime: 0,
      late: 0,
      missed: 0,
      open: 0,
      worstMinutesLate: 0,
      onTimeRate: 0,
    });
  });

  it('lists the exceptions worst first', () => {
    const records = evaluateBatch(pairs, { at: '2024-03-15T14:00', calendar });
    expect(exceptions(records).map((record) => record.number)).toEqual([
      'B240315000422',
      'B240315000421',
    ]);
  });
});
