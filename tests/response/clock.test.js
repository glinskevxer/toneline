import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLOCK_POLICY,
  clockPolicy,
  responseDueAt,
  minutesLate,
  isOnTime,
  minutesRemaining,
  clockBucket,
  byDeadline,
} from '../../src/response/clock.js';
import { buildTicket } from '../../src/ticket/record.js';
import { Calendar } from '../../src/time/calendar.js';
import { WorkSchedule } from '../../src/time/workhours.js';
import { PolicyError } from '../../src/config/policies.js';

const calendar = new Calendar();
const schedule = new WorkSchedule({ calendar });

function ticket(overrides = {}) {
  return buildTicket({
    number: 'B240315000420',
    type: 'NORMAL',
    takenAt: '2024-03-13T09:00',
    address: '1420 NW 23RD ST',
    ...overrides,
  });
}

describe('clockPolicy', () => {
  it('ships defaults and merges', () => {
    expect(DEFAULT_CLOCK_POLICY.capAtLawfulStart).toBe(true);
    expect(clockPolicy({ graceMinutes: 15 }).capAtLawfulStart).toBe(true);
  });

  it('rejects a bad grace', () => {
    expect(() => clockPolicy({ graceMinutes: -1 })).toThrow(PolicyError);
    expect(() => clockPolicy({ graceMinutes: 1.5 })).toThrow(/whole number at or above zero/);
  });
});

describe('responseDueAt', () => {
  it('caps a normal ticket at the lawful start', () => {
    expect(responseDueAt(ticket(), { calendar })).toBe('2024-03-15T09:00');
  });

  it('uses the plain hours when they land first', () => {
    const friday = ticket({ takenAt: '2024-03-15T09:00' });
    expect(responseDueAt(friday, { calendar })).toBe('2024-03-17T09:00');
  });

  it('does not let the cap swallow an immediate ticket', () => {
    const urgent = ticket({ type: 'EMERGENCY', takenAt: '2024-03-13T09:00' });
    expect(responseDueAt(urgent, { calendar })).toBe('2024-03-13T11:00');
    const second = ticket({ type: 'SECOND', takenAt: '2024-03-13T09:00' });
    expect(responseDueAt(second, { calendar })).toBe('2024-03-14T09:00');
  });

  it('gives an emergency two hours from receipt', () => {
    const urgent = ticket({ type: 'EMERGENCY', takenAt: '2024-03-16T22:15' });
    expect(responseDueAt(urgent, { calendar })).toBe('2024-03-17T00:15');
  });

  it('runs a meet clock only while the desk is open', () => {
    const meet = ticket({ type: 'MEET', takenAt: '2024-03-15T16:00' });
    expect(responseDueAt(meet, { calendar, schedule })).toBe('2024-03-19T16:00');
  });

  it('runs a design clock on working hours with no lawful start cap', () => {
    const design = ticket({ type: 'DESIGN', takenAt: '2024-03-15T09:00' });
    expect(responseDueAt(design, { calendar, schedule })).toBe('2024-04-18T09:00');
  });

  it('builds its own schedule when none was handed in', () => {
    const meet = ticket({ type: 'MEET', takenAt: '2024-03-15T16:00' });
    expect(responseDueAt(meet, { calendar })).toBe('2024-03-19T16:00');
  });

  it('rejects a schedule that is not one', () => {
    const meet = ticket({ type: 'MEET' });
    expect(() => responseDueAt(meet, { calendar, schedule: {} })).toThrow(/WorkSchedule instance/);
  });

  it('lets the cap be turned off', () => {
    const policy = clockPolicy({ capAtLawfulStart: false });
    expect(responseDueAt(ticket(), { calendar, policy })).toBe('2024-03-15T09:00');
    const late = ticket({ takenAt: '2024-03-13T18:00' });
    expect(responseDueAt(late, { calendar, policy })).toBe('2024-03-15T18:00');
    expect(responseDueAt(late, { calendar })).toBe('2024-03-15T18:00');
  });

  it('reads the received time rather than the taken time', () => {
    const held = ticket({ receivedAt: '2024-03-13T13:00' });
    expect(
      responseDueAt(held, { calendar, policy: clockPolicy({ capAtLawfulStart: false }) })
    ).toBe('2024-03-15T13:00');
  });
});

describe('lateness', () => {
  const held = ticket();

  it('counts minutes either side of the deadline', () => {
    expect(minutesLate(held, '2024-03-15T09:30', { calendar })).toBe(30);
    expect(minutesLate(held, '2024-03-15T08:00', { calendar })).toBe(-60);
    expect(minutesLate(held, '2024-03-15T09:00', { calendar })).toBe(0);
  });

  it('honours a grace period', () => {
    const policy = clockPolicy({ graceMinutes: 60 });
    expect(minutesLate(held, '2024-03-15T09:30', { calendar, policy })).toBe(-30);
    expect(isOnTime(held, '2024-03-15T09:30', { calendar, policy })).toBe(true);
  });

  it('answers the on time question', () => {
    expect(isOnTime(held, '2024-03-15T09:00', { calendar })).toBe(true);
    expect(isOnTime(held, '2024-03-15T09:01', { calendar })).toBe(false);
  });

  it('counts the minutes left', () => {
    expect(minutesRemaining(held, '2024-03-15T08:00', { calendar })).toBe(60);
    expect(minutesRemaining(held, '2024-03-15T10:00', { calendar })).toBe(-60);
  });
});

describe('clockBucket', () => {
  const held = ticket();

  it('buckets an answered ticket', () => {
    expect(
      clockBucket(held, { at: '2024-03-15T12:00', postedAt: '2024-03-15T08:00', calendar })
    ).toBe('answered');
    expect(
      clockBucket(held, { at: '2024-03-15T12:00', postedAt: '2024-03-15T10:00', calendar })
    ).toBe('late');
  });

  it('buckets an unanswered ticket', () => {
    expect(clockBucket(held, { at: '2024-03-15T05:00', calendar })).toBe('due');
    expect(clockBucket(held, { at: '2024-03-15T08:00', calendar })).toBe('due soon');
    expect(clockBucket(held, { at: '2024-03-15T09:30', calendar })).toBe('overdue');
  });
});

describe('byDeadline', () => {
  it('puts the closest deadline first', () => {
    const urgent = ticket({
      number: 'B240315000421',
      type: 'EMERGENCY',
      takenAt: '2024-03-13T09:00',
    });
    const normal = ticket();
    expect(byDeadline([normal, urgent], { calendar }).map((t) => t.number)).toEqual([
      'B240315000421',
      'B240315000420',
    ]);
  });

  it('breaks a tie on the type rank', () => {
    const emergency = ticket({
      number: 'B240315000421',
      type: 'EMERGENCY',
      takenAt: '2024-03-13T07:00',
    });
    const second = ticket({ number: 'B240315000422', type: 'SECOND', takenAt: '2024-03-12T09:00' });
    const order = byDeadline([second, emergency], { calendar }).map((t) => t.number);
    expect(order[0]).toBe('B240315000421');
  });

  it('leaves the list it was given alone', () => {
    const list = [ticket()];
    byDeadline(list, { calendar });
    expect(list).toHaveLength(1);
  });
});
