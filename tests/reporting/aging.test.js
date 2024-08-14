import { describe, expect, it } from 'vitest';
import {
  AGING_BUCKETS,
  bucketFor,
  ageTicket,
  ageTickets,
  bucketCounts,
  breached,
  oldestMinutes,
  byLocator,
  isOpen,
  openTickets,
  nextDeadline,
} from '../../src/reporting/aging.js';
import { buildTicket } from '../../src/ticket/record.js';
import { buildAssignment } from '../../src/dispatch/assign.js';
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

describe('bucketFor', () => {
  it('lists the buckets worst first', () => {
    expect(AGING_BUCKETS[0]).toBe('breached');
    expect(AGING_BUCKETS).toHaveLength(4);
  });

  it('sorts a span of minutes into buckets', () => {
    expect(bucketFor(-1)).toBe('breached');
    expect(bucketFor(0)).toBe('due within the hour');
    expect(bucketFor(60)).toBe('due within the hour');
    expect(bucketFor(61)).toBe('due today');
    expect(bucketFor(720)).toBe('due today');
    expect(bucketFor(721)).toBe('later');
  });
});

describe('ageTicket', () => {
  it('measures from the deadline, not the receipt', () => {
    const row = ageTicket(ticket(), { at: '2024-03-14T09:00', calendar });
    expect(row.dueAt).toBe('2024-03-15T09:00');
    expect(row.minutesLeft).toBe(1440);
    expect(row.minutesOpen).toBe(1440);
    expect(row.bucket).toBe('later');
  });

  it('goes negative once the deadline has passed', () => {
    const row = ageTicket(ticket(), { at: '2024-03-15T11:00', calendar });
    expect(row.minutesLeft).toBe(-120);
    expect(row.bucket).toBe('breached');
  });

  it('never reports a negative time open', () => {
    expect(ageTicket(ticket(), { at: '2024-03-12T09:00', calendar }).minutesOpen).toBe(0);
  });

  it('carries the type rank for tie breaking', () => {
    expect(
      ageTicket(ticket({ type: 'EMERGENCY' }), { at: '2024-03-13T10:00', calendar }).rank
    ).toBe(0);
  });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(ageTicket(ticket(), { at: '2024-03-14T09:00', calendar }))).toBe(true);
  });
});

describe('ageTickets', () => {
  const tickets = [
    ticket({ number: 'B240315000420' }),
    ticket({ number: 'B240315000421', takenAt: '2024-03-12T09:00' }),
    ticket({ number: 'B240315000422', type: 'EMERGENCY', takenAt: '2024-03-14T08:00' }),
  ];

  it('puts the closest deadline first', () => {
    const rows = ageTickets(tickets, { at: '2024-03-14T09:00', calendar });
    expect(rows.map((row) => row.number)).toEqual([
      'B240315000421',
      'B240315000422',
      'B240315000420',
    ]);
  });

  it('counts the buckets', () => {
    const rows = ageTickets(tickets, { at: '2024-03-14T11:00', calendar });
    expect(bucketCounts(rows)).toEqual({
      breached: 2,
      'due within the hour': 0,
      'due today': 0,
      later: 1,
    });
  });

  it('counts a deadline that has just landed as due within the hour', () => {
    const rows = ageTickets(tickets, { at: '2024-03-14T09:00', calendar });
    expect(bucketCounts(rows)).toEqual({
      breached: 0,
      'due within the hour': 2,
      'due today': 0,
      later: 1,
    });
  });

  it('names the breached rows', () => {
    const rows = ageTickets(tickets, { at: '2024-03-14T11:00', calendar });
    expect(breached(rows).map((row) => row.number)).toEqual(['B240315000421', 'B240315000422']);
  });

  it('reports the oldest', () => {
    const rows = ageTickets(tickets, { at: '2024-03-14T11:00', calendar });
    expect(oldestMinutes(rows)).toBe(3000);
    expect(oldestMinutes([])).toBe(0);
  });

  it('finds the next deadline', () => {
    const rows = ageTickets(tickets, { at: '2024-03-14T11:00', calendar });
    expect(nextDeadline(rows)).toBe('2024-03-14T09:00');
    expect(nextDeadline([])).toBeNull();
  });
});

describe('byLocator', () => {
  it('groups the rows by who holds them', () => {
    const rows = ageTickets(
      [ticket(), ticket({ number: 'B240315000421' }), ticket({ number: 'B240315000422' })],
      { at: '2024-03-14T09:00', calendar }
    );
    const assignments = [
      buildAssignment({
        number: 'B240315000420',
        locatorId: 'loc-1',
        at: '2024-03-13T10:00',
        by: 'd',
      }),
      buildAssignment({
        number: 'B240315000421',
        locatorId: 'loc-2',
        at: '2024-03-13T10:00',
        by: 'd',
      }),
    ];
    const grouped = byLocator(rows, assignments);
    expect(grouped.map((entry) => entry.locatorId)).toEqual(['LOC-1', 'LOC-2', 'unassigned']);
    expect(grouped[2].rows[0].number).toBe('B240315000422');
  });

  it('puts everything under unassigned when nothing was handed out', () => {
    const rows = ageTickets([ticket()], { at: '2024-03-14T09:00', calendar });
    expect(byLocator(rows, [])).toEqual([{ locatorId: 'unassigned', rows }]);
  });
});

describe('isOpen', () => {
  it('counts the states the desk still owes an answer on', () => {
    expect(isOpen(ticket())).toBe(true);
    expect(isOpen(ticket({ status: 'ASSIGNED' }))).toBe(true);
    expect(isOpen(ticket({ status: 'RESPONDED' }))).toBe(false);
    expect(isOpen(ticket({ status: 'CANCELLED' }))).toBe(false);
  });

  it('filters a set down to the open ones', () => {
    const set = [ticket(), ticket({ number: 'B240315000421', status: 'CLOSED' })];
    expect(openTickets(set).map((entry) => entry.number)).toEqual(['B240315000420']);
  });
});
