import { describe, expect, it } from 'vitest';
import {
  PRIORITY_BANDS,
  scoreTicket,
  orderQueue,
  bandCounts,
  head,
} from '../../src/ticket/priority.js';
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

describe('scoreTicket', () => {
  it('puts an emergency in its own band', () => {
    const entry = scoreTicket(ticket({ type: 'EMERGENCY', takenAt: '2024-03-14T08:00' }), {
      at: '2024-03-14T08:30',
      calendar,
    });
    expect(entry.band).toBe('emergency');
    expect(entry.weight).toBe(PRIORITY_BANDS.emergency);
  });

  it('bands a breached ticket ahead of one merely due soon', () => {
    const late = scoreTicket(ticket(), { at: '2024-03-15T10:00', calendar });
    const soon = scoreTicket(ticket(), { at: '2024-03-15T07:00', calendar });
    expect(late.band).toBe('breached');
    expect(soon.band).toBe('dueSoon');
    expect(late.weight).toBeLessThan(soon.weight);
  });

  it('does not promote a critical ticket that has time left', () => {
    const entry = scoreTicket(ticket(), {
      at: '2024-03-14T09:00',
      calendar,
      screening: { critical: true },
    });
    expect(entry.band).toBe('critical');
    expect(entry.critical).toBe(true);
  });

  it('lets a deadline beat criticality', () => {
    const entry = scoreTicket(ticket(), {
      at: '2024-03-15T08:00',
      calendar,
      screening: { critical: true },
    });
    expect(entry.band).toBe('dueSoon');
  });

  it('puts a design request behind ordinary marking work', () => {
    const entry = scoreTicket(ticket({ type: 'DESIGN' }), { at: '2024-03-14T09:00', calendar });
    expect(entry.band).toBe('design');
    expect(entry.weight).toBeGreaterThan(PRIORITY_BANDS.ordinary);
  });

  it('bands an ordinary ticket with days left as ordinary', () => {
    const entry = scoreTicket(ticket(), { at: '2024-03-14T09:00', calendar });
    expect(entry.band).toBe('ordinary');
    expect(entry.reason).toBe('ordinary marking work');
  });

  it('carries a reason for every band', () => {
    for (const band of Object.keys(PRIORITY_BANDS)) {
      expect(typeof band).toBe('string');
    }
    expect(scoreTicket(ticket(), { at: '2024-03-15T10:00', calendar }).reason).toMatch(
      /deadline has already passed/
    );
  });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(scoreTicket(ticket(), { at: '2024-03-14T09:00', calendar }))).toBe(true);
  });
});

describe('orderQueue', () => {
  const entries = [
    { ticket: ticket({ number: 'B240315000420' }) },
    { ticket: ticket({ number: 'B240315000421', takenAt: '2024-03-11T09:00' }) },
    {
      ticket: ticket({ number: 'B240315000422', type: 'EMERGENCY', takenAt: '2024-03-14T08:00' }),
    },
    { ticket: ticket({ number: 'B240315000423', type: 'DESIGN' }) },
  ];

  it('orders by band and then by deadline', () => {
    const scored = orderQueue(entries, { at: '2024-03-14T09:00', calendar });
    expect(scored.map((entry) => entry.number)).toEqual([
      'B240315000422',
      'B240315000421',
      'B240315000420',
      'B240315000423',
    ]);
  });

  it('breaks a full tie on the ticket number', () => {
    const scored = orderQueue(
      [
        { ticket: ticket({ number: 'B240315000421' }) },
        { ticket: ticket({ number: 'B240315000420' }) },
      ],
      { at: '2024-03-14T09:00', calendar }
    );
    expect(scored[0].number).toBe('B240315000420');
  });

  it('carries a screening through when there is one', () => {
    const scored = orderQueue([{ ticket: ticket(), screening: { critical: true } }], {
      at: '2024-03-14T09:00',
      calendar,
    });
    expect(scored[0].band).toBe('critical');
  });

  it('orders nothing from nothing', () => {
    expect(orderQueue([], { at: '2024-03-14T09:00', calendar })).toEqual([]);
  });
});

describe('bandCounts and head', () => {
  const scored = orderQueue(
    [
      { ticket: ticket({ number: 'B240315000420' }) },
      { ticket: ticket({ number: 'B240315000421', type: 'DESIGN' }) },
    ],
    { at: '2024-03-14T09:00', calendar }
  );

  it('counts every band including the empty ones', () => {
    expect(bandCounts(scored)).toEqual({
      emergency: 0,
      breached: 0,
      dueSoon: 0,
      critical: 0,
      ordinary: 1,
      design: 1,
    });
  });

  it('takes the head of the queue', () => {
    expect(head(scored, 1)).toHaveLength(1);
    expect(head(scored)).toHaveLength(2);
    expect(head(scored, 0)).toEqual([]);
    expect(head(scored, -1)).toEqual([]);
  });
});
