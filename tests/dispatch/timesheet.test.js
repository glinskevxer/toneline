import { describe, expect, it } from 'vitest';
import {
  NON_TICKET_ACTIVITIES,
  buildTimeEntry,
  dayEntries,
  overlaps,
  daySummary,
  minutesOnTicket,
  daysWorked,
} from '../../src/dispatch/timesheet.js';
import { DispatchError } from '../../src/dispatch/assign.js';

function entry(overrides = {}) {
  return buildTimeEntry({
    locatorId: 'loc-14',
    from: '2024-03-15T07:00',
    to: '2024-03-15T08:00',
    number: 'B240315000420',
    ...overrides,
  });
}

describe('buildTimeEntry', () => {
  it('books time against a ticket', () => {
    const built = entry();
    expect(built.locatorId).toBe('LOC-14');
    expect(built.activity).toBe('TICKET');
    expect(built.minutes).toBe(60);
    expect(built.date).toBe('2024-03-15');
    expect(Object.isFrozen(built)).toBe(true);
  });

  it('books time against an activity when there is no ticket', () => {
    const built = entry({ number: null, activity: 'travel' });
    expect(built.activity).toBe('TRAVEL');
    expect(built.number).toBeNull();
  });

  it('defaults to standby with no ticket and no activity', () => {
    expect(entry({ number: null }).activity).toBe('STANDBY');
  });

  it('ignores an activity when a ticket was given', () => {
    expect(entry({ activity: 'travel' }).activity).toBe('TICKET');
  });

  it('rejects anything that is not an object', () => {
    expect(() => buildTimeEntry(null)).toThrow(DispatchError);
  });

  it('rejects bad or backwards timestamps', () => {
    expect(() => entry({ to: '2024-03-15' })).toThrow(/two timestamps/);
    expect(() => entry({ to: '2024-03-15T06:00' })).toThrow(/end after it starts/);
    expect(() => entry({ to: '2024-03-15T07:00' })).toThrow(/end after it starts/);
  });

  it('rejects an entry crossing midnight', () => {
    expect(() => entry({ to: '2024-03-16T01:00' })).toThrow(/cross midnight/);
  });

  it('rejects an activity it does not book', () => {
    try {
      entry({ number: null, activity: 'fishing' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.details.known).toEqual(NON_TICKET_ACTIVITIES);
    }
  });

  it('rejects a missing locator', () => {
    expect(() => entry({ locatorId: '' })).toThrow(/locatorId is required/);
  });
});

describe('dayEntries and overlaps', () => {
  const entries = [
    entry({ from: '2024-03-15T09:00', to: '2024-03-15T10:00' }),
    entry(),
    entry({ locatorId: 'loc-2' }),
    entry({ from: '2024-03-16T07:00', to: '2024-03-16T08:00' }),
  ];

  it('picks out one locator on one day, in order', () => {
    const mine = dayEntries(entries, 'LOC-14', '2024-03-15');
    expect(mine.map((held) => held.from)).toEqual(['2024-03-15T07:00', '2024-03-15T09:00']);
  });

  it('finds nothing for a day nobody worked', () => {
    expect(dayEntries(entries, 'loc-14', '2024-03-17')).toEqual([]);
  });

  it('finds entries that overlap', () => {
    const clash = [entry(), entry({ from: '2024-03-15T07:30', to: '2024-03-15T08:30' })];
    expect(overlaps(clash)).toHaveLength(1);
  });

  it('accepts entries that only touch', () => {
    const touching = [entry(), entry({ from: '2024-03-15T08:00', to: '2024-03-15T09:00' })];
    expect(overlaps(touching)).toEqual([]);
  });
});

describe('daySummary', () => {
  const entries = [
    entry(),
    entry({ from: '2024-03-15T08:00', to: '2024-03-15T09:00', number: 'B240315000421' }),
    entry({ from: '2024-03-15T09:00', to: '2024-03-15T09:30', number: null, activity: 'travel' }),
    entry({ from: '2024-03-15T09:30', to: '2024-03-15T10:00', number: null, activity: 'break' }),
  ];

  it('splits ticket time from everything else', () => {
    const summary = daySummary(entries, 'loc-14', '2024-03-15');
    expect(summary.ticketMinutes).toBe(120);
    expect(summary.otherMinutes).toBe(60);
    expect(summary.totalMinutes).toBe(180);
    expect(summary.tickets).toBe(2);
  });

  it('splits the time by activity', () => {
    expect(daySummary(entries, 'loc-14', '2024-03-15').byActivity).toEqual({
      TICKET: 120,
      TRAVEL: 30,
      BREAK: 30,
    });
  });

  it('works the productivity numbers out', () => {
    const summary = daySummary(entries, 'loc-14', '2024-03-15');
    expect(summary.ticketsPerHour).toBe(1);
    expect(summary.utilisation).toBeCloseTo(2 / 3, 6);
  });

  it('counts a ticket once however many entries it has', () => {
    const twice = [entry(), entry({ from: '2024-03-15T11:00', to: '2024-03-15T12:00' })];
    expect(daySummary(twice, 'loc-14', '2024-03-15').tickets).toBe(1);
  });

  it('summarises an empty day without dividing by zero', () => {
    const summary = daySummary([], 'loc-14', '2024-03-15');
    expect(summary.entries).toBe(0);
    expect(summary.ticketsPerHour).toBe(0);
    expect(summary.utilisation).toBe(0);
  });
});

describe('minutesOnTicket and daysWorked', () => {
  const entries = [
    entry(),
    entry({ locatorId: 'loc-2', from: '2024-03-15T10:00', to: '2024-03-15T10:30' }),
    entry({ from: '2024-03-16T07:00', to: '2024-03-16T08:00', number: 'B240315000421' }),
  ];

  it('adds every locator time on one ticket', () => {
    expect(minutesOnTicket(entries, 'b240315000420')).toBe(90);
    expect(minutesOnTicket(entries, 'B240315000999')).toBe(0);
  });

  it('lists the days a locator worked', () => {
    expect(daysWorked(entries, 'loc-14')).toEqual(['2024-03-15', '2024-03-16']);
    expect(daysWorked(entries, 'loc-9')).toEqual([]);
  });
});
