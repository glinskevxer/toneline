import { describe, expect, it } from 'vitest';
import {
  parseStamp,
  isStamp,
  formatStamp,
  toMinuteNumber,
  fromMinuteNumber,
  addMinutes,
  addHours,
  minutesBetween,
  hoursBetween,
  compareStamps,
  dateOf,
  timeOf,
  startOfDay,
  endOfDay,
  parseClockTime,
  formatClockTime,
  atTime,
  shiftDays,
  startOfMonth,
} from '../../src/time/stamp.js';
import { ScheduleError } from '../../src/core/errors.js';

describe('parseStamp', () => {
  it('splits a timestamp', () => {
    expect(parseStamp('2024-03-15T07:45')).toEqual({
      date: '2024-03-15',
      hour: 7,
      minute: 45,
      minuteOfDay: 465,
    });
  });

  it('accepts a space separator and drops seconds', () => {
    expect(parseStamp('2024-03-15 07:45:31').minuteOfDay).toBe(465);
  });

  it('rejects a non string', () => {
    expect(() => parseStamp(1234)).toThrow(ScheduleError);
  });

  it('rejects a mis-shaped value', () => {
    expect(() => parseStamp('2024-03-15')).toThrow(/YYYY-MM-DDTHH:MM/);
  });

  it('rejects an impossible wall clock time', () => {
    expect(() => parseStamp('2024-03-15T24:00')).toThrow(/impossible wall clock/);
    expect(() => parseStamp('2024-03-15T07:60')).toThrow(/impossible wall clock/);
  });

  it('rejects an impossible date inside a well shaped stamp', () => {
    expect(() => parseStamp('2023-02-29T07:00')).toThrow(/day is outside/);
  });
});

describe('isStamp', () => {
  it('answers without throwing', () => {
    expect(isStamp('2024-03-15T07:45')).toBe(true);
    expect(isStamp('nope')).toBe(false);
  });
});

describe('formatStamp', () => {
  it('pads the wall clock', () => {
    expect(formatStamp('2024-03-15', 65)).toBe('2024-03-15T01:05');
  });

  it('rejects a minute of day outside the day', () => {
    expect(() => formatStamp('2024-03-15', 1440)).toThrow(/0 to 1439/);
    expect(() => formatStamp('2024-03-15', -1)).toThrow(/0 to 1439/);
  });
});

describe('minute numbers', () => {
  it('round trips', () => {
    for (const stamp of ['1999-12-31T23:59', '2024-02-29T00:00', '2025-08-10T13:07']) {
      expect(fromMinuteNumber(toMinuteNumber(stamp))).toBe(stamp);
    }
  });

  it('orders across midnight', () => {
    expect(toMinuteNumber('2024-03-16T00:00')).toBeGreaterThan(toMinuteNumber('2024-03-15T23:59'));
  });

  it('rejects a fractional minute number', () => {
    expect(() => fromMinuteNumber(0.25)).toThrow(/integer/);
  });
});

describe('arithmetic', () => {
  it('adds minutes across a day boundary', () => {
    expect(addMinutes('2024-03-15T23:50', 20)).toBe('2024-03-16T00:10');
  });

  it('subtracts minutes across a day boundary', () => {
    expect(addMinutes('2024-03-16T00:10', -20)).toBe('2024-03-15T23:50');
  });

  it('adds hours', () => {
    expect(addHours('2024-03-15T07:45', 48)).toBe('2024-03-17T07:45');
  });

  it('rejects fractional offsets', () => {
    expect(() => addMinutes('2024-03-15T07:45', 1.5)).toThrow(/integer/);
    expect(() => addHours('2024-03-15T07:45', 0.5)).toThrow(/integer/);
  });

  it('counts minutes and hours between', () => {
    expect(minutesBetween('2024-03-15T07:00', '2024-03-15T09:30')).toBe(150);
    expect(hoursBetween('2024-03-15T07:00', '2024-03-15T09:30')).toBe(2);
    expect(hoursBetween('2024-03-15T09:30', '2024-03-15T07:00')).toBe(-2);
  });

  it('compares timestamps', () => {
    expect(compareStamps('2024-03-15T07:00', '2024-03-15T08:00')).toBeLessThan(0);
    expect(compareStamps('2024-03-15T08:00', '2024-03-15T08:00')).toBe(0);
  });
});

describe('parts and boundaries', () => {
  it('reads the date and the wall clock', () => {
    expect(dateOf('2024-03-15T07:45')).toBe('2024-03-15');
    expect(timeOf('2024-03-15T07:05')).toBe('07:05');
  });

  it('finds the ends of the day', () => {
    expect(startOfDay('2024-03-15T07:45')).toBe('2024-03-15T00:00');
    expect(endOfDay('2024-03-15T07:45')).toBe('2024-03-15T23:59');
  });

  it('finds the start of the month', () => {
    expect(startOfMonth('2024-03-15T07:45')).toBe('2024-03-01T00:00');
  });

  it('shifts by whole days keeping the clock', () => {
    expect(shiftDays('2024-02-28T07:45', 2)).toBe('2024-03-01T07:45');
  });
});

describe('clock times', () => {
  it('parses with and without a leading zero', () => {
    expect(parseClockTime('07:30')).toBe(450);
    expect(parseClockTime('7:30')).toBe(450);
  });

  it('rejects a non string or bad shape', () => {
    expect(() => parseClockTime(730)).toThrow(/must be a string/);
    expect(() => parseClockTime('730')).toThrow(/HH:MM/);
  });

  it('rejects a time outside the day', () => {
    expect(() => parseClockTime('24:00')).toThrow(/outside the day/);
    expect(() => parseClockTime('12:75')).toThrow(/outside the day/);
  });

  it('formats a minute of day', () => {
    expect(formatClockTime(450)).toBe('07:30');
    expect(() => formatClockTime(1440)).toThrow(/0 to 1439/);
  });

  it('places a clock time on a date', () => {
    expect(atTime('2024-03-15', '16:00')).toBe('2024-03-15T16:00');
  });
});
