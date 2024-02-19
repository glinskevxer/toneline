import { describe, expect, it } from 'vitest';
import { WorkSchedule } from '../../src/time/workhours.js';
import { Calendar } from '../../src/time/calendar.js';
import { ScheduleError } from '../../src/core/errors.js';

const calendar = new Calendar({
  holidays: [{ kind: 'fixed', month: 7, day: 4, name: 'independence day' }],
});

function schedule(overrides = {}) {
  return new WorkSchedule({ calendar, ...overrides });
}

describe('WorkSchedule construction', () => {
  it('defaults to a weekday desk', () => {
    const desk = schedule();
    expect(desk.isOpen('2024-03-18T08:00')).toBe(true);
    expect(desk.isOpen('2024-03-16T08:00')).toBe(false);
  });

  it('rejects a calendar that is not one', () => {
    expect(() => new WorkSchedule({ calendar: {} })).toThrow(/Calendar instance/);
  });

  it('rejects a window that closes before it opens', () => {
    expect(() => schedule({ hours: { monday: { open: '17:00', close: '07:00' } } })).toThrow(
      /close after it opens/
    );
  });

  it('rejects a window with a missing side', () => {
    expect(() => schedule({ hours: { monday: { open: '07:00' } } })).toThrow(/HH:MM/);
  });

  it('rejects a schedule with no windows', () => {
    expect(() => schedule({ hours: {} })).toThrow(/no working windows/);
  });
});

describe('windowOn and isOpen', () => {
  const desk = schedule();

  it('shuts on a holiday', () => {
    expect(desk.windowOn('2024-07-04')).toBeNull();
    expect(desk.isOpen('2024-07-04T09:00')).toBe(false);
  });

  it('shuts on a weekday with no window configured', () => {
    const partial = schedule({ hours: { monday: { open: '08:00', close: '12:00' } } });
    expect(partial.windowOn('2024-03-19')).toBeNull();
    expect(partial.windowOn('2024-03-18')).toEqual({ open: 480, close: 720 });
  });

  it('treats the closing minute as shut', () => {
    expect(desk.isOpen('2024-03-18T16:59')).toBe(true);
    expect(desk.isOpen('2024-03-18T17:00')).toBe(false);
    expect(desk.isOpen('2024-03-18T06:59')).toBe(false);
  });
});

describe('nextOpen', () => {
  const desk = schedule();

  it('leaves an open minute alone', () => {
    expect(desk.nextOpen('2024-03-18T09:15')).toBe('2024-03-18T09:15');
  });

  it('advances from before opening on the same day', () => {
    expect(desk.nextOpen('2024-03-18T05:00')).toBe('2024-03-18T07:00');
  });

  it('rolls over a weekend', () => {
    expect(desk.nextOpen('2024-03-15T18:00')).toBe('2024-03-18T07:00');
  });

  it('rolls over a holiday', () => {
    expect(desk.nextOpen('2024-07-03T18:00')).toBe('2024-07-05T07:00');
  });

  it('gives up when the desk never opens again', () => {
    const shut = new WorkSchedule({
      calendar: new Calendar({ weekend: [0, 1, 2, 3, 4, 5, 6] }),
      hours: { monday: { open: '07:00', close: '17:00' } },
    });
    expect(() => shut.nextOpen('2024-03-18T08:00')).toThrow(/never opens again/);
  });
});

describe('addWorkingMinutes', () => {
  const desk = schedule();

  it('stays inside one day', () => {
    expect(desk.addWorkingMinutes('2024-03-18T08:00', 90)).toBe('2024-03-18T09:30');
  });

  it('starts the clock at opening when handed a closed minute', () => {
    expect(desk.addWorkingMinutes('2024-03-18T05:00', 60)).toBe('2024-03-18T08:00');
    expect(desk.addWorkingMinutes('2024-03-18T05:00', 0)).toBe('2024-03-18T07:00');
  });

  it('spills over to the next working day', () => {
    expect(desk.addWorkingMinutes('2024-03-18T16:00', 120)).toBe('2024-03-19T08:00');
  });

  it('rolls a full day exactly on to the next opening', () => {
    expect(desk.addWorkingMinutes('2024-03-18T07:00', 600)).toBe('2024-03-19T07:00');
  });

  it('skips a weekend and a holiday', () => {
    expect(desk.addWorkingMinutes('2024-07-03T16:00', 120)).toBe('2024-07-05T08:00');
  });

  it('adds working hours', () => {
    expect(desk.addWorkingHours('2024-03-18T08:00', 2)).toBe('2024-03-18T10:00');
  });

  it('rejects a negative or fractional span', () => {
    expect(() => desk.addWorkingMinutes('2024-03-18T08:00', -5)).toThrow(ScheduleError);
    expect(() => desk.addWorkingHours('2024-03-18T08:00', 1.5)).toThrow(/whole number/);
  });
});

describe('workingMinutesBetween', () => {
  const desk = schedule();

  it('measures inside one day', () => {
    expect(desk.workingMinutesBetween('2024-03-18T08:00', '2024-03-18T11:30')).toBe(210);
  });

  it('clips to the open window at both ends', () => {
    expect(desk.workingMinutesBetween('2024-03-18T05:00', '2024-03-18T23:00')).toBe(600);
  });

  it('adds up across days and skips the weekend', () => {
    expect(desk.workingMinutesBetween('2024-03-15T16:00', '2024-03-18T08:00')).toBe(120);
  });

  it('is zero for a backwards or empty span', () => {
    expect(desk.workingMinutesBetween('2024-03-18T11:00', '2024-03-18T08:00')).toBe(0);
    expect(desk.workingMinutesBetween('2024-03-18T08:00', '2024-03-18T08:00')).toBe(0);
  });

  it('is zero across a shut stretch', () => {
    expect(desk.workingMinutesBetween('2024-03-16T08:00', '2024-03-17T18:00')).toBe(0);
  });

  it('reports the minutes available on a date', () => {
    expect(desk.minutesAvailableOn('2024-03-18')).toBe(600);
    expect(desk.minutesAvailableOn('2024-03-16')).toBe(0);
  });
});
