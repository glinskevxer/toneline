import { describe, expect, it } from 'vitest';
import {
  mean,
  percentile,
  turnaroundMinutes,
  deskIndicators,
  ticketsByDay,
  busiestDay,
  compareIndicators,
} from '../../src/reporting/kpi.js';
import { buildTicket } from '../../src/ticket/record.js';
import { buildResponse } from '../../src/response/post.js';
import { evaluateCompliance } from '../../src/response/compliance.js';
import { buildDamage } from '../../src/damage/report.js';
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

function posting(number, at) {
  return buildResponse({ number, code: '2', at, by: 'loc-1', marksThrough: '2024-03-29' });
}

describe('mean and percentile', () => {
  it('averages a list', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(mean([])).toBe(0);
  });

  it('picks a percentile off an unsorted list', () => {
    expect(percentile([5, 1, 3, 9, 7], 0.9)).toBe(9);
    expect(percentile([5, 1, 3, 9, 7], 0.5)).toBe(5);
  });

  it('handles the ends and the empty list', () => {
    expect(percentile([5, 1, 3], 0)).toBe(1);
    expect(percentile([5, 1, 3], 1)).toBe(5);
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe('turnaroundMinutes', () => {
  it('measures from receipt to the first posting', () => {
    const tickets = [ticket()];
    const compliance = [
      evaluateCompliance(tickets[0], {
        responses: [posting('B240315000420', '2024-03-14T09:00')],
        at: '2024-03-15T09:00',
        calendar,
      }),
    ];
    expect(turnaroundMinutes(tickets, compliance)).toEqual([1440]);
  });

  it('leaves out a ticket nobody answered', () => {
    const tickets = [ticket()];
    const compliance = [evaluateCompliance(tickets[0], { at: '2024-03-15T09:00', calendar })];
    expect(turnaroundMinutes(tickets, compliance)).toEqual([]);
  });

  it('leaves out a ticket with no evaluation at all', () => {
    expect(turnaroundMinutes([ticket()], [])).toEqual([]);
  });
});

describe('deskIndicators', () => {
  const tickets = [
    ticket(),
    ticket({ number: 'B240315000421', type: 'EMERGENCY', takenAt: '2024-03-14T08:00' }),
    ticket({ number: 'B240315000422' }),
  ];
  const compliance = [
    evaluateCompliance(tickets[0], {
      responses: [posting('B240315000420', '2024-03-14T09:00')],
      at: '2024-03-16T09:00',
      calendar,
    }),
    evaluateCompliance(tickets[1], {
      responses: [posting('B240315000421', '2024-03-14T11:00')],
      at: '2024-03-16T09:00',
      calendar,
    }),
    evaluateCompliance(tickets[2], { at: '2024-03-16T09:00', calendar }),
  ];

  it('counts the tickets and the emergencies', () => {
    const kpi = deskIndicators({ period: '2024-03', tickets, compliance });
    expect(kpi.tickets).toBe(3);
    expect(kpi.emergencies).toBe(1);
    expect(kpi.answered).toBe(2);
  });

  it('reports the rates as fractions', () => {
    const kpi = deskIndicators({ period: '2024-03', tickets, compliance });
    expect(kpi.onTimeRate).toBeCloseTo(1 / 3, 6);
    expect(kpi.completionRate).toBeCloseTo(2 / 3, 6);
  });

  it('reports the turnaround', () => {
    const kpi = deskIndicators({ period: '2024-03', tickets, compliance });
    expect(kpi.meanTurnaroundMinutes).toBe(810);
    expect(kpi.p90TurnaroundMinutes).toBe(1440);
  });

  it('reports the damage rate', () => {
    const damages = [
      buildDamage({
        id: 'd1',
        at: '2024-03-19T10:25',
        facilityType: 'gas',
        reportedBy: 'loc-1',
      }),
    ];
    const kpi = deskIndicators({ period: '2024-03', tickets, compliance, damages });
    expect(kpi.damages).toBe(1);
    expect(kpi.damageRatePerThousand).toBeCloseTo(333.33, 2);
  });

  it('measures an empty period without dividing by zero', () => {
    const kpi = deskIndicators({ period: '2024-04', tickets: [], compliance: [] });
    expect(kpi.tickets).toBe(0);
    expect(kpi.onTimeRate).toBe(0);
    expect(kpi.completionRate).toBe(0);
    expect(kpi.meanTurnaroundMinutes).toBe(0);
    expect(kpi.damageRatePerThousand).toBe(0);
  });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(deskIndicators({ period: '2024-03', tickets, compliance }))).toBe(true);
  });
});

describe('ticketsByDay and busiestDay', () => {
  const tickets = [
    ticket(),
    ticket({ number: 'B240315000421' }),
    ticket({ number: 'B240315000422', takenAt: '2024-03-14T08:00' }),
  ];

  it('counts the days in order', () => {
    expect(ticketsByDay(tickets)).toEqual([
      { day: '2024-03-13', tickets: 2 },
      { day: '2024-03-14', tickets: 1 },
    ]);
  });

  it('finds the busiest', () => {
    expect(busiestDay(tickets)).toEqual({ day: '2024-03-13', tickets: 2 });
    expect(busiestDay([])).toBeNull();
  });
});

describe('compareIndicators', () => {
  it('subtracts one period from the next', () => {
    const before = deskIndicators({ period: 'a', tickets: [ticket()], compliance: [] });
    const after = deskIndicators({
      period: 'b',
      tickets: [ticket(), ticket({ number: 'B240315000421' })],
      compliance: [],
    });
    const compared = compareIndicators(before, after);
    expect(compared.tickets).toBe(1);
    expect(compared.onTimeRate).toBe(0);
    expect(Object.isFrozen(compared)).toBe(true);
  });
});
